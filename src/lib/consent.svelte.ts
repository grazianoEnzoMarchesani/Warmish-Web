/**
 * Consent for the two things Warmish does that reach the network:
 *  - the map view and the standalone geotag tool, which download basemap
 *    tiles from Esri, OpenStreetMap or OpenFreeMap;
 *  - "detect scene" in the Areas panel, which downloads a Cityscapes
 *    segmentation model (road/building/person) from Google's model hub the
 *    first time it runs.
 * Both let the respective provider see the visitor's IP; the map additionally
 * reveals the area on screen. Everything else in the app stays on-device.
 *
 * default-deny: until an explicit, unexpired "granted" is on record for a
 * given feature, its network calls stay off. A first visit, "Not now", or
 * letting the choice lapse all read the same. A choice is remembered for six
 * months (per the Garante's cookie guidance, provv. 231/2021), then falls
 * back to denied.
 *
 * The stored shape — `{ choice, date }` under `warmish.mapConsent` — is
 * mirrored by a few inline lines in `public/geotag/index.html`, which shares
 * that key on the same origin but cannot import a Svelte module. The scene
 * model has no such standalone counterpart, so `warmish.sceneConsent` is only
 * ever read here.
 */

export type Consent = 'granted' | 'denied';

/** Six months from `iso`, matching the reference site's `setMonth(+6)`. */
function expired(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  d.setMonth(d.getMonth() + 6);
  return d < new Date();
}

function load(key: string): Consent | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const rec = JSON.parse(raw) as { choice?: unknown; date?: unknown };
    if (rec.choice !== 'granted' && rec.choice !== 'denied') return null;
    if (typeof rec.date !== 'string' || expired(rec.date)) return null;
    return rec.choice;
  } catch {
    return null; // storage denied / malformed — the safe state is denied
  }
}

/** One `{ get, allowed, set }` consent store per network-touching feature,
 *  each with its own persisted key and its own reactive `$state`. */
function createConsentStore(key: string) {
  let choice = $state<Consent | null>(load(key));
  return {
    get: (): Consent | null => choice,
    allowed: (): boolean => choice === 'granted',
    set: (next: Consent): void => {
      choice = next;
      try {
        localStorage.setItem(key, JSON.stringify({ choice: next, date: new Date().toISOString() }));
      } catch {
        /* private mode — the choice still holds for this session via `choice` */
      }
    },
  };
}

const mapStore = createConsentStore('warmish.mapConsent');
/** The recorded map-tile choice, or `null` when never made or expired. */
export function mapConsent(): Consent | null { return mapStore.get(); }
/** True only after an explicit, unexpired "granted". The gate everything checks. */
export function mapTilesAllowed(): boolean { return mapStore.allowed(); }
/** Record the visitor's map-tile choice and persist it. Reactive readers re-run. */
export function setMapConsent(next: Consent): void { mapStore.set(next); }

const sceneStore = createConsentStore('warmish.sceneConsent');
/** The recorded scene-model choice, or `null` when never made or expired. */
export function sceneConsent(): Consent | null { return sceneStore.get(); }
/** True only after an explicit, unexpired "granted". The gate "Detect scene" checks. */
export function sceneModelAllowed(): boolean { return sceneStore.allowed(); }
/** Record the visitor's scene-model choice and persist it. Reactive readers re-run. */
export function setSceneConsent(next: Consent): void { sceneStore.set(next); }
