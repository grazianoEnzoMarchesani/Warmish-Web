<script lang="ts" module>
  export interface MapPoint {
    /** Stable key — folder-relative path, or the file name for a lone image. */
    path: string;
    name: string;
    lat: number;
    lon: number;
    altitude: number | null;
    direction: number | null;
    directionRef: 'T' | 'M' | null;
    /** Data/blob URL for the popup preview, or null. */
    thumb: string | null;
    /** The image currently open in the thermal viewer. */
    active: boolean;
    /** Capture time, ms epoch — orders the map tour. null sorts last, by name. */
    time: number | null;
  }
</script>

<script lang="ts">
  /**
   * Positions GPS-tagged FLIR frames on a slippy map. This is the only part of
   * Warmish that touches the network: the basemap tiles come from OpenFreeMap,
   * Esri or OpenStreetMap, so the area on screen is revealed to that provider.
   * No image or coordinate is uploaded. Leaflet is not even instantiated until
   * the visitor grants tile consent (see `consent.svelte.ts`); until then the
   * `.consent` gate stands in for the map and nothing leaves the browser.
   *
   * The default "Minimal" basemap is drawn here from OpenFreeMap vector tiles
   * (protomaps-leaflet, canvas, no WebGL): only buildings, roads and water, no
   * labels and no points of interest, so the photo markers own every bit of
   * colour on screen. protomaps-leaflet is pulled in lazily the first time the
   * map opens; if it (or OpenFreeMap) can't be reached we fall back to Esri.
   */
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import type * as PM from 'protomaps-leaflet';
  import { routeAroundBuildings } from './routeAround';
  import { t, getLocale } from './i18n.svelte';
  import { mapConsent, mapTilesAllowed, setMapConsent } from './consent.svelte';

  let {
    points,
    onopen,
    tourImage,
    ontour,
    onshowprivacy,
  }: {
    points: MapPoint[];
    onopen: (path: string) => void;
    /** Renders a big processed frame for a tour stop; caller owns the URL. */
    tourImage?: (path: string) => Promise<string | null>;
    /** Fires when the guided tour starts (true) and ends (false), so the shell
     *  can strip its chrome down to just the map for the fly-through. */
    ontour?: (active: boolean) => void;
    /** Opens the privacy notice from the consent gate. */
    onshowprivacy?: () => void;
  } = $props();

  let host = $state<HTMLDivElement>();
  let map: L.Map | null = null;
  let markerLayer: L.LayerGroup | null = null;
  let fittedOnce = false;
  /** Name of the active basemap — the tour only bends its trail around
   *  buildings while a "Minimal" (OpenFreeMap vector) style is showing. */
  let currentBasemap = '';

  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let mapRO: ResizeObserver | null = null;

  const OSM_ATTR = '&copy; OpenStreetMap contributors';

  // Raster basemaps, created on demand. The two "Minimal" styles are built
  // separately in buildMinimalLayers() because they need an async import.
  const RASTER_BASEMAPS = {
    Satellite: () =>
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 21,
          maxNativeZoom: 19,
          attribution: 'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        },
      ),
    'Mappa stradale': () =>
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: OSM_ATTR,
      }),
  } as const;
  const MINIMAL_NAMES = ['Minimal', 'Minimal scuro'] as const;
  type BasemapName = keyof typeof RASTER_BASEMAPS | (typeof MINIMAL_NAMES)[number];

  function prefersDark(): boolean {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function initialBasemap(): BasemapName {
    try {
      const s = localStorage.getItem('warmish.basemap') as BasemapName | null;
      if (s && (s in RASTER_BASEMAPS || (MINIMAL_NAMES as readonly string[]).includes(s))) return s;
    } catch { /* private mode */ }
    return prefersDark() ? 'Minimal scuro' : 'Minimal';
  }

  // --- The black-and-white vector basemap --------------------------------------
  // OpenFreeMap vector tiles (OpenMapTiles schema), rendered to canvas by
  // protomaps-leaflet with a hand-written style: buildings + roads + water only,
  // zero labels, zero POIs.
  const OFM_TILEJSON = 'https://tiles.openfreemap.org/planet';
  const OFM_ATTR =
    '&copy; <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
    '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
    '· dati <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

  interface MapPalette {
    bg: string; water: string; building: string; road: string; roadMajor: string;
  }
  const LIGHT_MAP: MapPalette = {
    bg: '#f4f3f0', water: '#dfe3ea', building: '#e2e1da',
    road: '#a9a69a', roadMajor: '#8d8a7e',
  };
  const DARK_MAP: MapPalette = {
    bg: '#181a1d', water: '#0e1013', building: '#262930',
    road: '#43464c', roadMajor: '#5c606a',
  };

  const ROAD_MAJOR = new Set(['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link']);
  const ROAD_MED = new Set(['secondary', 'tertiary', 'secondary_link', 'tertiary_link']);
  const ROAD_MINOR = new Set(['minor', 'service']);

  function minimalPaintRules(pm: typeof PM, p: MapPalette): PM.PaintRule[] {
    const { PolygonSymbolizer, LineSymbolizer, exp } = pm;
    const majorW = exp(1.4, [[5, 0.5], [10, 1], [13, 1.8], [16, 4], [18, 9], [20, 18]]);
    const medW = exp(1.4, [[9, 0.4], [12, 0.7], [14, 1.3], [16, 2.8], [18, 6], [20, 12]]);
    const minorW = exp(1.4, [[12, 0.3], [14, 0.8], [16, 1.7], [18, 4], [20, 9]]);
    const cls = (set: Set<string>) => (_z: number, f?: PM.Feature) => set.has(String(f?.props.class));
    return [
      { dataLayer: 'water', symbolizer: new PolygonSymbolizer({ fill: p.water }) },
      { dataLayer: 'building', minzoom: 13, symbolizer: new PolygonSymbolizer({ fill: p.building }) },
      { dataLayer: 'transportation', minzoom: 13, filter: cls(ROAD_MINOR), symbolizer: new LineSymbolizer({ color: p.road, width: minorW }) },
      { dataLayer: 'transportation', minzoom: 10, filter: cls(ROAD_MED), symbolizer: new LineSymbolizer({ color: p.road, width: medW }) },
      { dataLayer: 'transportation', filter: cls(ROAD_MAJOR), symbolizer: new LineSymbolizer({ color: p.roadMajor, width: majorW }) },
    ];
  }

  async function buildMinimalLayers(): Promise<Record<string, L.Layer>> {
    const pm = await import('protomaps-leaflet');
    const tj = await fetch(OFM_TILEJSON, { cache: 'force-cache' }).then((r) => {
      if (!r.ok) throw new Error(`OpenFreeMap ${r.status}`);
      return r.json();
    });
    const url: string = tj.tiles[0];
    const maxDataZoom: number = tj.maxzoom ?? 14;
    const layer = (p: MapPalette) =>
      pm.leafletLayer({
        url, maxDataZoom, attribution: OFM_ATTR, maxZoom: 21,
        backgroundColor: p.bg,
        paintRules: minimalPaintRules(pm, p),
        labelRules: [],
      }) as unknown as L.Layer;
    return { Minimal: layer(LIGHT_MAP), 'Minimal scuro': layer(DARK_MAP) };
  }

  function coneSvg(dir: number): string {
    // A narrow wedge from the marker centre, pointing "up" then rotated to the
    // compass bearing. overflow is visible so it reaches past the icon box.
    return `<svg class="wm-cone" style="transform:rotate(${dir}deg)" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><path d="M15 15 L8 -7 L22 -7 Z"/></svg>`;
  }

  function icon(p: MapPoint): L.DivIcon {
    const cone = p.direction !== null ? coneSvg(p.direction) : '';
    return L.divIcon({
      className: 'wm-pin-wrap',
      html: `<div class="wm-pin${p.active ? ' is-active' : ''}">${cone}<span class="wm-dot"></span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
    });
  }

  function fmtCoord(lat: number, lon: number): string {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(6)}° ${ns}, ${Math.abs(lon).toFixed(6)}° ${ew}`;
  }

  function popupHtml(p: MapPoint): string {
    const rows: string[] = [];
    rows.push(`<div class="wm-pop-coord">${fmtCoord(p.lat, p.lon)}</div>`);
    const meta: string[] = [];
    if (p.altitude !== null) meta.push(t('map.popupAltitude', { m: p.altitude.toFixed(0) }));
    if (p.direction !== null) {
      const dref = p.directionRef === 'M' ? t('map.popupDirectionMag') : p.directionRef === 'T' ? t('map.popupDirectionTrue') : '';
      meta.push(t('map.popupDirection', { deg: p.direction.toFixed(0), ref: dref }));
    }
    if (meta.length) rows.push(`<div class="wm-pop-meta">${meta.join(' · ')}</div>`);
    const thumb = p.thumb
      ? `<img class="wm-pop-thumb" src="${p.thumb}" alt="${escapeHtml(t('map.popupThumbAlt', { name: p.name }))}" />`
      : '';
    return `<div class="wm-pop">
      ${thumb}
      <div class="wm-pop-name">${escapeHtml(p.name)}</div>
      ${rows.join('')}
      <button type="button" class="wm-pop-open" data-path="${escapeHtml(p.path)}">
        ${p.active ? t('map.popupBackToThermal') : t('map.popupOpenViewer')}
      </button>
    </div>`;
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  }

  function clusterIcon(n: number, active: boolean): L.DivIcon {
    return L.divIcon({
      className: 'wm-pin-wrap',
      html: `<div class="wm-pin wm-pin--cluster${active ? ' is-active' : ''}"><span class="wm-count">${n}</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });
  }

  function clusterPopupHtml(items: MapPoint[]): string {
    const list = items
      .map(
        (p) => `<li><button type="button" class="wm-list-open" data-path="${escapeHtml(p.path)}">
          <span class="wm-list-name">${escapeHtml(p.name)}</span>
          ${p.active ? `<span class="wm-list-tag">${t('map.popupInView')}</span>` : ''}
        </button></li>`,
      )
      .join('');
    // Every GPS-tagged shot at one coordinate: usually a phone/camera that
    // stamps a single cached fix on a whole session, not a real cluster.
    const allHere = items.length === points.length && points.length > 1;
    const note = allHere
      ? `<div class="wm-pop-meta">${t('map.popupSameCoord')}
         <a class="wm-pop-link" href="geotag/index.html" target="_blank" rel="noopener">${t('map.popupSameCoordLink')}</a></div>`
      : '';
    return `<div class="wm-pop">
      <div class="wm-pop-name">${t('map.popupShotsHere', { count: items.length })}</div>
      <div class="wm-pop-coord">${fmtCoord(items[0].lat, items[0].lon)}</div>
      ${note}
      <ul class="wm-list">${list}</ul>
    </div>`;
  }

  function renderMarkers(): void {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    if (!points.length) return;

    if (!fittedOnce) {
      fittedOnce = true;
      const ll = points.map((p) => [p.lat, p.lon] as L.LatLngTuple);
      if (ll.length === 1) map.setView(ll[0], 17, { animate: false });
      else map.fitBounds(L.latLngBounds(ll).pad(0.18), { animate: false, maxZoom: 17 });
    }

    // Cluster by on-screen distance at the current zoom: pins that would overlap
    // merge into one counter and split again as you zoom in. FLIR cameras often
    // write the same coarse fix for a whole session, so this is the common case.
    // During the tour we never cluster: the camera drives the zoom (a tight
    // framing would leave a stale "3" counter that never re-splits), so every
    // stop keeps its own pin.
    const radius = tourActive ? 0 : 36;
    const groups: { items: MapPoint[]; x: number; y: number }[] = [];
    for (const p of points) {
      const pt = map.latLngToContainerPoint([p.lat, p.lon]);
      const g = radius > 0 ? groups.find((g) => Math.hypot(g.x - pt.x, g.y - pt.y) < radius) : undefined;
      if (g) g.items.push(p);
      else groups.push({ items: [p], x: pt.x, y: pt.y });
    }

    for (const g of groups) {
      const active = g.items.some((p) => p.active);
      if (g.items.length === 1) {
        const p = g.items[0];
        const m = L.marker([p.lat, p.lon], {
          icon: icon(p), zIndexOffset: p.active ? 1000 : 0, title: p.name, keyboard: true, alt: p.name,
        });
        m.bindPopup(popupHtml(p), { closeButton: true, autoPanPadding: [40, 40] });
        m.on('dblclick', () => onopen(p.path));
        markerLayer.addLayer(m);
      } else {
        const lat = g.items.reduce((s, p) => s + p.lat, 0) / g.items.length;
        const lon = g.items.reduce((s, p) => s + p.lon, 0) / g.items.length;
        const m = L.marker([lat, lon], {
          icon: clusterIcon(g.items.length, active), zIndexOffset: active ? 1000 : 0,
          title: `${g.items.length} scatti`,
        });
        m.bindPopup(clusterPopupHtml(g.items), { closeButton: true, autoPanPadding: [40, 40], minWidth: 200 });
        // Try to spread them by zooming in; a truly co-located set just re-opens the list.
        m.on('dblclick', () => map!.setView([lat, lon], Math.min(map!.getZoom() + 2, 20), { animate: !reduceMotion }));
        markerLayer.addLayer(m);
      }
    }
  }

  // Assemble the basemap list and the layer switcher. The minimal vector styles
  // need a dynamic import + a tilejson fetch, so the whole thing is async; until
  // it resolves the map shows just its background colour, which is fine.
  async function setupBasemaps(): Promise<void> {
    const all: Record<string, L.Layer> = {};
    try {
      Object.assign(all, await buildMinimalLayers());
    } catch (err) {
      console.warn(t('map.minimalUnavailable'), err);
    }
    for (const k of Object.keys(RASTER_BASEMAPS) as (keyof typeof RASTER_BASEMAPS)[]) {
      all[k] = RASTER_BASEMAPS[k]();
    }
    if (!map) return; // component was torn down mid-await

    let start = initialBasemap() as string;
    if (!(start in all)) start = 'Satellite';
    all[start].addTo(map);
    currentBasemap = start;
    L.control.layers(all, {}, { position: 'topright' }).addTo(map);
    map.on('baselayerchange', (e: L.LayersControlEvent) => {
      currentBasemap = e.name;
      try { localStorage.setItem('warmish.basemap', e.name); } catch { /* private mode */ }
    });
    renderMarkers();
  }

  /** Stand up Leaflet and its tile layers. Only ever called once the visitor has
   *  granted map-tile consent — this is the one path in Warmish that reaches the
   *  network (see `consent.svelte.ts`). */
  function buildMap(): void {
    if (map || !host) return;
    map = L.map(host, {
      zoomControl: true,
      attributionControl: true,
      fadeAnimation: !reduceMotion,
      zoomAnimation: !reduceMotion,
      markerZoomAnimation: !reduceMotion,
      worldCopyJump: true,
    });

    markerLayer = L.layerGroup().addTo(map);
    void setupBasemaps();

    // The popup's action buttons live in Leaflet's DOM, not Svelte's.
    map.on('popupopen', (e: L.PopupEvent) => {
      e.popup.getElement()
        ?.querySelectorAll<HTMLButtonElement>('.wm-pop-open, .wm-list-open')
        .forEach((btn) => btn.addEventListener('click', () => {
          if (btn.dataset.path) onopen(btn.dataset.path);
        }, { once: true }));
    });

    // While the tour drives the camera the photo pins are dimmed and static —
    // no need to re-cluster them on every fly.
    map.on('zoomend resize', () => { if (!tourActive) renderMarkers(); });
    renderMarkers();

    mapRO = new ResizeObserver(() => map?.invalidateSize());
    mapRO.observe(host);
    // Container is laid out by now, but a deferred call covers font/layout settle.
    requestAnimationFrame(() => map?.invalidateSize());
  }

  /** Tear the map down completely — on unmount, or when consent is withdrawn
   *  mid-session, so no further tile request can leave the browser. */
  function destroyMap(): void {
    if (!map) return;
    if (recording) stopRecording();
    if (tourActive) {
      tourGen++;
      detourGen++;
      clearTourTimers();
      tourActive = tourPlaying = tourMoving = false;
      routeLine?.remove(); doneLine?.remove(); doneBlocked?.remove(); traveller?.remove();
      routeLine = doneLine = doneBlocked = traveller = null;
      segPaths = [];
      segClear = [];
      imgLayers = [];
      imgLoading = false;
      ontour?.(false);
    }
    for (const url of urlCache.values()) URL.revokeObjectURL(url);
    urlCache.clear();
    mapRO?.disconnect();
    mapRO = null;
    try { map.remove(); } catch { /* Svelte may have already detached the container */ }
    map = null;
    markerLayer = null;
    fittedOnce = false;
  }

  onMount(() => {
    // Capture phase so tour keys (Space, arrows, Esc) beat the app's global
    // shortcuts (which would otherwise flip the open image or the filmstrip).
    window.addEventListener('keydown', onTourKey, true);
    return () => {
      window.removeEventListener('keydown', onTourKey, true);
      destroyMap();
    };
  });

  // Build the map the moment tile consent is granted; tear it right back down if
  // the visitor withdraws it. Runs after the first render, so `host` is bound.
  $effect(() => {
    if (mapTilesAllowed()) buildMap();
    else destroyMap();
  });

  // Re-place markers when the folder selection or the active image changes, or
  // when the language switches (popup text is built imperatively).
  $effect(() => {
    void points;
    void getLocale();
    renderMarkers();
  });

  // --- Guided tour -----------------------------------------------------------
  // Flies the camera from shot to shot in capture order, drawing the path as it
  // goes and showing each stop's processed image in a side panel with a
  // cross-fade. Everything here is time-based so `prefers-reduced-motion` just
  // sets the durations to zero and the same code lands on the final state.

  // Camera framing for each stop: `largo` keeps the whole route in view (zoom
  // derived from its bounds), `medio` and `stretto` are fixed zooms — the tighter
  // the framing, the more of the ground you can actually make out under the pin.
  const FRAMINGS = {
    largo: { zoom: null, label: 'largo' },
    medio: { zoom: 17, label: 'medio' },
    stretto: { zoom: 19, label: 'stretto' },
  } as const;
  type Framing = keyof typeof FRAMINGS;

  const SPEEDS = {
    lento: { fly: 3.4, dwell: 4200 },
    normale: { fly: 2.2, dwell: 2800 },
    veloce: { fly: 1.3, dwell: 1500 },
  } as const;
  type Speed = keyof typeof SPEEDS;

  /** Shots in tour order: by capture time, then natural name; timeless last. */
  const ordered = $derived.by<MapPoint[]>(() =>
    [...points].sort((a, b) => {
      if (a.time !== null && b.time !== null && a.time !== b.time) return a.time - b.time;
      if (a.time !== null && b.time === null) return -1;
      if (a.time === null && b.time !== null) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    }),
  );
  const canTour = $derived(ordered.length >= 2 && typeof tourImage === 'function');

  let tourActive = $state(false);
  let tourPlaying = $state(false);
  let tourMoving = $state(false);
  let tourIdx = $state(0);
  let tourSpeed = $state<Speed>(
    (() => {
      try {
        const s = localStorage.getItem('warmish.tourSpeed');
        return s === 'lento' || s === 'veloce' ? s : 'normale';
      } catch { return 'normale'; }
    })(),
  );
  let tourFraming = $state<Framing>(
    (() => {
      try {
        const s = localStorage.getItem('warmish.tourFraming');
        return s === 'largo' || s === 'stretto' ? s : 'medio';
      } catch { return 'medio'; }
    })(),
  );

  // --- Tour video recording --------------------------------------------------
  // Records the tab (map + panel, already stripped of app chrome while a tour
  // is active — see `ontour`) with the browser's own screen-capture APIs, so no
  // frame is ever re-rendered or re-encoded server-side. The chosen multiplier
  // just runs the fly/dwell timings faster for the recorded run — the output is
  // already sped up, no post-processing needed.
  const REC_SPEEDS = [1, 1.5, 2, 2.5, 3] as const;
  type RecSpeed = (typeof REC_SPEEDS)[number];
  const recSupported =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    typeof MediaRecorder !== 'undefined';
  let recMenuOpen = $state(false);
  let recording = $state(false);
  let recMult = $state<RecSpeed>(
    (() => {
      try {
        const s = Number(localStorage.getItem('warmish.recSpeed')) as RecSpeed;
        return (REC_SPEEDS as readonly number[]).includes(s) ? s : 2;
      } catch { return 2; }
    })(),
  );
  let recStream: MediaStream | null = null;
  let recRecorder: MediaRecorder | null = null;
  let recChunks: Blob[] = [];
  let recMimeType = 'video/webm';
  let recEndTimer: ReturnType<typeof setTimeout> | undefined;

  let routeLine: L.Polyline | null = null;
  let doneLine: L.Polyline | null = null;
  let doneBlocked: L.Polyline | null = null;
  let traveller: L.Marker | null = null;
  let tourRaf: number | null = null;
  let tourTimer: ReturnType<typeof setTimeout> | undefined;
  let tourFlyGuard: ReturnType<typeof setTimeout> | undefined;
  let tourMoveEnd: (() => void) | null = null;
  let tourGen = 0;

  // Panel image. One entry at a time, keyed by id: when it changes Svelte plays
  // an out-transition on the old <img> and an in-transition on the new one, so
  // the two overlap for a real crossfade (see `transition:fade` in the markup).
  const FADE_MS = 700;
  let imgLayers = $state<{ id: number; src: string }[]>([]);
  let imgLoading = $state(false);
  let layerSeq = 0;
  const urlCache = new Map<string, string>();
  const inFlight = new Map<string, Promise<string | null>>();

  const ll = (p: MapPoint): L.LatLngTuple => [p.lat, p.lon];
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const speed = () => {
    const base = reduceMotion ? { fly: 0, dwell: 2000 } : SPEEDS[tourSpeed];
    return recording && recMult !== 1 ? { fly: base.fly / recMult, dwell: base.dwell / recMult } : base;
  };

  // --- Trail geometry ------------------------------------------------------
  // One polyline per hop between consecutive stops. Each hop starts as a plain
  // straight line; `computeDetours()` then swaps in versions bent around
  // building footprints (see routeAround.ts) once the vector tiles are decoded.
  // `segClear[k]` is false when the hop had to cross a building anyway — that
  // one is drawn dashed to tell the viewer the gap couldn't be closed.
  // `segPaths[k]` runs from ordered[k] to ordered[k + 1].
  let segPaths: L.LatLngTuple[][] = [];
  let segClear: boolean[] = [];
  let detourGen = 0;

  function resetSegs(): void {
    segPaths = ordered.slice(1).map((p, i) => [ll(ordered[i]), ll(p)]);
    segClear = ordered.slice(1).map(() => true);
  }

  /** Every hop flattened — the faint grey preview of the whole route. */
  function fullRoute(): L.LatLngTuple[] {
    const out: L.LatLngTuple[] = [];
    for (const seg of segPaths) for (let j = out.length ? 1 : 0; j < seg.length; j++) out.push(seg[j]);
    return out;
  }

  /** Completed hops before stop `n` whose `clear` flag matches, each as its own
   *  sub-array so a single polyline can carry them all. */
  function doneSegs(n: number, clear: boolean): L.LatLngTuple[][] {
    const out: L.LatLngTuple[][] = [];
    for (let k = 0; k < n && k < segPaths.length; k++) {
      if ((segClear[k] !== false) === clear) out.push(segPaths[k]);
    }
    return out;
  }

  /** Repaint both completed-trail layers for the traveller resting at stop `n`. */
  function paintDone(n: number): void {
    doneLine?.setLatLngs(doneSegs(n, true));
    doneBlocked?.setLatLngs(doneSegs(n, false));
  }

  const tupDist = (a: L.LatLngTuple, b: L.LatLngTuple) =>
    Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos((a[0] * Math.PI) / 180));

  /** Fetch the building-aware trail and fold it in without interrupting the
   *  fly-through. Only runs on a "Minimal" basemap (its OpenFreeMap tiles are
   *  the footprint source); any failure just leaves the straight lines. */
  async function computeDetours(token: number): Promise<void> {
    if (!(MINIMAL_NAMES as readonly string[]).includes(currentBasemap)) return;
    try {
      const res = await routeAroundBuildings(
        ordered.map((p) => [p.lat, p.lon] as [number, number]),
        OFM_TILEJSON,
      );
      if (token !== detourGen || !tourActive || res.length !== ordered.length - 1) return;
      segPaths = res.map((s) => s.path.map(([la, lo]) => [la, lo] as L.LatLngTuple));
      segClear = res.map((s) => s.clear);
      routeLine?.setLatLngs(fullRoute());
      if (!tourMoving) paintDone(tourIdx);
    } catch (err) {
      console.warn(t('map.routeUnavailable'), err);
    }
  }

  /** Zoom the camera should hold at a stop, per the chosen framing. `largo`
   *  fits the whole route; the fixed framings clamp to what the tiles allow. */
  function stopZoom(): number {
    const z = FRAMINGS[tourFraming].zoom;
    if (typeof z === 'number') return z;
    if (!map || ordered.length < 2) return 15;
    const b = L.latLngBounds(ordered.map(ll)).pad(0.2);
    return Math.min(map.getBoundsZoom(b), 16);
  }

  function fmtStopTime(ms: number | null): string {
    if (ms === null) return '';
    try {
      return new Date(ms).toLocaleString(getLocale(), {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return ''; }
  }

  /** Fetch (or reuse) the processed frame for a stop, de-duplicating concurrent
   *  requests so a prefetch and a show can't both allocate a URL. */
  function fetchImage(path: string): Promise<string | null> {
    const hit = urlCache.get(path);
    if (hit) return Promise.resolve(hit);
    let p = inFlight.get(path);
    if (!p) {
      p = (tourImage ? tourImage(path) : Promise.resolve(null)).then((url) => {
        inFlight.delete(path);
        if (url) urlCache.set(path, url);
        return url;
      }).catch(() => { inFlight.delete(path); return null; });
      inFlight.set(path, p);
    }
    return p;
  }

  async function showImage(path: string, gen: number) {
    const cached = urlCache.get(path);
    if (!cached) imgLoading = true;
    const url = await fetchImage(path);
    if (gen !== tourGen) return;
    imgLoading = false;
    if (!url) return; // keep whatever is on screen
    imgLayers = [{ id: ++layerSeq, src: url }];
  }

  function clearTourTimers() {
    if (tourRaf !== null) cancelAnimationFrame(tourRaf);
    tourRaf = null;
    clearTimeout(tourTimer);
    clearTimeout(tourFlyGuard);
    if (tourMoveEnd) { map?.off('moveend', tourMoveEnd); tourMoveEnd = null; }
  }

  /**
   * Move to stop `to`. The camera flies first with the trail held still (a
   * polyline mutated mid-`flyTo` fights Leaflet's zoom transform and appears to
   * pump); once the map is settled the trail + traveller draw the last segment
   * over static ground, so the line stays pinned and simply grows.
   */
  function flyToStop(to: number, from: number, gen: number, snap = false) {
    if (!map) return;
    const dest = ordered[to];
    const fwd = to === from + 1;
    const z = stopZoom();
    const target = panelOffsetLatLng(ll(dest), z);
    const animate = !snap && !reduceMotion && speed().fly > 0;
    tourMoving = true;

    // Freeze the trail at its current extent and park the traveller.
    paintDone(fwd ? from : to);
    traveller?.setLatLng(ll(fwd ? ordered[from] : dest));

    let ran = false;
    const proceed = () => {
      if (tourMoveEnd) { map?.off('moveend', tourMoveEnd); tourMoveEnd = null; }
      clearTimeout(tourFlyGuard);
      if (ran || gen !== tourGen) return;
      ran = true;
      if (fwd) drawSegment(to, gen);
      else { tourMoving = false; void showImage(ordered[to].path, gen); arriveAtStop(to, gen); }
    };

    if (!animate) {
      map.setView(target, z, { animate: false });
      proceed();
    } else {
      tourMoveEnd = proceed;
      map.on('moveend', proceed);
      tourFlyGuard = setTimeout(proceed, speed().fly * 1000 + 600);
      map.flyTo(target, z, { duration: speed().fly, easeLinearity: 0.25 });
    }
  }

  /** Grow the trail along the hop into stop `to` over static ground. The hop is
   *  a polyline (straight, or bent around buildings), so the traveller walks it
   *  by arc length rather than lerping between two points. It grows into the
   *  solid layer, or the dashed one when the hop couldn't dodge a building. */
  function drawSegment(to: number, gen: number) {
    const k = to - 1;
    const seg = segPaths[k] ?? [ll(ordered[k]), ll(ordered[to])];
    const clear = segClear[k] !== false;
    const grow = clear ? doneLine : doneBlocked;
    const base = doneSegs(k, clear);
    const cum = [0];
    for (let i = 1; i < seg.length; i++) cum.push(cum[i - 1] + tupDist(seg[i - 1], seg[i]));
    const total = cum[cum.length - 1] || 1;
    const drawMs = reduceMotion ? 0 : 640;
    // Kick the photo crossfade off with the dot: FADE_MS (~700) and the walk
    // (~640) are close enough that the new frame lands just as the dot arrives.
    void showImage(ordered[to].path, gen);
    const t0 = performance.now();
    const tick = () => {
      if (gen !== tourGen) return;
      const raw = drawMs <= 0 ? 1 : Math.min(1, (performance.now() - t0) / drawMs);
      const target = ease(raw) * total;
      let i = 1;
      while (i < seg.length - 1 && cum[i] < target) i++;
      const t = (target - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      const p: L.LatLngTuple = [
        seg[i - 1][0] + (seg[i][0] - seg[i - 1][0]) * t,
        seg[i - 1][1] + (seg[i][1] - seg[i - 1][1]) * t,
      ];
      traveller?.setLatLng(p);
      grow?.setLatLngs([...base, [...seg.slice(0, i), p]]);
      if (raw < 1) { tourRaf = requestAnimationFrame(tick); return; }
      tourRaf = null;
      paintDone(to);
      traveller?.setLatLng(ll(ordered[to]));
      tourMoving = false;
      arriveAtStop(to, gen);
    };
    tourRaf = requestAnimationFrame(tick);
  }

  /** Shift a target so its point sits centred in the map area left of the panel. */
  function panelOffsetLatLng(target: L.LatLngTuple, z: number): L.LatLngTuple {
    if (!map) return target;
    const panel = host.parentElement?.querySelector('.tour-panel') as HTMLElement | null;
    const w = panel ? panel.getBoundingClientRect().width : 0;
    // Skip the shift when the panel nearly fills the map (mobile / narrow).
    if (!w || w > map.getSize().x * 0.62) return target;
    const pt = map.project(target, z);
    pt.x += w / 2;
    const p = map.unproject(pt, z);
    return [p.lat, p.lng];
  }

  function arriveAtStop(i: number, gen: number) {
    if (gen !== tourGen) return;
    if (tourPlaying && i < ordered.length - 1) {
      tourTimer = setTimeout(() => { if (gen === tourGen) goToStop(i + 1); }, speed().dwell);
    } else if (i >= ordered.length - 1) {
      tourPlaying = false; // reached the end, hold here
      if (recording) recEndTimer = setTimeout(stopRecording, 900); // hold the last frame briefly
    }
  }

  function goToStop(i: number, snap = false) {
    if (!tourActive) return;
    const to = Math.max(0, Math.min(ordered.length - 1, i));
    const from = tourIdx;
    const gen = ++tourGen;
    clearTourTimers();
    // Kill any pan/zoom still in flight. Starting a new move over a running one
    // can leave Leaflet's overlay pane mid-transform, so the frozen trail looks
    // shifted and rescaled until the next clean redraw.
    map?.stop();
    tourIdx = to;
    // The photo reveal is deferred until the traveller actually sets off toward
    // this stop (see drawSegment / flyToStop) so the crossfade rides the dot's
    // move instead of racing ahead of it — just warm the cache here.
    void fetchImage(ordered[to].path);
    const nextP = ordered[to + 1];
    if (nextP) void fetchImage(nextP.path);
    flyToStop(to, from, gen, snap);
  }

  function startTour() {
    if (!map || !canTour || tourActive) return;
    map.closePopup();
    tourActive = true;
    tourPlaying = true;
    tourIdx = 0;
    imgLayers = [];
    ontour?.(true);

    const coords = ordered.map(ll);
    resetSegs();
    const detourToken = ++detourGen;
    routeLine = L.polyline(fullRoute(), {
      className: 'wm-route', interactive: false,
      color: '#8a94a6', weight: 2, opacity: 0.55, dashArray: '2 7',
    }).addTo(map);
    doneLine = L.polyline([], {
      className: 'wm-route-done', interactive: false,
      color: '#ff8a3d', weight: 3.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
    }).addTo(map);
    // Hops that couldn't dodge a building: same orange, kept dashed to say so.
    doneBlocked = L.polyline([], {
      className: 'wm-route-blocked', interactive: false,
      color: '#ff8a3d', weight: 3.5, opacity: 0.9, dashArray: '3 7', lineCap: 'round', lineJoin: 'round',
    }).addTo(map);
    traveller = L.marker(coords[0], {
      icon: L.divIcon({ className: 'wm-traveller-wrap', html: '<span class="wm-traveller"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      interactive: false, zIndexOffset: 2000, keyboard: false,
    }).addTo(map);

    map.fitBounds(L.latLngBounds(coords).pad(0.2), { animate: false });
    renderMarkers(); // redraw un-clustered — one pin per stop for the whole tour
    // Let the fit settle a frame, then set off.
    requestAnimationFrame(() => { if (tourActive) goToStop(0); });
    // Bend the trail around buildings in the background; it folds itself in.
    void computeDetours(detourToken);
  }

  function endTour() {
    if (recording) stopRecording();
    tourGen++;
    detourGen++;
    clearTourTimers();
    tourActive = false;
    tourPlaying = false;
    tourMoving = false;
    ontour?.(false);
    routeLine?.remove(); doneLine?.remove(); doneBlocked?.remove(); traveller?.remove();
    routeLine = doneLine = doneBlocked = traveller = null;
    segPaths = [];
    segClear = [];
    imgLayers = [];
    imgLoading = false;
    renderMarkers(); // back to the clustered view
    if (map && ordered.length) {
      map.flyToBounds(L.latLngBounds(ordered.map(ll)).pad(0.2), {
        animate: !reduceMotion, duration: 0.6, maxZoom: 17,
      });
    }
  }

  /** MP4 (H.264) first, so the file opens everywhere — Finder/Explorer previews,
   *  Photos apps, WhatsApp — without a "convert this" step; WebM only where a
   *  browser's MediaRecorder can't produce MP4 (older Firefox). */
  // MP4 looked tempting (opens everywhere without a "convert this" step), but
  // Chrome's *live* MP4 muxer is still immature: it writes a container that
  // Chrome itself plays back fine but that stricter players (QuickTime,
  // Anteprima) decode as a single frozen frame — the whole clip collapses to
  // its last sample. WebM's VP8/VP9 muxing is the mature, reliable path for
  // an in-progress recording, so that's what we record.
  function pickRecMime(): string {
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
  }

  function saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Actually detaches Leaflet's own zoom/attribution controls from the map
   *  (not just CSS-hidden) so there's no doubt they're absent from whatever
   *  pixels the screen share hands to the recorder — restored once done. */
  function setMapChromeVisible(visible: boolean): void {
    if (!map) return;
    if (visible) {
      map.zoomControl?.addTo(map);
      map.attributionControl?.addTo(map);
    } else {
      map.zoomControl?.remove();
      map.attributionControl?.remove();
    }
  }

  function finishRecording(): void {
    recStream?.getTracks().forEach((tr) => tr.stop());
    recStream = null;
    recRecorder = null;
    recording = false;
    setMapChromeVisible(true);
    const chunks = recChunks;
    recChunks = [];
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: recMimeType });
    const baseName = `warmish-tour-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    saveBlob(blob, `${baseName}.webm`);
  }

  function stopRecording(): void {
    clearTimeout(recEndTimer);
    if (recRecorder && recRecorder.state !== 'inactive') recRecorder.stop();
    else finishRecording();
  }

  /** Share-picks the current tab, then (re)starts the tour at the chosen
   *  speed-up so the recorded run is already fast — no re-encoding after. */
  async function startRecording(mult: RecSpeed): Promise<void> {
    if (!map || !canTour || recording || !recSupported) return;
    recMenuOpen = false;
    recMult = mult;
    try { localStorage.setItem('warmish.recSpeed', String(mult)); } catch { /* private mode */ }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
        preferCurrentTab: true,
      } as unknown as DisplayMediaStreamOptions);
    } catch {
      return; // the visitor cancelled the share prompt
    }

    if (tourActive) endTour(); // `recording` is still false here — won't self-stop
    setMapChromeVisible(false);
    // Let the removal actually paint before the recorder grabs its first frame.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    recStream = stream;
    recChunks = [];
    recMimeType = pickRecMime();
    const rec = new MediaRecorder(stream, { mimeType: recMimeType, videoBitsPerSecond: 8_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    rec.onstop = finishRecording;
    stream.getVideoTracks()[0]?.addEventListener('ended', stopRecording); // "Stop sharing" in the browser bar
    recRecorder = rec;
    recording = true;
    rec.start(250);
    requestAnimationFrame(startTour);
  }

  function togglePlay() {
    if (!tourActive) return;
    tourPlaying = !tourPlaying;
    if (tourPlaying) {
      if (tourIdx >= ordered.length - 1) goToStop(0);
      else if (!tourMoving) goToStop(tourIdx + 1);
    } else {
      clearTimeout(tourTimer);
    }
  }

  function stepTo(i: number) {
    if (!tourActive) return;
    // Manual jumps (‹ › buttons, progress dots) snap straight there — no flight.
    goToStop(i, true);
  }

  function cycleSpeed() {
    const order: Speed[] = ['lento', 'normale', 'veloce'];
    tourSpeed = order[(order.indexOf(tourSpeed) + 1) % order.length];
    try { localStorage.setItem('warmish.tourSpeed', tourSpeed); } catch { /* private mode */ }
  }

  function cycleFraming() {
    const order: Framing[] = ['largo', 'medio', 'stretto'];
    tourFraming = order[(order.indexOf(tourFraming) + 1) % order.length];
    try { localStorage.setItem('warmish.tourFraming', tourFraming); } catch { /* private mode */ }
    // Re-frame the current stop right away so the choice is visible.
    if (tourActive) goToStop(tourIdx, true);
  }

  function onTourKey(ev: KeyboardEvent) {
    if (!tourActive) return;
    const tag = (ev.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    switch (ev.key) {
      case 'Escape': endTour(); break;
      case ' ': case 'Spacebar': togglePlay(); break;
      case 'ArrowRight': stepTo(tourIdx + 1); break;
      case 'ArrowLeft': stepTo(tourIdx - 1); break;
      default: return;
    }
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }

  $effect(() => {
    void ordered; // if the point set collapses under the tour, bail out
    if (tourActive && ordered.length < 2) endTour();
  });
</script>

<div class="wrap" class:touring={tourActive} class:recording={recording}>
  {#if mapTilesAllowed()}
  <div class="host" bind:this={host}></div>

  {#if canTour && !tourActive}
    <button class="tour-start" onclick={startTour} title={t('map.playTourTitle')}>
      <span class="tour-start-ico" aria-hidden="true">▶</span>
      {t('map.playTour')}
    </button>
  {/if}

  {#if tourActive}
    {@const cur = ordered[tourIdx]}
    <section class="tour-panel" aria-label={t('map.tourPanel')}>
      <div class="tour-stage">
        {#each imgLayers as layer (layer.id)}
          <img
            class="tour-img"
            src={layer.src}
            alt={t('map.processedImageOf', { name: cur?.name ?? '' })}
            draggable="false"
            transition:fade={{ duration: reduceMotion ? 0 : FADE_MS }}
          />
        {/each}
        {#if imgLoading && imgLayers.length === 0}
          <div class="tour-spin" aria-hidden="true"></div>
        {/if}
      </div>

      <div class="tour-bar">
        <div class="tour-id">
          <span class="tour-name">{cur?.name}</span>
          <span class="tour-sub">
            {#if cur?.time != null}{fmtStopTime(cur.time)} · {/if}{t('map.stopOf', { index: tourIdx + 1, total: ordered.length })}
          </span>
        </div>

        <div class="tour-progress" role="group" aria-label={t('map.tourProgress')}>
          {#each ordered as p, i (p.path)}
            <button
              class="tour-dot"
              class:done={i < tourIdx}
              class:cur={i === tourIdx}
              title={p.name}
              aria-label={t('map.stopN', { index: i + 1, name: p.name })}
              aria-current={i === tourIdx ? 'step' : undefined}
              onclick={() => stepTo(i)}
            ></button>
          {/each}
        </div>

        <div class="tour-controls">
          <button class="tour-btn" onclick={() => stepTo(tourIdx - 1)} disabled={tourIdx === 0}
            aria-label={t('map.prevStop')} title={t('map.prevStopTitle')}>&lsaquo;</button>
          <button class="tour-btn play" onclick={togglePlay}
            aria-label={tourPlaying ? t('map.pause') : t('map.resume')} title={tourPlaying ? t('map.pauseTitle') : t('map.resumeTitle')}>
            {tourPlaying ? '❙❙' : '▶'}
          </button>
          <button class="tour-btn" onclick={() => stepTo(tourIdx + 1)} disabled={tourIdx >= ordered.length - 1}
            aria-label={t('map.nextStop')} title={t('map.nextStopTitle')}>&rsaquo;</button>
          <button class="tour-btn framing" onclick={cycleFraming}
            title={t('map.framingTitle')}>
            <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" />
              <circle cx="12" cy="13" r="3.1" />
            </svg>{t(`map.framing.${tourFraming}`)}</button>
          <button class="tour-btn speed" onclick={cycleSpeed} title={t('map.speedTitle')}>
            <svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 17.6c0-2.5 2-4.3 4.8-4.3.9 0 1.7.2 2.3.5.5-1.3 1.6-2.4 3.1-3-.6-1.3-1.1-3.2-1.1-5.4 0-1.9.5-3 1.2-3 .8 0 1.6 1.2 2.1 3.1.4 1.4.5 2.8.5 3.8.8-.2 1.5-.2 2.2 0 1.6.5 2.7 1.6 2.7 2.9 0 1-.7 1.7-1.8 1.9-.6.1-1.2.1-1.9 0 .2.5.3 1 .3 1.5 0 1.9-1.6 3.4-4 3.4H7.2C4.8 21.9 3 20.1 3 17.6Z" />
            </svg>{t(`map.speed.${tourSpeed}`)}</button>
          <div class="rec-wrap">
            {#if recording}
              <button class="tour-btn rec active" onclick={stopRecording} title={t('map.recStopTitle')}>
                <span class="rec-dot" aria-hidden="true"></span>{t('map.recStop')}
              </button>
            {:else}
              <button class="tour-btn rec" onclick={() => recMenuOpen = !recMenuOpen}
                disabled={!recSupported} title={recSupported ? t('map.recTitle') : t('map.recUnsupported')}>
                <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="M16.5 10.2l5-2.7v9l-5-2.7z" />
                </svg>{t('map.rec')}
              </button>
              {#if recMenuOpen}
                <div class="rec-menu" role="menu">
                  <span class="rec-menu-label">{t('map.recSpeedLabel')}</span>
                  <div class="rec-speed-row">
                    {#each REC_SPEEDS as m (m)}
                      <button type="button" class="rec-speed-opt" onclick={() => startRecording(m)}>{m}×</button>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}
          </div>
          <button class="tour-btn close" onclick={endTour} aria-label={t('map.exitTour')} title={t('map.exitTourTitle')}>✕</button>
        </div>
      </div>
    </section>
  {/if}

  {#if !points.length}
    <div class="empty">
      <p>{t('map.noGps')}</p>
      <small>{t('map.noGpsBody')}</small>
      <a class="empty-link" href="geotag/index.html" target="_blank" rel="noopener">{t('map.noGpsLink')}</a>
    </div>
  {/if}
  {:else}
    <div class="consent" role="group" aria-label={t('map.consentTitle')}>
      <div class="consent-card">
        <h2>{t('map.consentTitle')}</h2>
        {#if mapConsent() === 'denied'}
          <p>{t('map.consentDeniedBody')}</p>
          <div class="consent-actions">
            <button type="button" class="primary" onclick={() => setMapConsent('granted')}>{t('map.consentEnable')}</button>
          </div>
        {:else}
          <p>{t('map.consentBody')}</p>
          <div class="consent-actions">
            <button type="button" class="primary" onclick={() => setMapConsent('granted')}>{t('map.consentAccept')}</button>
            <button type="button" onclick={() => setMapConsent('denied')}>{t('map.consentDecline')}</button>
          </div>
        {/if}
        {#if onshowprivacy}
          <button type="button" class="consent-link" onclick={onshowprivacy}>{t('map.consentPrivacyLink')}</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; }
  .host {
    width: 100%; height: 100%; background: var(--canvas-bg);
    animation: mapin 0.4s ease both;
  }
  @keyframes mapin { from { opacity: 0; } to { opacity: 1; } }

  .empty {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 8px; text-align: center;
    color: var(--muted); background: var(--bg); pointer-events: none; padding: 24px;
  }
  .empty p { margin: 0; font-size: 15px; }
  .empty small { max-width: 320px; line-height: 1.5; }
  .empty-link {
    pointer-events: auto; margin-top: 4px; font-size: 12.5px;
    color: var(--accent); text-decoration: none;
  }
  .empty-link:hover { text-decoration: underline; }

  /* Consent gate — shown instead of the map until tile downloads are allowed.
     Below the app's modals (PrivacyModal is 1000) so its "privacy notice" link
     opens a dialog that sits on top. */
  .consent {
    position: absolute; inset: 0; z-index: 450;
    display: flex; align-items: center; justify-content: center; padding: 24px;
    background: var(--bg);
  }
  .consent-card {
    max-width: 420px; display: flex; flex-direction: column; gap: 10px;
    padding: 18px 20px; border: 1px solid var(--line); border-radius: 10px;
    background: var(--panel); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  }
  .consent-card h2 { margin: 0; font-size: 13px; }
  .consent-card p { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--muted); }
  .consent-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
  .consent-actions button {
    padding: 7px 14px; font-size: 12.5px;
    background: var(--input-bg); color: var(--text);
    border: 1px solid var(--line); border-radius: 7px; cursor: pointer;
  }
  .consent-actions button:hover { border-color: var(--accent); }
  .consent-actions button.primary {
    background: var(--accent); color: var(--on-accent); border-color: var(--accent); font-weight: 600;
  }
  .consent-link {
    align-self: flex-start; margin-top: 2px; padding: 0;
    background: none; border: 0; cursor: pointer;
    font-size: 11.5px; color: var(--accent); text-decoration: underline; text-underline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .host { animation: none; }
  }

  /* --- Leaflet, themed dark --------------------------------------------- */
  :global(.leaflet-container) {
    background: var(--canvas-bg);
    font: inherit;
    outline: none;
  }
  /* Clear the view-mode switch that floats at the pane's top-left. */
  :global(.leaflet-top.leaflet-left) { top: 44px; }
  :global(.leaflet-bar),
  :global(.leaflet-control-layers) {
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }
  :global(.leaflet-bar a),
  :global(.leaflet-control-layers-toggle) {
    background: var(--panel);
    color: var(--text);
    border-bottom-color: var(--line);
  }
  :global(.leaflet-bar a:hover) { background: color-mix(in srgb, var(--panel) 86%, var(--text)); }
  :global(.leaflet-control-layers-expanded) {
    background: var(--panel);
    color: var(--text);
    padding: 8px 10px;
  }
  :global(.leaflet-control-attribution) {
    background: color-mix(in srgb, var(--panel) 82%, transparent);
    color: var(--muted);
  }
  :global(.leaflet-control-attribution a) { color: var(--accent); }

  :global(.leaflet-popup-content-wrapper),
  :global(.leaflet-popup-tip) {
    background: var(--panel) !important;
    color: var(--text) !important;
    border: 1px solid var(--line);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }
  :global(.leaflet-popup-content) { margin: 10px 12px; font: inherit; color: var(--text); }
  :global(.leaflet-popup-close-button) { color: var(--muted) !important; }

  :global(.wm-pop) { display: grid; gap: 5px; min-width: 190px; }
  :global(.wm-pop-thumb) {
    width: 100%; aspect-ratio: 4 / 3; object-fit: cover;
    border-radius: 5px; border: 1px solid var(--line); background: #000;
  }
  :global(.wm-pop-name) {
    font-size: 12.5px; font-weight: 600; word-break: break-all; color: var(--text);
  }
  :global(.wm-pop-coord) {
    font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums;
  }
  :global(.wm-pop-meta) { font-size: 11.5px; color: var(--muted); }
  :global(.wm-pop-link) { display: inline-block; margin-top: 4px; color: var(--accent); text-decoration: none; }
  :global(.wm-pop-link:hover) { text-decoration: underline; }
  :global(.wm-pop-open) {
    margin-top: 3px; width: 100%; padding: 6px 10px; font-size: 12px;
    background: var(--accent); color: var(--on-accent); border: 0; border-radius: 5px; cursor: pointer;
  }
  :global(.wm-pop-open:hover) { filter: brightness(1.08); }

  :global(.wm-list) {
    list-style: none; margin: 4px 0 0; padding: 0;
    max-height: 190px; overflow-y: auto; display: grid; gap: 3px;
  }
  :global(.wm-list-open) {
    width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 5px 8px; font-size: 12px; text-align: left; cursor: pointer;
    background: var(--bg); border: 1px solid var(--line); border-radius: 4px; color: var(--text);
  }
  :global(.wm-list-open:hover) { border-color: var(--accent); }
  :global(.wm-list-name) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.wm-list-tag) { flex: none; font-size: 10px; color: var(--accent); }

  /* --- Markers -------------------------------------------------------------- */
  :global(.wm-pin-wrap) { overflow: visible; background: transparent; border: 0; }
  :global(.wm-pin) {
    position: relative; width: 30px; height: 30px;
    display: grid; place-items: center; overflow: visible;
    transition: transform 0.12s ease;
  }
  :global(.wm-pin-wrap:hover .wm-pin) { transform: scale(1.18); z-index: 1000; }
  :global(.wm-dot) {
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--accent); border: 3px solid #fff;
    box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.4);
  }
  :global(.wm-pin.is-active .wm-dot) {
    background: #fff; border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent), 0 2px 6px rgba(0, 0, 0, 0.5);
  }
  :global(.wm-cone) {
    position: absolute; left: 0; top: 0; overflow: visible;
    transform-origin: 15px 15px; pointer-events: none;
  }
  :global(.wm-cone path) { fill: color-mix(in srgb, var(--accent) 55%, transparent); }
  :global(.wm-pin.is-active .wm-cone path) { fill: color-mix(in srgb, var(--accent) 72%, transparent); }

  :global(.wm-pin--cluster) {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--accent); border: 3px solid #fff;
    color: var(--on-accent); font-size: 12px; font-weight: 700;
    box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.45);
  }
  :global(.wm-pin--cluster.is-active) {
    box-shadow: 0 0 0 3px var(--accent), 0 2px 8px rgba(0, 0, 0, 0.5);
  }
  :global(.wm-count) { line-height: 1; font-variant-numeric: tabular-nums; }

  :global(.wm-pin.is-active::before) {
    content: ''; position: absolute; width: 30px; height: 30px; border-radius: 50%;
    border: 2px solid var(--accent); animation: wmpulse 2s ease-out infinite;
  }
  @keyframes wmpulse {
    0% { transform: scale(0.5); opacity: 0.9; }
    100% { transform: scale(1.9); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.wm-pin.is-active::before) { animation: none; opacity: 0; }
    :global(.wm-pin) { transition: none; }
  }

  /* --- Guided tour ------------------------------------------------------- */
  .tour-start {
    position: absolute; top: 12px; left: 12px; z-index: 600;
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px 8px 12px; font-size: 12.5px; font-weight: 600;
    color: var(--on-accent); background: var(--accent);
    border: 0; border-radius: 999px; cursor: pointer;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  }
  .tour-start:hover { filter: brightness(1.06); }
  .tour-start-ico { font-size: 10px; line-height: 1; }

  .wrap.touring :global(.wm-pin-wrap) {
    opacity: 0.24; pointer-events: none; transition: opacity 0.4s ease;
  }
  /* Keep the tile attribution readable — the panel sits over its usual corner. */
  .wrap.touring :global(.leaflet-bottom.leaflet-right) { right: auto; left: 0; }
  /* The shell's view-mode switch is hidden during the tour — reclaim its gap. */
  .wrap.touring :global(.leaflet-top.leaflet-left) { top: 0; }
  /* Clean background for a recording: no zoom buttons, no tile attribution. */
  .wrap.recording :global(.leaflet-control-zoom),
  .wrap.recording :global(.leaflet-control-attribution) { display: none; }
  :global(.wm-route) { stroke: var(--muted); }
  :global(.wm-route-done) { stroke: var(--accent); }
  :global(.wm-route-blocked) { stroke: var(--accent); }
  :global(.wm-traveller-wrap) { background: transparent; border: 0; }
  :global(.wm-traveller) {
    display: block; width: 14px; height: 14px; border-radius: 50%;
    background: var(--accent); border: 3px solid #fff;
    box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.45);
  }
  :global(.wm-traveller)::after {
    content: ''; position: absolute; left: 50%; top: 50%;
    width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
    border: 2px solid var(--accent); animation: wmpulse 1.8s ease-out infinite;
  }

  .tour-panel {
    position: absolute; z-index: 620;
    top: 12px; right: 12px; bottom: 12px;
    width: clamp(300px, 44vw, 720px);
    display: flex; flex-direction: column; gap: 10px;
    padding: 10px; border: 1px solid var(--line);
    background: var(--panel); border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
    animation: tourin 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes tourin { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }

  .tour-stage {
    position: relative; flex: 1; min-height: 0;
    background: #0b0d10; border-radius: 8px; overflow: hidden;
  }
  .tour-img {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: contain;
  }
  .tour-spin {
    position: absolute; left: 50%; top: 50%; width: 30px; height: 30px;
    margin: -15px 0 0 -15px; border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.25); border-top-color: #fff;
    animation: tourspin 0.9s linear infinite;
  }
  @keyframes tourspin { to { transform: rotate(360deg); } }

  .tour-bar { display: flex; flex-direction: column; gap: 9px; }
  .tour-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .tour-name {
    font-size: 13px; font-weight: 600; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tour-sub { font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }

  .tour-progress {
    display: flex; gap: 2px; height: 6px; overflow: hidden; border-radius: 3px;
  }
  .tour-dot {
    flex: 1; min-width: 2px; height: 100%; padding: 0;
    background: var(--line-strong); border: 0; border-radius: 2px; cursor: pointer;
    transition: background 0.25s ease;
  }
  .tour-dot.done { background: color-mix(in srgb, var(--accent) 55%, var(--line-strong)); }
  .tour-dot.cur { background: var(--accent); }
  .tour-dot:hover { background: color-mix(in srgb, var(--accent) 80%, var(--text)); }

  .tour-controls { display: flex; align-items: center; gap: 6px; }
  .tour-btn {
    min-width: 34px; height: 32px; padding: 0 8px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 13px; line-height: 1;
    background: var(--input-bg); color: var(--text);
    border: 1px solid var(--line); border-radius: 7px; cursor: pointer;
  }
  .tour-btn:hover:not(:disabled) { border-color: var(--accent); }
  .tour-btn:disabled { opacity: 0.4; cursor: default; }
  .tour-btn.play { background: var(--accent); color: var(--on-accent); border-color: var(--accent); font-size: 11px; }
  .tour-btn.speed,
  .tour-btn.framing { text-transform: capitalize; font-size: 11.5px; font-weight: 600; gap: 5px; }
  .tour-btn .ico { width: 14px; height: 14px; flex: none; color: var(--muted); }
  .tour-btn.close { margin-left: auto; }
  .rec-wrap { position: relative; }
  .tour-btn.rec { font-size: 11.5px; font-weight: 600; gap: 5px; }
  .tour-btn.rec.active { background: #e0392b; color: #fff; border-color: #e0392b; }
  .rec-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #fff;
    animation: wmrecblink 1.1s ease-in-out infinite;
  }
  @keyframes wmrecblink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  .rec-menu {
    position: absolute; bottom: calc(100% + 8px); right: 0; z-index: 5;
    display: flex; flex-direction: column; gap: 7px; padding: 10px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 9px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); width: max-content;
  }
  .rec-menu-label { font-size: 11px; color: var(--muted); }
  .rec-speed-row { display: flex; gap: 5px; }
  .rec-speed-opt {
    min-width: 40px; height: 30px; padding: 0 8px;
    background: var(--input-bg); color: var(--text);
    border: 1px solid var(--line); border-radius: 6px; cursor: pointer; font-size: 12.5px;
  }
  .rec-speed-opt:hover { border-color: var(--accent); color: var(--accent); }

  @media (max-width: 760px) {
    .tour-panel { left: 8px; right: 8px; top: 8px; bottom: 8px; width: auto; }
  }
  @media (prefers-reduced-motion: reduce) {
    .tour-panel { animation: none; }
    .tour-spin { animation-duration: 0s; }
    :global(.wm-traveller)::after { animation: none; opacity: 0; }
  }
</style>
