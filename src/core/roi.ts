/**
 * ROI models, rasterisation and statistics — the port of `analysis/roi_models.py`
 * and the mask/statistics half of `core/roi_controller.py`.
 *
 * Coordinates are **thermal sensor pixels**, exactly as the desktop stores them
 * in its sidecar JSON (`_create_roi_mask` indexes `thermal_data` with them
 * directly). ROIs may extend outside the sensor; the mask clips, it does not
 * reject.
 */
import { computeTemperaturesAt, type ThermalParameters } from './planck';

export type RoiType = 'RectROI' | 'SpotROI' | 'PolygonROI';

interface RoiCommon {
  id: string;
  name: string;
  /** Per-ROI emissivity; temperatures are recomputed with it. */
  emissivity: number;
  /** Outline colour, `hsl(...)`. */
  color: string;
}

export interface RectRoi extends RoiCommon { type: 'RectROI'; x: number; y: number; width: number; height: number }
export interface SpotRoi extends RoiCommon { type: 'SpotROI'; x: number; y: number; radius: number }
export interface PolygonRoi extends RoiCommon { type: 'PolygonROI'; points: [number, number][] }
export type Roi = RectRoi | SpotRoi | PolygonRoi;

export interface RoiStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
  pixels: number;
  /** Sensor pixel holding the coldest / hottest sample in the ROI. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const DEFAULT_ROI_EMISSIVITY = 0.95;

/** `_generate_roi_color`: QColor.fromHsv(hue, 220, 255) stepping 55° per ROI. */
export function roiColor(index: number): string {
  return `hsl(${(index * 55) % 360}, 86%, 57%)`;
}

