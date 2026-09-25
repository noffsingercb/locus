# Locus

*Drop a pin and discover what happened near that place.*

Locus is a standalone, privacy-first web applet that consumes the public [GeoHistory](https://github.com/noffsingercb/GeoHistory) API. GeoHistory owns the historical dataset, ingest and scoring pipeline, deterministic query engine, and read-only API. Locus owns only presentation and client-side product policy.

Locus stores nothing. Caller coordinates must remain in memory and may be sent only to the configured GeoHistory API. They must never be logged, persisted, placed in a URL, included in analytics, or sent to any other service.

## Status

v0.1: map pin input, the radius ladder, the result list, and the escalated, short, empty, and failure states. Location sharing is deliberately not implemented; see [v0.2](#v02-location-sharing-not-in-this-release).

## How it works

1. You click the map. The pin settles 400 ms after the last movement.
2. Locus asks GeoHistory `POST /v1/nearby` for the closest records within 5 km.
3. If fewer than 12 come back, it widens: 15 km, then 50 km, then 150 km, stopping at the first radius that answers.
4. The radius actually used is stated above the list, so an escalated answer never looks like a local one.

The API selects by **distance** and returns that selected set in **date order**. Locus renders the response in the order it arrives and does not re-rank.

### What is a client decision, and why

| Decision | Lives here because |
| --- | --- |
| The 5/15/50/150 km ladder | It is measured product policy. The API answers one radius per call. |
| Stopping at 12 results | Result density is an interaction choice. |
| Excluding births and deaths | "What happened here" is an interpretation. Roughly 85% of rows within 5 km of a dense city are biography; without this the list answers a different question. It is sent as a generic `excludeCategories` filter, not a special case upstream. |
| Empty-state and escalation copy | Presentation. |
| Debounce timing | Interaction. |

The dataset, the distance maths, the deterministic tie-break chain, and the coordinate-quality policy (`coordinateMode`) all live upstream and are not reimplemented here.

## Privacy

- The coordinate exists in memory only. It is never written to the URL, history, `localStorage`, `sessionStorage`, cookies, or any analytics or error-reporting payload.
- It travels in the JSON body of a `POST`, never a query string, because URLs are the most-retained part of an HTTP request.
- Map tiles are fetched by viewport tile index only; the pin coordinate is never appended to a third-party URL.
- There is no backend, no account, no tracking script, and no saved state.
- `public/_headers` sets `Referrer-Policy: no-referrer` and `Permissions-Policy: geolocation=()`.

These are enforced by tests in `test/privacy.test.ts`, which scan the source and fail on a forbidden API, on a network call outside `src/api.ts`, or on any reference to `geolocation`.

### v0.2: location sharing, not in this release

The input layer is structured so a "use my location" affordance can be added beside the map without restructuring. When it ships it will require an explicit user action, will never run on page load, will never be the default input, and a denial will be a normal state that leaves pin input working — not an error.

## Development

Requirements: Node.js 20 or later.

```powershell
npm install
Copy-Item .env.example .env
npm run typecheck
npm test
npm run build
npm run dev
```

Set `VITE_GEOHISTORY_API_BASE_URL` to the base URL of the GeoHistory service. It is a public, unauthenticated endpoint; this variable is configuration, not a secret.

Against a locally running GeoHistory instance, start the API with `ALLOW_DEV_ORIGINS=true` so the dev-server origin is accepted.

## Deployment

Static output only: `npm run build` emits `dist`, which Cloudflare Pages serves directly. Build command `npm run build`, output directory `dist`, and one environment variable, `VITE_GEOHISTORY_API_BASE_URL`.

**Before the deployed app can work,** the Locus production origin must be appended to the comma-separated `ALLOWED_ORIGIN` value on the GeoHistory Render service dashboard — scheme and hostname, no trailing slash, no wildcard. `render.yaml` declares that key with `sync: false`, so a blueprint sync will not set it.

Cloudflare Pages preview hostnames are refused by design and are not allowlisted. Test preview builds against a local API instead.

## Repository boundary

- **This repository:** static client, map interaction, result presentation, client-side radius policy, and user-facing states.
- **GeoHistory:** dataset, ingest/scoring pipeline, deterministic retrieval, and the read-only API.
- **Never here:** a dataset copy, a reimplementation of the engine, analytics, accounts, tracking, or a backend.

## Attribution

Locus code is licensed under the [MIT License](LICENSE).

Historical event data is supplied by GeoHistory. Every displayed event carries a per-item source link from `source_url`; a row without a usable link renders without one and is counted as an attribution defect in tests, never given a substitute. Wikipedia-derived content is distributed under [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/); see [DATA-ATTRIBUTION.md](DATA-ATTRIBUTION.md).

Map tiles © OpenStreetMap contributors, used under the [ODbL](https://www.openstreetmap.org/copyright).
