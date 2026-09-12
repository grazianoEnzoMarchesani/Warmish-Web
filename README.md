# Warmish Web

Static, client-side rewrite of Warmish. Runs in any modern browser on any OS,
with no upload and no server-side processing — and, critically, **no ExifTool
and no Perl**, which is what breaks the desktop build on other Macs.

The one exception to "nothing leaves the browser" is the optional map view, which
loads basemap tiles from an external provider — see [Map view](#map-view).

**Live demo:** <https://grazianoenzomarchesani.github.io/Warmish-Web/> — deployed
to GitHub Pages on every push to `main`. See [Deployment](#deployment-github-pages).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | FLIR APP1 parser + Planck inversion, validated against the desktop engine | done |
| 1 | Core hardening (palette LUTs, blend modes, deterministic output) | done |
| 2 | Minimal UI: open → colour map → pan/zoom → probe → export PNG | done |
| 3 | ROI system (rect/spot/polygon) + session JSON import/export | done |
| 4 | Batch processing in a Web Worker + zip export | done |
| 5 | Parallel-run validation against the desktop app | in progress |

Phase 5 is the one that does not close on its own: keep both apps available and
keep widening the sample set. See [Verified equivalence](#verified-equivalence)
for what is currently proven and [The open risk](#the-open-risk) for what is not.

Beyond the plan's phases, and also shipped: visible-image overlay with all 13
blend modes + manual alignment, 20 post-processing filters for the visible frame,
automatic EXIF-orientation correction for portrait shots, [automatic scene and
area labelling](#automatic-scene-and-area-labelling) (road/building/person
detection + smart min/max), GPS parsing + the Leaflet [map view](#map-view)
with a selectable, recordable [guided tour](#guided-tour-and-video-export), the
[geotag companion tool](#geotag-companion-tool), default-deny consent gates for
both network-touching features with a privacy notice, IT/EN
[localisation](#languages), and
[GitHub Pages deployment](#deployment-github-pages).

## Deviation from the original plan

The plan called for a Rust→WASM core. This is **TypeScript instead**: no Rust
toolchain was installed, and §0 of the plan already notes that every hard
requirement (client-side, zero upload, cross-OS) comes from running in the browser,
not from WASM. The core lives behind a narrow, pure interface (`src/core/`), so
swapping in a WASM implementation later touches nothing else.

## Layout

```
src/core/       pure logic, no DOM — parser, Planck math, palettes, blend modes,
                visible-image filters, 16-bit PNG, ROI masks and statistics,
                session I/O, the CSV/GeoJSON report, the export pipeline
src/lib/        canvas viewer (pan/zoom + interactive ROI layer), Leaflet map
                view, batch worker, modals, consent banner, toasts, i18n helper
src/locales/    UI strings — it.json / en.json
src/App.svelte  UI shell
tools/          build-time palette LUT generation from matplotlib (needs the desktop repo)
tests/          Phase-0/3 numeric gates + browser smoke test
tests/fixtures/ sample FLIR images, vendored so the suite runs standalone
tests/reference/ committed ground truth from the desktop engine
```

The export ZIP layout — folder structure, the four per-image PNGs, `aree.csv`
columns, `manifest.json` / GeoJSON schemas — is specified in
[OUTPUTS.md](OUTPUTS.md) and enforced by `tests/phase3.ts` and `tests/ui-smoke.ts`.

## Commands

```bash
npm install
npm run dev      # local development
npm run build    # -> dist/, ready to upload
npm test         # Phase-0 + Phase-3 + GPS numeric gates
npm run build && npm run test:ui   # drives the built app in Chromium (append -- --headed to watch)
```

`npm test` runs against the sample images in `tests/fixtures/` and the committed
ground truth in `tests/reference/`, so it needs nothing beyond `npm install`. That
ground truth was produced by the Warmish **desktop** engine (`core/thermal_engine.py`,
ExifTool + numpy); to regenerate it, check the desktop repo out alongside this one,
delete `tests/reference/`, and re-run — `tests/python_reference.py` drives it.

Palettes (`src/core/palettes.json`) are regenerated only when the desktop's
`constants.py` changes: `DESKTOP_REPO=/path/to/Warmish npm run palettes`.

## Languages

The UI ships in Italian (default) and English, switchable from the top bar and
persisted in `localStorage['warmish.lang']`. Strings live in `src/locales/`;
`src/lib/i18n.ts` is the pure dictionary + `translate()`, `src/lib/i18n.svelte.ts`
the reactive wrapper — components use the latter, the batch worker and other plain
`.ts` modules the former. The standalone geotag page carries its own inline
dictionary and reads the same key. Export ZIP filenames, `aree.csv` headers,
`manifest.json` keys and GeoJSON properties are deliberately left untranslated —
they are a stable contract (see OUTPUTS.md).

## Verified equivalence

For every sample image, against the desktop engine:

- raw sensor array identical (checksum match), dimensions identical
- Planck constants R1/R2/B/F/O exact
- temperatures within 1e-6 °C over 500 sampled pixels per image
- palette output byte-identical to matplotlib for 5 palettes

For the ROI layer, against the desktop's own `ROIController`:

- masks identical pixel for pixel (count and index checksum), including ROIs
  that straddle or fall entirely outside the sensor
- min/max/mean/median/std within 1e-6 °C, recomputed with each ROI's own emissivity
- a sidecar written by the desktop imports, and a round trip preserves it

Beyond the suite, all 91 images from a second T530 shoot were parsed and checked
field by field against ExifTool: every value matched.

### One deliberate divergence

The desktop app reads metadata through PyExifTool's `-n` mode, so it receives
`RelativeHumidity` as a fraction (`0.5`) and feeds it into a correction term
written for percent. Every desktop pixel therefore carries a fixed −0.00099 °C
bias. The web app uses percent — matching its own UI and the desktop's own
default of `50.0` — and `tests/phase0.ts` subtracts the bias explicitly rather
than hiding it. The magnitude is far below sensor accuracy, but the desktop app
has a real unit bug here.

Related dev note: the core keeps parsed metadata at full float32 precision and
rounds only in the UI number inputs. Rounding `24.9999938964844 °C` to `25.0`
shifts results by up to 0.1 °C on a low-emissivity scene (ε = 0.30).

### Known gaps against the desktop

Small and deliberate — listed so they are not rediscovered as bugs:

- **No auto-save.** A browser cannot silently write a sidecar next to the image.
  Saving is a download; resuming means opening the `.json` alongside the photo.
  The UI says so rather than hiding it.
- **ROI statistics use the parameters on screen.** The desktop recomputes a ROI
  from the file's *metadata* parameters, ignoring UI edits to reflected /
  atmospheric temperature. With unmodified parameters the two agree exactly —
  what `tests/phase3.ts` checks.
- **Humidity units on import.** Desktop sidecars store a fraction (see above);
  `humidityToPercent()` in `src/core/session.ts` reads a value ≤ 1.5 as a
  fraction and anything larger as percent, and always writes percent.
- **One batch path, no presets.** Selecting or dropping several images (or a
  folder) opens the filmstrip; each image keeps its own calibration and "Applica
  a selezionate" pushes palette / parameters / areas across a set. "Esporta
  cartella (.zip)" then feeds the same worker every other export uses.

### The open risk

Six sample files from two camera models are the only ground truth in the suite,
plus 91 further images from a second T530 shoot checked field by field against
ExifTool. FLIR's APP1 format varies across models and firmware in ways only
partly documented even in ExifTool's own reverse-engineered `FLIR.pm`, so passing
here does not prove the parser generalises. The mitigation is to keep widening
`tests/fixtures/` and to keep the desktop app (with real ExifTool) available as a
cross-check; any new camera variant the parser handles must be added to the
fixtures so the suite guards against regressions. The binary layout as
reverse-engineered is documented in the header comment of `src/core/flir.ts`.

## Orientation correction

FLIR sensors always write the raw thermal grid, and the embedded visible JPEG,
in native landscape layout — a portrait shot only differs by the parent JPEG's
standard EXIF `Orientation` tag (3/6/8). `src/core/exif.ts` `getOrientation()`
reads it, and `parseThermalImage()` in `src/core/flir.ts` rotates the raw grid
(and its alignment offset) eagerly, so every downstream consumer — ROI math,
compositing, exports — works in the already-corrected frame without knowing
orientation exists. The visible frame stays undecoded bytes until a canvas
exists to rotate it, so callers go through `decodeVisible()` instead of
decoding the embedded JPEG directly. Only the no-mirror values that real
cameras produce are handled; anything else is left untouched rather than
guessed at.

## Map view

`src/core/exif.ts` `parseGps()` reads the standard GPS IFD (latitude/longitude,
altitude, `GPSImgDirection`) straight from the JPEG. The "Mappa" toggle in the
viewer (`src/lib/MapView.svelte`, keyboard `M`) plots every GPS-tagged frame —
the whole folder when one is open, otherwise the current image — on a Leaflet
map, with a heading cone where `GPSImgDirection` is present and a click-through
back to the thermal viewer. FLIR cameras often stamp one coarse fix on a whole
session, so overlapping markers cluster into a counter that lists its shots and
splits as you zoom in.

This is one of only two things in the app that touch the network (the other is
scene detection, see [below](#automatic-scene-and-area-labelling)): the basemap
tiles come from OpenFreeMap, Esri World Imagery or OpenStreetMap, so the area
on screen is revealed to that provider. No image or coordinate is uploaded.

Because it is a network path, it is gated. `src/lib/consent.svelte.ts` holds a
default-deny map-tile consent (key `warmish.mapConsent`, six-month expiry);
until it reads `granted`, `MapView` never instantiates Leaflet and shows a consent
panel instead, and the standalone geotag page (which shares the key on the same
origin) does the same before adding its tile layers. Scene detection has its
own, separate consent (`warmish.sceneConsent`) built on the same store.

`ConsentBanner.svelte` surfaces the choice on every startup: a non-blocking
bottom-left card until consent is granted ("Non ora" records a refusal and hides
it for the session; it returns on the next load). Once granted it stops showing —
the "Privacy" button in the top bar reopens the privacy notice, whose preferences
block grants or withdraws at any time. The notice text is `src/lib/privacy.ts`
(also reached from the "Apri" menu and the geotag page's `../#privacy` link).
`tests/gps.ts` checks `parseGps` against ExifTool's numbers for the sample images,
and `test:ui` exercises the banner, the gate and the map with tile requests
stubbed offline.

### Geotag companion tool

`public/geotag/` is a standalone static page (its own HTML + vendored Leaflet,
piexifjs and fflate — no shared code with the app) for the case the map view
exposes: photos with a missing or session-cached GPS fix. It plots the photos on
a map by hand and rewrites the **standard EXIF GPS** (lat/lon, optional heading
and altitude) into a downloadable ZIP — the FLIR radiometric block is left
untouched, verified in `test:ui`. The app links to it (`geotag/index.html` — the
explicit file, since Vite's dev server SPA-falls-back `/geotag/` to the app) from
the sidebar and from the map view's empty / all-same-coordinate states. It ships
in `dist/geotag/` via Vite's `public/` copy. See `public/geotag/README.md`.

### Guided tour and video export

The map view can fly through the GPS-tagged frames in capture order as a
guided tour, stripping the app shell down to just the map for the duration.
Which frames are on the map — and so which stops the tour visits — is the same
filmstrip checkbox selection used for batch processing (`selection` in
`src/App.svelte`, feeding the `mapPoints` marker list): only checked images get
a marker, so picking a subset before opening "Mappa" scopes both the markers
and the tour to it, without a separate control to learn.

`MapView.svelte` can also record the tour to a file: "Registra" prompts the
browser's own tab-capture share picker (`getDisplayMedia`), then re-starts the
tour at a chosen speed multiplier (1×–3×) and pipes the captured frames
through `MediaRecorder` straight to a downloadable `warmish-tour-<timestamp>.webm`.
Nothing is re-rendered or re-encoded after the fact — the speed-up is applied
to the tour's own fly/dwell timings before capture, and Leaflet's zoom and
attribution controls are actually removed from the map (not just hidden) so
the recorded frame is clean. WebM (VP9/VP8) is used rather than a live MP4
mux, which some strict players decode as a single frozen frame. Recording
needs a browser with `getDisplayMedia` + `MediaRecorder` (all evergreen
desktop browsers); the button disables itself otherwise.

### Automatic scene and area labelling

The Areas panel can place ROIs by itself instead of only by hand, in two ways:

- **"Rileva scena" (scene detection).** Runs Cityscapes-trained DeepLabv3
  (`@tensorflow-models/deeplab`, `src/core/sceneSegmentation.ts`) on the
  embedded real photo, entirely client-side, and drops one spot ROI per
  recognised road, natural terrain, vegetation patch, building (adjacent
  buildings with visibly different surfaces are kept separate) and person.
  It needs the real photo, so images without one show an explicit message
  instead of silently doing nothing. It's available per image and in bulk
  (`bulk.sceneDetect` — one image at a time, adding to whatever ROIs that
  image already has, never replacing them). The ~2MB model is fetched from
  Google's model hub on first use and cached by the browser afterwards — the
  **second** (and last) thing this app reaches the network for, gated behind
  its own consent exactly like the map tiles (see [Map view](#map-view)).
- **"Posiziona aree intelligenti" (smart min/max).** Places a min and a max
  spot ROI on the coldest and hottest pixels, excluding the sky from the cold
  pick — outdoors, the sky is reliably the coldest thing in frame but rarely
  the point of interest (`smartMinMaxPlacement` in `src/core/roi.ts`). Sky
  exclusion prefers a real signal when a photo is available — `src/core/sky.ts`
  grows a region from the top edge on local texture (near-zero contrast),
  independent of colour, so it isn't fooled by an overcast or gradient sky —
  and falls back to a thermal-only heuristic otherwise (a cold top-edge region
  grown with noise tolerance, sanity-checked against a hard median cap and a
  band/separation test so a sky-less gradient, e.g. an indoor ceiling shot,
  doesn't get misread as sky).

Both are heuristics rather than ground truth, and unlike the rest of the app
have no desktop-engine equivalent to validate against. Smart min/max in
particular is still being evaluated and may be reworked or dropped if it
doesn't earn its place.

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` runs `npm ci && npm run build` on every push to
`main` and publishes `dist/` to GitHub Pages at
<https://grazianoenzomarchesani.github.io/Warmish-Web/>. Pages source is set to
**GitHub Actions** (Settings → Pages). The `base: './'` in `vite.config.ts`
makes asset URLs relative, so the same build serves correctly from the project
subpath or from any other static host. The map view reaches its tile provider,
and scene detection reaches Google's model hub, only after the visitor grants
the respective consent (see [Map view](#map-view) and [Automatic scene and area
labelling](#automatic-scene-and-area-labelling)); nothing else touches the
network. GitHub, Inc. records the usual access logs for the hosted
site — covered in the privacy notice.
