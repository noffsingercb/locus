import { describe, expect, it } from 'vitest'
import type { LadderOutcome } from '../src/ladder'
import { hasUsableSource, renderEntry, renderResults, renderFailure, renderStatus } from '../src/view'
import { makeEntry, makeEntries, makeResponse } from './fixtures'

function outcomeOf(
  entries = makeEntries(12),
  overrides: Partial<LadderOutcome> = {},
): LadderOutcome {
  return {
    response: makeResponse(15, entries),
    rungKm: 15,
    previousRungKm: null,
    satisfied: true,
    requestCount: 1,
    ...overrides,
  }
}

describe('result presentation', () => {
  it('preserves the order the API returned and never re-ranks', () => {
    // The API selects by distance and returns the selected set in date order.
    // Rendering must not sort by distance, significance, or anything else.
    const entries = [
      makeEntry({ id: 'Q-old', dateStart: '1850-01-01', distanceKm: 9.9, title: 'Older and further' }),
      makeEntry({ id: 'Q-new', dateStart: '1990-01-01', distanceKm: 0.2, title: 'Newer and nearer' }),
    ]
    const html = renderResults(outcomeOf(entries), 150)

    expect(html.indexOf('Older and further')).toBeLessThan(html.indexOf('Newer and nearer'))
  })

  it('shows the distance and date for each entry', () => {
    const html = renderEntry(makeEntry({ distanceKm: 0.42, dateStart: '1903-07-04', datePrecision: 'day' }))

    expect(html).toContain('420 m away')
    expect(html).toContain('4 July 1903')
  })

  it('renders a per-item source link for attribution', () => {
    const html = renderEntry(makeEntry({ sourceUrl: 'https://www.wikidata.org/wiki/Q42' }))

    expect(html).toContain('href="https://www.wikidata.org/wiki/Q42"')
  })

  it('renders no link, and invents none, when a row has no usable source', () => {
    const entry = makeEntry({ sourceUrl: null })

    expect(hasUsableSource(entry)).toBe(false)
    expect(renderEntry(entry)).not.toContain('<a')
  })

  it('escapes titles rather than trusting upstream text', () => {
    const html = renderEntry(makeEntry({ displayTitle: '<img src=x onerror=alert(1)>' }))

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('ladder states', () => {
  it('states the radius plainly when the first rung answers', () => {
    const status = renderStatus(outcomeOf(makeEntries(12), { rungKm: 5, previousRungKm: null }), 150)

    expect(status).toContain('Closest records within 5 km.')
    expect(status).not.toContain('Nothing within')
  })

  it('makes escalation visible instead of silent', () => {
    const status = renderStatus(outcomeOf(makeEntries(12), { rungKm: 50, previousRungKm: 15 }), 150)

    expect(status).toContain('Nothing within 15 km.')
    expect(status).toContain('within 50 km')
  })

  it('says exactly how few records exist at the final rung', () => {
    const status = renderStatus(
      outcomeOf(makeEntries(3), { rungKm: 150, previousRungKm: 50, satisfied: false }),
      150,
    )

    expect(status).toContain('Only 3 records within 150 km.')
  })

  it('gives an honest empty state that names the coverage limit', () => {
    const status = renderStatus(
      outcomeOf([], { rungKm: 150, previousRungKm: 50, satisfied: false }),
      150,
    )

    expect(status).toContain('No records within 150 km')
    expect(status).toContain('coverage is uneven')
    expect(status).toContain('Move the pin')
  })
})

describe('failure states', () => {
  it('explains a rate limit and names the wait', () => {
    const html = renderFailure({ kind: 'rate-limited', retryAfterSeconds: 30 })

    expect(html).toContain('30 seconds')
  })

  it('keeps the pin and offers a retry when the service is unreachable', () => {
    expect(renderFailure({ kind: 'unreachable' })).toContain('try again')
  })

  it('refuses to render a partial list from a malformed response', () => {
    expect(renderFailure({ kind: 'malformed' })).toContain('could not read')
  })
})
