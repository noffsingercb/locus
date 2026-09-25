# Locus

*Drop a pin and discover what happened near that place.*

Locus is a standalone, privacy-first web applet that consumes the public [GeoHistory](https://github.com/noffsingercb/GeoHistory) API. GeoHistory owns the historical dataset, ingest and scoring pipeline, deterministic query engine, and read-only API. Locus owns only presentation and client-side product policy.

Locus stores nothing. Caller coordinates must remain in memory and may be sent only to the configured GeoHistory API. They must never be logged, persisted, placed in a URL, included in analytics, or sent to any other service.

## Status

Repository scaffold only. The map, nearby-event query flow, result list, and deployment configuration will land in later reviewed slices.

## Development

Requirements: Node.js 20 or later.

```powershell
npm install
Copy-Item .env.example .env
npm run typecheck
npm run build
npm run dev
```

Set `VITE_GEOHISTORY_API_BASE_URL` to the base URL of the GeoHistory service. It is a public, unauthenticated endpoint; this variable is configuration, not a secret.

## Repository boundary

- **This repository:** static client, map interaction, result presentation, client-side radius policy, and user-facing states.
- **GeoHistory:** dataset, ingest/scoring pipeline, deterministic retrieval, and the read-only API.
- **Never here:** a dataset copy, a reimplementation of the engine, analytics, accounts, tracking, or a backend.

## Attribution

Locus code is licensed under the [MIT License](LICENSE).

Historical event data is supplied by GeoHistory. Displayed events must retain a per-item source link from `source_url`. Wikipedia-derived content is distributed under [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/); see [DATA-ATTRIBUTION.md](DATA-ATTRIBUTION.md).

## Intended deployment

The intended host is Cloudflare Pages. Deployment configuration will be added with the first product slice after the API/client contract is approved.
