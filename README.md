# Locus

*Drop a pin and discover what happened near that place.*

Locus is a standalone, privacy-first client of the public [GeoHistory](https://github.com/noffsingercb/GeoHistory) API. GeoHistory owns the dataset and deterministic retrieval; Locus owns presentation and client product policy.

## How it works

A click or drag settles for 400 ms, then Locus walks 5 / 15 / 50 / 150 km sequentially until 12 attributed records are available. GeoHistory selects by distance and returns that set in date order; Locus preserves the order. Births and deaths are excluded by client policy. Wide-rung results can still be founding-heavy; that is an explicit v0.1 corpus limitation, not a hidden ranking claim.

## Privacy

- The coordinate remains in memory and is sent only in the JSON body of `POST /v1/nearby`.
- It never enters a URL, browser history, storage, cookies, analytics, telemetry, or feedback.
- The API call sets `referrerPolicy: no-referrer`.
- The page uses `strict-origin-when-cross-origin`: tile providers receive only the Locus origin, never a path or coordinate.
- Tiles are requested by z/x/y viewport index; no exact pin coordinate is appended.
- `Permissions-Policy: geolocation=()` mechanically keeps location sharing out of v0.1.

The static privacy suite scans TypeScript plus `index.html` and `public/_headers`. It is a regression guard, not a substitute for the required browser smoke test.

## Attribution invariant

Every displayed event must carry a usable HTTP(S) source URL from GeoHistory. A response containing an unattributed row is rejected as malformed; Locus never displays that row with a substitute or a “missing source” placeholder. Page-level CC BY-SA and dataset attribution supplement, but do not replace, the per-item source link.

## Local development against GeoHistory

Use two PowerShell windows. Closing the API window stops the service.

**Window 1 — GeoHistory API**

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\path\to\GeoHistory-nearby-validation'
$env:GEOHISTORY_DB = 'C:\path\to\events.sqlite'
$env:PORT = '8799'
$env:ALLOW_DEV_ORIGINS = 'true'
$env:ALLOW_NO_ORIGIN_POST = 'true' # needed only for shell probes with no Origin
npm run serve
```

**Window 2 — Locus**

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\path\to\locus'
'VITE_GEOHISTORY_API_BASE_URL=http://localhost:8799' | Set-Content '.env.local'
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

A browser supplies `Origin: http://localhost:5173`. A shell probe must either supply that header or use the explicit `ALLOW_NO_ORIGIN_POST=true` development escape hatch. Never widen production CORS for local convenience.

## Tiles and deployment

The default is keyless CARTO Voyager raster tiles, with OpenStreetMap and CARTO attribution. `VITE_TILE_URL` and `VITE_TILE_ATTRIBUTION` can replace the provider together without a code change. Browser validation must confirm that tiles load; the module test suite cannot establish third-party availability.

Cloudflare Pages builds with `npm run build` and serves `dist`. Set `VITE_GEOHISTORY_API_BASE_URL` to the deployed API origin. Append the exact Locus production origin—scheme and hostname, no trailing slash—to `ALLOWED_ORIGIN` in the GeoHistory Render dashboard. Preview hostnames remain refused; no wildcard.

## v0.2 location sharing

Not in this release. A future “Use my location” action must be explicit, never automatic or default, and denial must leave pin input working.

## Repository boundary

Locus contains no dataset, engine, backend, account, tracking, or distance implementation. Code is MIT licensed; historical data is supplied by GeoHistory and subject to the attribution terms in [DATA-ATTRIBUTION.md](DATA-ATTRIBUTION.md).
