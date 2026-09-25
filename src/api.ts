/**
 * The only place in Locus that touches the network.
 *
 * The caller's coordinate travels in a POST body and nowhere else. It is never
 * concatenated into a URL, a query string, a log line, or a cache key. Keeping
 * every request construction in one small module is what makes that claim
 * reviewable in a diff rather than a promise in a README.
 */

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

/** Mirrors NearbyEntry in GeoHistory's nearby.ts. */
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
  sourceUrl: string | null
}

/** Mirrors NearbyResult in GeoHistory's nearby.ts. */
export interface NearbyResponse {
  datasetVersion: string | null
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

/**
 * Builds the single request Locus is allowed to make.
 *
 * Returned as data rather than issued directly so a test can assert what is in
 * the URL and what is in the body without a network stub.
 */
export function buildNearbyRequest(
  point: Point,
  radiusKm: number,
  baseUrl: string = API_BASE_URL,
): { url: string; body: string } {
  const body = JSON.stringify({
    lat: point.lat,
    lng: point.lng,
    radiusKm,
    limit: TARGET_RESULTS,
    significanceFloor: SIGNIFICANCE_FLOOR,
    coordinateMode: 'direct',
    excludeCategories: [...EXCLUDED_CATEGORIES],
    includeUniversal: false,
  })
  return { url: `${baseUrl}/v1/nearby`, body }
}

function isEntry(value: unknown): value is NearbyEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.dateStart === 'string' &&
    typeof entry.distanceKm === 'number'
  )
}

function isNearbyResponse(value: unknown): value is NearbyResponse {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  if (typeof payload.radiusKm !== 'number') return false
  if (typeof payload.returned !== 'number') return false
  if (typeof payload.totalWithinRadius !== 'number') return false
  if (!Array.isArray(payload.entries)) return false
  return payload.entries.every(isEntry)
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
    // fall through to the generic message
  }
  return `The service rejected the request (${response.status}).`
}

export interface FetchNearbyOptions {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  baseUrl?: string
}

/** One question, at one radius. The ladder lives in ladder.ts. */
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
    // An abort is the caller moving the pin, not a service problem.
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

  // Partial rows are never rendered: a list that looks complete and is not is
  // worse than an honest error.
  if (!isNearbyResponse(payload)) throw new NearbyError({ kind: 'malformed' })
  return payload
}
