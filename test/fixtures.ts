import type { NearbyEntry, NearbyResponse } from '../src/api'

export function makeEntry(overrides: Partial<NearbyEntry> = {}): NearbyEntry {
  return {
    id: 'Q1',
    title: 'An event',
    displayTitle: 'An event',
    blurb: null,
    dateStart: '1900-01-01',
    dateEnd: null,
    datePrecision: 'day',
    category: 'event',
    scope: 'local',
    significance: 0.5,
    notability: 0.5,
    coordSource: 'P625',
    lat: 39.7392,
    lng: -104.9903,
    distanceKm: 1.2,
    sourceUrl: 'https://www.wikidata.org/wiki/Q1',
    ...overrides,
  }
}

export function makeEntries(count: number): NearbyEntry[] {
  return Array.from({ length: count }, (_unused, index) =>
    makeEntry({
      id: `Q${index}`,
      dateStart: `${1900 + index}-01-01`,
      distanceKm: index + 1,
    }),
  )
}

export function makeResponse(
  radiusKm: number,
  entries: NearbyEntry[],
  overrides: Partial<NearbyResponse> = {},
): NearbyResponse {
  return {
    datasetVersion: 'dump-v0.6.1',
    engine: 'geohistory-nearby@0.1.0',
    radiusKm,
    coordinateMode: 'direct',
    significanceFloor: 0.05,
    totalWithinRadius: entries.length,
    returned: entries.length,
    entries,
    ...overrides,
  }
}
