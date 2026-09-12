/**
 * Sky detection on the embedded real photo, used to exclude the sky from the
 * "smart" min/max area placement (see `smartMinMaxPlacement` in `roi.ts`).
 *
 * The thermal signal alone is a weak basis for this: an optically blurred
 * sky/roofline transition, or a sky-temperature building material, can fool
 * a temperature-only heuristic. The real photo carries a much stronger,
 * independent signal — sky is visually smooth (near-zero local contrast)
 * whether it's blue, hazy white, overcast grey or a sunset gradient, unlike
 * foliage, buildings or terrain, which all carry fine detail. That texture
 * cue (not colour) is what this module grows a region on, so it isn't a
 * "remove the blue" filter and doesn't fail on an overcast sky.
 */
import { createCanvas, context2d, overlayGeometry, type OverlayAlignment } from './render';

export interface VisibleSkyMask { mask: Uint8Array; width: number; height: number }

/** Segments the sky in a real photo. Returns null when no distinct smooth
 *  top-connected region is found (indoor shots, a sky-less crop). */
export function detectVisibleSkyMask(
  visible: CanvasImageSource & { width: number; height: number },
): VisibleSkyMask | null {
  const w = visible.width, h = visible.height;
  if (!w || !h) return null;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  ctx.drawImage(visible, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  return detectSkyMaskFromPixels(data, w, h);
}

/** The pixel-level core of `detectVisibleSkyMask`, split out so it can run
 *  without a canvas (tests, or any RGBA buffer from elsewhere). */
export function detectSkyMaskFromPixels(data: Uint8ClampedArray, w: number, h: number): VisibleSkyMask | null {
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  // Local texture: the largest luminance jump to an immediate neighbour —
  // a cheap edge/detail proxy. Sky sits in the smoothest part of the frame.
  const texture = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let g = 0;
      if (x > 0) g = Math.max(g, Math.abs(lum[i] - lum[i - 1]));
      if (x < w - 1) g = Math.max(g, Math.abs(lum[i] - lum[i + 1]));
      if (y > 0) g = Math.max(g, Math.abs(lum[i] - lum[i - w]));
      if (y < h - 1) g = Math.max(g, Math.abs(lum[i] - lum[i + w]));
      texture[i] = g;
    }
  }
  const sortedTex = Float32Array.from(texture).sort();
  const textureThreshold = Math.max(6, sortedTex[Math.floor(sortedTex.length * 0.35)]);

  // Region growing from the whole top row: smooth AND colour-consistent with
  // the region's own running average colour, so a smooth pale wall below the
  // roofline doesn't get swallowed once the colour has clearly moved on.
  const sky = new Uint8Array(w * h);
  const stack: number[] = [];
  let sumR = 0, sumG = 0, sumB = 0, n = 0;
  for (let x = 0; x < w; x++) {
    const i = x; // y = 0
    if (texture[i] > textureThreshold) continue;
    sky[i] = 1; stack.push(i);
    const p = i * 4;
    sumR += data[p]; sumG += data[p + 1]; sumB += data[p + 2]; n++;
  }
  let meanR = n ? sumR / n : 0, meanG = n ? sumG / n : 0, meanB = n ? sumB / n : 0;
  const colorTolerance = 45; // generous — sky can gradient a fair bit top to bottom

  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w, y = (idx / w) | 0;
    const neighbors: number[] = [];
    if (x > 0) neighbors.push(idx - 1);
    if (x < w - 1) neighbors.push(idx + 1);
    if (y > 0) neighbors.push(idx - w);
    if (y < h - 1) neighbors.push(idx + w);
    for (const j of neighbors) {
      if (sky[j] || texture[j] > textureThreshold) continue;
      const p = j * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      if (Math.abs(r - meanR) + Math.abs(g - meanG) + Math.abs(b - meanB) > colorTolerance) continue;
      sky[j] = 1; stack.push(j);
      sumR += r; sumG += g; sumB += b; n++;
      meanR = sumR / n; meanG = sumG / n; meanB = sumB / n;
    }
  }

  if (!n || n > w * h * 0.92) return null;
  return { mask: sky, width: w, height: h };
}

/**
 * Resamples a visible-image sky mask onto the thermal sensor grid, using the
 * same sensor→visible-pixel transform the overlay renderer uses.
 */
export function skyMaskToThermalGrid(
  visSky: VisibleSkyMask,
  thermalWidth: number,
  thermalHeight: number,
  alignment: OverlayAlignment,
): Uint8Array {
  const { scale, offsetX, offsetY } = overlayGeometry(visSky.width, visSky.height, thermalWidth, thermalHeight, alignment);
  const out = new Uint8Array(thermalWidth * thermalHeight);
  for (let ty = 0; ty < thermalHeight; ty++) {
    const vy = Math.round(ty * scale + offsetY);
    if (vy < 0 || vy >= visSky.height) continue;
    for (let tx = 0; tx < thermalWidth; tx++) {
      const vx = Math.round(tx * scale + offsetX);
      if (vx < 0 || vx >= visSky.width) continue;
      if (visSky.mask[vy * visSky.width + vx]) out[ty * thermalWidth + tx] = 1;
    }
  }
  return out;
}