let counter = 0;
export function nextRoiId(): string {
  return `roi-${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

/** `get_bounds()` → [x1, y1, x2, y2]. */
export function roiBounds(roi: Roi): [number, number, number, number] {
  switch (roi.type) {
    case 'RectROI':
      return [roi.x, roi.y, roi.x + roi.width, roi.y + roi.height];
    case 'SpotROI':
      return [roi.x - roi.radius, roi.y - roi.radius, roi.x + roi.radius, roi.y + roi.radius];
    case 'PolygonROI': {
      if (!roi.points.length) return [0, 0, 0, 0];
      const xs = roi.points.map((p) => p[0]);
      const ys = roi.points.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
  }
}

/** Ray casting, matching `PolygonROI.contains_point` including its edge conventions. */
export function polygonContains(points: [number, number][], x: number, y: number): boolean {
  if (points.length < 3) return false;
  let inside = false;
  let j = points.length - 1;
  for (let i = 0; i < points.length; i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi !== yj && (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

/** Point-in-ROI test for hit detection and for the per-pixel probe. */
export function roiContains(roi: Roi, x: number, y: number): boolean {
  switch (roi.type) {
    case 'RectROI':
      return x >= roi.x && x <= roi.x + roi.width && y >= roi.y && y <= roi.y + roi.height;
    case 'SpotROI':
      return Math.hypot(x - roi.x, y - roi.y) <= roi.radius;
    case 'PolygonROI':
      return polygonContains(roi.points, x, y);
  }
}

/** Python's `int()` truncates toward zero — not `Math.floor`, which differs for negatives. */
const trunc = (v: number) => Math.trunc(v);

/**
 * Flat indices of the sensor pixels a ROI covers, reproducing `_create_roi_mask`
 * bit for bit — including its bounding boxes, its `int()` truncation and the
 * integer pixel coordinates used by the circle and polygon tests.
 */
export function roiMaskIndices(roi: Roi, width: number, height: number): Uint32Array {
  const out: number[] = [];
  const clampX = (v: number) => Math.max(0, Math.min(width, v));
  const clampY = (v: number) => Math.max(0, Math.min(height, v));

  if (roi.type === 'SpotROI') {
    const [bx1, by1, bx2, by2] = roiBounds(roi);
    const x1 = clampX(trunc(bx1)), y1 = clampY(trunc(by1));
    const x2 = clampX(trunc(bx2)), y2 = clampY(trunc(by2));
    const r2 = roi.radius * roi.radius;
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const dx = x - roi.x, dy = y - roi.y;
        if (dx * dx + dy * dy <= r2) out.push(y * width + x);
      }
    }
  } else if (roi.type === 'PolygonROI') {
    const [bx1, by1, bx2, by2] = roiBounds(roi);
    const x1 = clampX(trunc(bx1)), y1 = clampY(trunc(by1));
    const x2 = clampX(trunc(bx2)), y2 = clampY(trunc(by2));
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        if (polygonContains(roi.points, x, y)) out.push(y * width + x);
      }
    }
  } else {
    // Rectangles snap outwards, so a rect never loses a partially covered pixel.
    const x1 = clampX(Math.floor(roi.x)), y1 = clampY(Math.floor(roi.y));
    const x2 = clampX(Math.ceil(roi.x + roi.width)), y2 = clampY(Math.ceil(roi.y + roi.height));
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) out.push(y * width + x);
    }
  }
  return Uint32Array.from(out);
}

/**
 * Statistics over a ROI, recomputed from raw counts with the ROI's own
 * emissivity (`compute_roi_temperatures`). Returns null when the ROI covers no
 * valid pixel — the caller shows "N/A", as the desktop does.
 */
export function roiStatistics(
  roi: Roi,
  raw: Uint16Array,
  width: number,
  height: number,
  params: ThermalParameters,
): RoiStats | null {
  const indices = roiMaskIndices(roi, width, height);
  if (!indices.length) return null;

  const temps = computeTemperaturesAt(raw, indices, { ...params, Emissivity: roi.emissivity });
  const valid: number[] = [];
  let min = Infinity, max = -Infinity, minFlat = -1, maxFlat = -1, sum = 0;
  for (let i = 0; i < temps.length; i++) {
    const v = temps[i];
    if (Number.isNaN(v)) continue;
    valid.push(v);
    if (v < min) { min = v; minFlat = indices[i]; }
    if (v > max) { max = v; maxFlat = indices[i]; }
    sum += v;
  }
  if (!valid.length) return null;
  const mean = sum / valid.length;

  let sq = 0;
  for (const v of valid) sq += (v - mean) * (v - mean);
  const std = Math.sqrt(sq / valid.length); // numpy's population std

  const sorted = Float64Array.from(valid).sort();
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    min, max, mean, median, std, pixels: valid.length,
    minX: minFlat % width, minY: Math.trunc(minFlat / width),
    maxX: maxFlat % width, maxY: Math.trunc(maxFlat / width),
  };
}

export interface SmartPoint { x: number; y: number; value: number }
export interface SmartPlacement { min: SmartPoint; max: SmartPoint; skyExcluded: boolean }

/**
 * Thermal-only sky detection: a cold region connected to the top edge of the
 * frame, grown by region growing — a neighbour joins while it stays within a
 * noise/gradient tolerance of the region's own running average, and never
 * past the frame's overall median. The running average absorbs per-pixel
 * sensor noise and lets a tilted horizon or a gradual sky gradient through;
 * the median cap stops it from drifting past a sharp boundary into what's
 * clearly the warmer half of the scene.
 *
 * This is a fallback for when there's no real photo to work from — prefer
 * `detectVisibleSkyMask` (sky.ts) when one is available. Temperature alone
 * is a weak signal here: an optically blurred sky/roofline transition, or a
 * building material that happens to sit at sky temperature, can fool it.
 * Returns null when the top of the frame isn't distinctly, genuinely cold
 * (indoor shots, a sky-less crop) — see the two checks below.
 */
function detectThermalSkyMask(temps: Float64Array, width: number, height: number): Uint8Array | null {
  let count = 0;
  for (let i = 0; i < temps.length; i++) if (!Number.isNaN(temps[i])) count++;
  if (!count) return null;

  const valid = new Float64Array(count);
  for (let i = 0, j = 0; i < temps.length; i++) {
    const v = temps[i];
    if (!Number.isNaN(v)) valid[j++] = v;
  }
  const sorted = Float64Array.from(valid).sort();
  const median = sorted[sorted.length >> 1];
  const range = sorted[sorted.length - 1] - sorted[0];
  const tolerance = Math.max(1.5, range * 0.08);

  const sky = new Uint8Array(temps.length);
  const stack: number[] = [];
  let regionSum = 0, regionCount = 0;
  for (let x = 0; x < width; x++) {
    const v = temps[x]; // y = 0
    if (Number.isNaN(v) || v > median) continue;
    sky[x] = 1; stack.push(x);
    regionSum += v; regionCount++;
  }
  let regionMean = regionCount ? regionSum / regionCount : NaN;
  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % width, y = (idx / width) | 0;
    const neighbors: number[] = [];
    if (x > 0) neighbors.push(idx - 1);
    if (x < width - 1) neighbors.push(idx + 1);
    if (y > 0) neighbors.push(idx - width);
    if (y < height - 1) neighbors.push(idx + width);
    for (const n of neighbors) {
      if (sky[n]) continue;
      const v = temps[n];
      if (Number.isNaN(v) || v > median || Math.abs(v - regionMean) > tolerance) continue;
      sky[n] = 1;
      stack.push(n);
      regionSum += v; regionCount++;
      regionMean = regionSum / regionCount;
    }
  }

  let skyCount = 0;
  for (let i = 0; i < sky.length; i++) if (sky[i]) skyCount++;
  if (!skyCount) return null;

  // Growth mostly stops at a genuine sky/ground edge (a jump past `tolerance`).
  // On a smooth, sky-less gradient (an indoor ceiling-to-floor shot, say) it
  // instead rides the median cap with no real discontinuity. Two bulk checks
  // catch that, deliberately avoiding any single boundary pixel — a real
  // camera optically blurs the sky/roofline transition across a couple of
  // pixels, so one blurred edge pixel is a poor, noisy judge on its own:
  //  - band: real sky is a narrow band next to the frame's full dynamic
  //    range; a gradient sliced by the median cap instead spans a big chunk
  //    of it.
  //  - separation: the region's *bulk* (90th percentile) shouldn't reach
  //    into everything else's *bulk* (10th percentile).
  const skyVals: number[] = [];
  const restVals: number[] = [];
  let skyMin = Infinity, skyMax = -Infinity;
  for (let i = 0; i < temps.length; i++) {
    const v = temps[i];
    if (Number.isNaN(v)) continue;
    if (sky[i]) {
      skyVals.push(v);
      if (v < skyMin) skyMin = v;
      if (v > skyMax) skyMax = v;
    } else {
      restVals.push(v);
    }
  }
  skyVals.sort((a, b) => a - b);
  restVals.sort((a, b) => a - b);
  const isNarrowBand = range > 0 && (skyMax - skyMin) / range <= 0.3;
  const isSeparated =
    restVals.length > 0 &&
    skyVals[Math.floor(skyVals.length * 0.9)] <= restVals[Math.floor(restVals.length * 0.1)] + tolerance;
  const hasRealEdge = isNarrowBand && isSeparated;

  // A near-total "sky" means the heuristic misfired (e.g. a uniformly cold
  // indoor scene) — fall back to considering every pixel.
  const skyUsable = skyCount <= count * 0.92 && hasRealEdge;
  return skyUsable ? sky : null;
}

/**
 * Finds the coldest and hottest pixels, excluding the sky from the cold pick
 * — the sky is reliably the coldest thing in an outdoor shot but rarely the
 * point of interest. The hottest pixel is never excluded (sky is never hot).
 *
 * `externalSkyMask`, when given (thermal-grid-sized, from
 * `skyMaskToThermalGrid`), is trusted as-is — pass the real photo's sky mask
 * here whenever one is available, since it's far more reliable than the
 * thermal-only fallback (`detectThermalSkyMask`) used otherwise.
 */
export function smartMinMaxPlacement(
  temps: Float64Array,
  width: number,
  height: number,
  externalSkyMask?: Uint8Array | null,
): SmartPlacement | null {
  let count = 0;
  for (let i = 0; i < temps.length; i++) if (!Number.isNaN(temps[i])) count++;
  if (!count) return null;

  const sky = externalSkyMask ?? detectThermalSkyMask(temps, width, height);
  let skyCount = 0;
  if (sky) for (let i = 0; i < sky.length; i++) if (sky[i]) skyCount++;
  const skyUsable = !!sky && skyCount > 0 && skyCount <= count * 0.92;

  let maxV = -Infinity, maxIdx = -1;
  let minAnyV = Infinity, minAnyIdx = -1;
  let minColdOnlyV = Infinity, minColdOnlyIdx = -1;
  for (let i = 0; i < temps.length; i++) {
    const v = temps[i];
    if (Number.isNaN(v)) continue;
    if (v > maxV) { maxV = v; maxIdx = i; }
    if (v < minAnyV) { minAnyV = v; minAnyIdx = i; }
    if (skyUsable && !sky![i] && v < minColdOnlyV) { minColdOnlyV = v; minColdOnlyIdx = i; }
  }
  if (maxIdx === -1) return null;
  const useExcluded = skyUsable && minColdOnlyIdx !== -1;
  const minIdx = useExcluded ? minColdOnlyIdx : minAnyIdx;
  const minV = useExcluded ? minColdOnlyV : minAnyV;

  return {
    max: { x: maxIdx % width, y: (maxIdx / width) | 0, value: maxV },
    min: { x: minIdx % width, y: (minIdx / width) | 0, value: minV },
    skyExcluded: useExcluded && minIdx !== minAnyIdx,
  };
}

/** Moves a ROI by a delta in sensor pixels. */
export function translateRoi(roi: Roi, dx: number, dy: number): void {
  if (roi.type === 'PolygonROI') {
    roi.points = roi.points.map(([x, y]) => [x + dx, y + dy] as [number, number]);
  } else {
    roi.x += dx;
    roi.y += dy;
  }
}
