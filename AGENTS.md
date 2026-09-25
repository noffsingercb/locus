# Repository boundary

Locus is a static client of the GeoHistory API. UI, map interaction, client-side radius policy, and presentation belong here. The dataset, ingest/scoring pipeline, deterministic retrieval logic, and read-only API belong upstream in `noffsingercb/GeoHistory`. Do not vendor or download the dataset and do not reimplement the engine.

A caller coordinate is sensitive. Never log or store it, put it in a URL, analytics event, error report, feedback payload, or cache key, or send it anywhere except the configured GeoHistory API. Keep coordinates in memory only.
