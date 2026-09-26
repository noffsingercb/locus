/** The only module allowed to send a network request containing a coordinate. */

import {
  API_BASE_URL,
  EXCLUDED_CATEGORIES,
  SIGNIFICANCE_FLOOR,
  TARGET_RESULTS,
} from './config'

export interface Point {
  lat: number
  lng: number
}

/** Locus requires a usable per-item source URL before an entry can render. */
export interface NearbyEntry {
  id: string
  title: string
  displayTitle: string | null
  blurb: string | null
  dateStart: string
  dateEnd: string | null
  datePrecision: string | null
  category: string | null
  scope: string | null
  significance: number | null
  notability: number | null
  coordSource: string | null
  lat: number
  lng: number
  distanceKm: number
  sourceUrl: string
}

export interface NearbyResponse {
  datasetVersion: string | null
  datasetBuild: string | null
  engine: string
  radiusKm: number
  coordinateMode: string
  significanceFloor: number
  totalWithinRadius: number
  returned: number
  entries: NearbyEntry[]
}

export type NearbyFailure =
  | { kind: 'rate-limited'; retryAfterSeconds: number }
  | { kind: 'unreachable' }
  | { kind: 'malformed' }
  | { kind: 'rejected'; status: number; message: string }

export class NearbyError extends Error {
  readonly failure: NearbyFailure

  constructor(failure: NearbyFailure) {
    super(failure.kind)
    this.name = 'NearbyError'
    this.failure = failure
  }
}

export function buildNearbyRequest(
  point: Point,
  radiusKm: number,
  baseUrl: string = API_BASE_URL,
): { url: string; body: string } {
  return {
    url: `${baseUrl}/v1/nearby`,
    body: JSON.stringify({
      lat: point.lat,
      lng: point.lng,
      radiusKm,
      limit: TARGET_RESULTS,
      significanceFloor: SIGNIFICANCE_FLOOR,
      coordinateMode: 'direct',
      excludeCategories: [...EXCLUDED_CATEGORIES],
      includeUniversal: false,
    }),
  }
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

export function isUsableSourceUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isEntry(value: unknown): value is NearbyEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    nullableString(entry.displayTitle) &&
    nullableString(entry.blurb) &&
    typeof entry.dateStart === 'string' &&
    nullableString(entry.dateEnd) &&
    nullableString(entry.datePrecision) &&
    nullableString(entry.category) &&
    nullableString(entry.scope) &&
    (entry.significance === null || typeof entry.significance === 'number') &&
    (entry.notability === null || typeof entry.notability === 'number') &&
    nullableString(entry.coordSource) &&
    typeof entry.lat === 'number' && Number.isFinite(entry.lat) &&
    typeof entry.lng === 'number' && Number.isFinite(entry.lng) &&
    typeof entry.distanceKm === 'number' && Number.isFinite(entry.distanceKm) &&
    isUsableSourceUrl(entry.sourceUrl)
  )
}

function isNearbyResponse(value: unknown): value is NearbyResponse {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  if (!nullableString(payload.datasetVersion)) return false
  if (!nullableString(payload.datasetBuild)) return false
  if (typeof payload.engine !== 'string') return false
  if (typeof payload.radiusKm !== 'number') return false
  if (typeof payload.returned !== 'number' || !Number.isInteger(payload.returned)) return false
  if (typeof payload.totalWithinRadius !== 'number' || !Number.isInteger(payload.totalWithinRadius)) return false
  if (!Array.isArray(payload.entries) || !payload.entries.every(isEntry)) return false
  return payload.returned === payload.entries.length && payload.totalWithinRadius >= payload.returned
}

function parseRetryAfter(header: string | null): number {
  const seconds = header === null ? Number.NaN : Number.parseInt(header, 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return 60
  return Math.min(seconds, 300)
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (payload && typeof payload === 'object') {
      const message = (payload as Record<string, unknown>).error
      if (typeof message === 'string') return message
    }
  } catch {
    // Use the generic message below.
  }
  return `The service rejected the request (${response.status}).`
}

export interface FetchNearbyOptions {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  baseUrl?: string
}

export async function fetchNearby(
  point: Point,
  radiusKm: number,
  options: FetchNearbyOptions = {},
): Promise<NearbyResponse> {
  const doFetch = options.fetchImpl ?? globalThis.fetch
  const { url, body } = buildNearbyRequest(point, radiusKm, options.baseUrl ?? API_BASE_URL)

  let response: Response
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      mode: 'cors',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new NearbyError({ kind: 'unreachable' })
  }

  if (response.status === 429) {
    throw new NearbyError({
      kind: 'rate-limited',
      retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
    })
  }
  if (!response.ok) {
    throw new NearbyError({
      kind: 'rejected',
      status: response.status,
      message: await readErrorMessage(response),
    })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new NearbyError({ kind: 'malformed' })
  }
  if (!isNearbyResponse(payload)) throw new NearbyError({ kind: 'malformed' })
  return payload
}
