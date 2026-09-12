/**
 * Scene understanding on the embedded real photo — road / building / person
 * detection for "smart scene placement" (see the Areas panel).
 *
 * Unlike the sky heuristics in `sky.ts`, these classes have no reliable
 * texture/colour signature of their own (a road can be asphalt, cobble or
 * dirt; a building can be any material; a person is small and varied) — so
 * this reaches for a real semantic segmentation model, Cityscapes-trained
 * DeepLabv3 via `@tensorflow-models/deeplab`, run entirely client-side.
 * Its ~2MB of weights are fetched from Google's model hub on first use and
 * cached by the browser afterwards — the one place this app reaches the
 * network, everything else stays local per the app's privacy notice.
 */
import { overlayGeometry, type OverlayAlignment, type VisibleCropRect } from './render';

/** Index into the Cityscapes label set the model was trained on. */
const CITYSCAPES_INDEX = { road: 0, building: 2, vegetation: 8, terrain: 9, sky: 10, person: 11 } as const;
export type SceneClassName = keyof typeof CITYSCAPES_INDEX;

export interface SceneGrid {
  /** The model's internal grid — aspect-preserving resize of the visible
   *  photo to fit within 513px on the long side, *not* the photo's own
   *  resolution. `blobToVisiblePoint` accounts for this. */
  width: number;
  height: number;
  /** Cityscapes class index per cell, row-major, length `width * height`. */
  labels: Int32Array;
}

export interface SceneBlob {
  /** Centroid, in grid cells. */
  x: number;
  y: number;
  /** Cell count — how much of the frame this blob covers. */
  size: number;
}

type DeeplabModel = { predict(input: unknown): { shape: number[]; data(): Promise<ArrayLike<number>>; dispose(): void } };
let modelPromise: Promise<DeeplabModel> | null = null;

/** Loads (and caches) the Cityscapes DeepLab model. Call once up front if
 *  you want to separate "downloading the model" from "running it" in the UI. */
export function loadSceneModel(): Promise<DeeplabModel> {
  if (!modelPromise) {
    // `@tensorflow-models/deeplab` only depends on tfjs-core + tfjs-converter,
    // neither of which registers a backend (cpu/webgl) — that's a side effect
    // of importing `@tensorflow/tfjs` itself. Without it, execution fails
    // with "No backend found in registry".
    modelPromise = Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/deeplab')]).then(
      ([, deeplab]) => deeplab.load({ base: 'cityscapes', quantizationBytes: 2 }) as Promise<DeeplabModel>,
    );
  }
  return modelPromise;
}

/** Runs the model over the real photo (as a canvas) and returns its raw
 *  per-cell class grid. Null on failure (e.g. no WebGL, model fetch failed). */
export async function segmentScene(visiblePhoto: HTMLCanvasElement | OffscreenCanvas): Promise<SceneGrid | null> {
  try {
    const model = await loadSceneModel();
    const raw = model.predict(visiblePhoto);
    const [height, width] = raw.shape;
    const flat = await raw.data();
    raw.dispose();
    return { width, height, labels: Int32Array.from(flat) };
  } catch (err) {
    console.error('Scene segmentation failed', err);
    return null;
  }
}

export interface FindBlobsOptions {
  /** Blobs smaller than this fraction of the grid are dropped as noise. */
  minCellFraction?: number;
  /** One round of morphological closing (dilate then erode, 4-neighbourhood)
   *  on the class mask before flood-filling. Reconnects a single instance
   *  that the model's per-pixel noise has split into disjoint fragments
   *  (e.g. a person's legs cut off from their torso by a shadow edge) —
   *  without it those fragments surface as separate, spurious instances. */
  closeGaps?: boolean;
  /** After filtering, blobs whose centroids are closer than this fraction of
   *  the grid diagonal are merged into one (size-weighted centroid). Catches
   *  fragments too far apart for `closeGaps`'s single-cell closing to bridge. */
  mergeDistanceFraction?: number;
}

/** Dilates (or eldes, when `shrink`) a boolean mask by one 4-connected cell. */
function morph(mask: Uint8Array, width: number, height: number, shrink: boolean): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!shrink) {
        let v = mask[idx];
        if (!v && x > 0) v = v || mask[idx - 1];
        if (!v && x < width - 1) v = v || mask[idx + 1];
        if (!v && y > 0) v = v || mask[idx - width];
        if (!v && y < height - 1) v = v || mask[idx + width];
        out[idx] = v;
      } else {
        let v = mask[idx];
        if (v && x > 0) v = v && mask[idx - 1];
        if (v && x < width - 1) v = v && mask[idx + 1];
        if (v && y > 0) v = v && mask[idx - width];
        if (v && y < height - 1) v = v && mask[idx + width];
        out[idx] = v;
      }
    }
  }
  return out;
}

