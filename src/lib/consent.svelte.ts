/**
 * Map-tile consent — the single source of truth for the one thing Warmish does
 * that reaches the network: the map view and the standalone geotag tool download
 * basemap tiles from Esri, OpenStreetMap or OpenFreeMap, so those providers see
 * the visitor's IP and the area on screen.
 *
 * default-deny: until an explicit, unexpired "granted" is on record, tiles stay
 * off. A first visit, "Not now", or letting the choice lapse all read the same.
 * A choice is remembered for six months (per the Garante's cookie guidance,
 * provv. 231/2021), then falls back to denied.
 *
 * The stored shape — `{ choice, date }` under `warmish.mapConsent` — is mirrored
 * by a few inline lines in `public/geotag/index.html`, which shares this key on
 * the same origin but cannot import a Svelte module.
 */

export type MapConsent = 'granted' | 'denied';

const KEY = 'warmish.mapConsent';

/** Six months from `iso`, matching the reference site's `setMonth(+6)`. */
function expired(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  d.setMonth(d.getMonth() + 6);
  return d < new Date();
}

function load(): MapConsent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as { choice?: unknown; date?: unknown };
    if (rec.choice !== 'granted' && rec.choice !== 'denied') return null;
    if (typeof rec.date !== 'string' || expired(rec.date)) return null;
    return rec.choice;
  } catch {
    return null; // storage denied / malformed — the safe state is denied
  }
}

// Module-level rune state, like `i18n.svelte.ts`: every `mapTilesAllowed()` read
// in a component template or `$effect` re-runs when the choice changes.
let choice = $state<MapConsent | null>(load());

/** The recorded choice, or `null` when never made or expired. */
export function mapConsent(): MapConsent | null {
  return choice;
}

/** True only after an explicit, unexpired "granted". The gate everything checks. */
export function mapTilesAllowed(): boolean {
  return choice === 'granted';
}

/** Record the visitor's choice and persist it. Reactive readers re-run. */
export function setMapConsent(next: MapConsent): void {
  choice = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ choice: next, date: new Date().toISOString() }));
  } catch {
    /* private mode — the choice still holds for this session via `choice` */
  }
}
