import { describe, expect, it } from 'vitest'
import { buildNearbyRequest, fetchNearby, NearbyError } from '../src/api'
import { makeEntries, makeResponse } from './fixtures'

const POINT = { lat: 38.5573, lng: -82.0632 }
const BASE = 'https://api.example.org'

describe('request construction', () => {
  it('puts the coordinate in the body and never in the URL', () => {
    const { url, body } = buildNearbyRequest(POINT, 15, BASE)

    expect(url).toBe(`${BASE}/v1/nearby`)
    expect(url).not.toContain('38.5573')
    expect(url).not.toContain('82.0632')
    expect(url).not.toContain('?')
    expect(JSON.parse(body)).toMatchObject({ lat: 38.5573, lng: -82.0632, radiusKm: 15 })
  })

  it('sends the Locus product policy as explicit generic filters', () => {
    const { body } = buildNearbyRequest(POINT, 5, BASE)

    expect(JSON.parse(body)).toMatchObject({
      excludeCategories: ['birth', 'death'],
      coordinateMode: 'direct',
      includeUniversal: false,
      significanceFloor: 0.05,
      limit: 12,
    })
  })
})

describe('response handling', () => {
  it('returns a well-formed payload', async () => {
    const payload = makeResponse(15, makeEntries(3))
    const result = await fetchNearby(POINT, 15, {
      baseUrl: BASE,
      fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }),
    })

    expect(result.returned).toBe(3)
  })

  it('maps 429 to a rate-limit failure carrying Retry-After', async () => {
    const error = await fetchNearby(POINT, 15, {
      baseUrl: BASE,
      fetchImpl: async () =>
        new Response('{"error":"Rate limit exceeded."}', {
          status: 429,
          headers: { 'retry-after': '42' },
        }),
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(NearbyError)
    expect((error as NearbyError).failure).toEqual({ kind: 'rate-limited', retryAfterSeconds: 42 })
  })

  it('falls back to a sane wait when Retry-After is missing', async () => {
    const error = await fetchNearby(POINT, 15, {
      baseUrl: BASE,
      fetchImpl: async () => new Response('{}', { status: 429 }),
    }).catch((caught: unknown) => caught)

    expect((error as NearbyError).failure).toEqual({ kind: 'rate-limited', retryAfterSeconds: 60 })
  })

  it('maps a transport failure to an unreachable state', async () => {
    const error = await fetchNearby(POINT, 15, {
      baseUrl: BASE,
      fetchImpl: async () => {
        throw new TypeError('network down')
      },
    }).catch((caught: unknown) => caught)

    expect((error as NearbyError).failure).toEqual({ kind: 'unreachable' })
  })

  it('rejects a response whose shape is wrong instead of rendering it', async () => {
    const error = await fetchNearby(POINT, 15, {
      baseUrl: BASE,
      fetchImpl: async () => new Response('{"entries":[{"id":1}]}', { status: 200 }),
    }).catch((caught: unknown) => caught)

    expect((error as NearbyError).failure).toEqual({ kind: 'malformed' })
  })

  it('surfaces a validation rejection message from the service', async () => {
    const error = await fetchNearby(POINT, 500, {
      baseUrl: BASE,
      fetchImpl: async () =>
        new Response('{"error":"radiusKm must be between 0.1 and 150."}', { status: 400 }),
    }).catch((caught: unknown) => caught)

    expect((error as NearbyError).failure).toMatchObject({
      kind: 'rejected',
      status: 400,
      message: 'radiusKm must be between 0.1 and 150.',
    })
  })

  it('lets an abort propagate so a moved pin is not reported as an outage', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = await fetchNearby(POINT, 15, {
      baseUrl: BASE,
      signal: controller.signal,
      fetchImpl: async () => {
        const abortError = new Error('aborted')
        abortError.name = 'AbortError'
        throw abortError
      },
    }).catch((caught: unknown) => caught)

    expect(error).not.toBeInstanceOf(NearbyError)
    expect((error as Error).name).toBe('AbortError')
  })
})