function mergeNearbyBlobs(blobs: SceneBlob[], maxDistance: number): SceneBlob[] {
  const merged = blobs.map((b) => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const dx = merged[i].x - merged[j].x;
        const dy = merged[i].y - merged[j].y;
        if (Math.hypot(dx, dy) > maxDistance) continue;
        const a = merged[i], b = merged[j];
        const size = a.size + b.size;
        merged[i] = { x: (a.x * a.size + b.x * b.size) / size, y: (a.y * a.size + b.y * b.size) / size, size };
        merged.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return merged;
}

/** 4-connected components of one class, largest first. Blobs smaller than
 *  `minCellFraction` of the grid are dropped as noise. See `FindBlobsOptions`
 *  for `closeGaps`/`mergeDistanceFraction`, which correct for the model
 *  segmenting *pixels*, not *instances*: same-class regions that touch in
 *  the photo (e.g. two adjacent buildings) always merge into one blob here,
 *  while a single noisy/occluded instance (e.g. one person) can split into
 *  several — these options only address the latter. */
export function findBlobs(grid: SceneGrid, className: SceneClassName, options: FindBlobsOptions = {}): SceneBlob[] {
  const { minCellFraction = 0.002, closeGaps = false, mergeDistanceFraction = 0 } = options;
  const classIndex = CITYSCAPES_INDEX[className];
  const { width, height, labels } = grid;
  const minCells = Math.max(4, Math.round(labels.length * minCellFraction));

  let mask: Uint8Array;
  if (closeGaps) {
    mask = new Uint8Array(labels.length);
    for (let i = 0; i < labels.length; i++) mask[i] = labels[i] === classIndex ? 1 : 0;
    mask = morph(morph(mask, width, height, false), width, height, true);
  } else {
    mask = new Uint8Array(labels.length);
    for (let i = 0; i < labels.length; i++) mask[i] = labels[i] === classIndex ? 1 : 0;
  }

  const visited = new Uint8Array(mask.length);
  const blobs: SceneBlob[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    let sumX = 0, sumY = 0, count = 0;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width, y = (idx / width) | 0;
      sumX += x; sumY += y; count++;
      const neighbors: number[] = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);
      for (const n of neighbors) {
        if (visited[n] || !mask[n]) continue;
        visited[n] = 1;
        stack.push(n);
      }
    }
    if (count >= minCells) blobs.push({ x: sumX / count, y: sumY / count, size: count });
  }

  const merged = mergeDistanceFraction > 0
    ? mergeNearbyBlobs(blobs, mergeDistanceFraction * Math.hypot(width, height))
    : blobs;
  return merged.sort((a, b) => b.size - a.size);
}

/**
 * Resamples the visible photo to the grid's own resolution and returns one
 * RGB triple per cell, aligned 1:1 with `SceneGrid.labels` — the colour
 * counterpart to the model's per-cell class, used to tell apart same-class
 * regions the model itself can't (see `findBlobsBySurface`).
 */
export function sampleGridColors(visiblePhoto: HTMLCanvasElement | OffscreenCanvas, grid: SceneGrid): Uint8ClampedArray {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(grid.width, grid.height) : document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.drawImage(visiblePhoto, 0, 0, grid.width, grid.height);
  return ctx.getImageData(0, 0, grid.width, grid.height).data;
}

/**
 * Like `findBlobs`, but additionally splits a same-class region wherever the
 * *surface* changes sharply — e.g. two adjacent buildings with differently
 * coloured facades, which the semantic mask alone reports as a single
 * building. Cells stay connected only if they share the class *and* their
 * colour (sampled via `sampleGridColors`) is close to their neighbour's;
 * comparing only adjacent cells (rather than to a whole-blob average) lets a
 * gradual change (shading, weathering) pass while a real material/colour
 * edge still breaks the flood fill.
 */
export function findBlobsBySurface(
  grid: SceneGrid,
  className: SceneClassName,
  colors: Uint8ClampedArray,
  minCellFraction = 0.004,
  colorThreshold = 55,
): SceneBlob[] {
  const classIndex = CITYSCAPES_INDEX[className];
  const { width, height, labels } = grid;
  const visited = new Uint8Array(labels.length);
  const minCells = Math.max(4, Math.round(labels.length * minCellFraction));
  const blobs: SceneBlob[] = [];

  const colorDelta = (a: number, b: number) => {
    const dr = colors[a * 4] - colors[b * 4];
    const dg = colors[a * 4 + 1] - colors[b * 4 + 1];
    const db = colors[a * 4 + 2] - colors[b * 4 + 2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== classIndex || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    let sumX = 0, sumY = 0, count = 0;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width, y = (idx / width) | 0;
      sumX += x; sumY += y; count++;
      const neighbors: number[] = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);
      for (const n of neighbors) {
        if (visited[n] || labels[n] !== classIndex) continue;
        if (colorDelta(idx, n) > colorThreshold) continue;
        visited[n] = 1;
        stack.push(n);
      }
    }
    if (count >= minCells) blobs.push({ x: sumX / count, y: sumY / count, size: count });
  }
  return blobs.sort((a, b) => b.size - a.size);
}

/**
 * Maps a blob centroid (grid cells) to a thermal sensor pixel: grid → crop
 * pixels → real photo pixels (the crop's own offset within the full photo) →
 * sensor pixels (inverting the overlay's sensor→photo transform, the same
 * geometry the thermal/visible compositing and the sky mask use).
 *
 * `crop` describes where the segmented canvas (which may be a sub-rect of
 * the full photo, see `overlayVisibleCropRect`) sits within the full photo;
 * pass `{ x: 0, y: 0, width: visibleWidth, height: visibleHeight }` when the
 * whole photo was segmented.
 */
export function blobToThermalPoint(
  blob: SceneBlob,
  grid: SceneGrid,
  crop: VisibleCropRect,
  visibleWidth: number,
  visibleHeight: number,
  thermalWidth: number,
  thermalHeight: number,
  alignment: OverlayAlignment,
): { x: number; y: number } {
  const vx = blob.x * (crop.width / grid.width) + crop.x;
  const vy = blob.y * (crop.height / grid.height) + crop.y;
  const { scale, offsetX, offsetY } = overlayGeometry(visibleWidth, visibleHeight, thermalWidth, thermalHeight, alignment);
  return {
    x: Math.min(thermalWidth - 1, Math.max(0, (vx - offsetX) / scale)),
    y: Math.min(thermalHeight - 1, Math.max(0, (vy - offsetY) / scale)),
  };
}
