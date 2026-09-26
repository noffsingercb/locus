import { describe, expect, it } from 'vitest'
import type { LadderOutcome } from '../src/ladder'
import { renderEntry, renderFailure, renderResults, renderStatus } from '../src/view'
import { makeEntry, makeEntries, makeResponse } from './fixtures'

function outcomeOf(
  entries = makeEntries(12),
  overrides: Partial<LadderOutcome> = {},
): LadderOutcome {
  return {
    response: makeResponse(15, entries),
    rungKm: 15,
    previousRungKm: null,
    previousReturned: null,
    satisfied: true,
    requestCount: 1,
    ...overrides,
  }
}

describe('result presentation', () => {
  it('preserves API order and renders per-item attribution', () => {
    const entries = [
      makeEntry({ id: 'Q-old', dateStart: '1850-01-01', distanceKm: 9.9, title: 'Older and further' }),
      makeEntry({ id: 'Q-new', dateStart: '1990-01-01', distanceKm: 0.2, title: 'Newer and nearer' }),
    ]
    const html = renderResults(outcomeOf(entries), 150)
    expect(html.indexOf('Older and further')).toBeLessThan(html.indexOf('Newer and nearer'))
    expect(html.match(/class="source"/g)).toHaveLength(2)
  })

  it('shows distance/date and escapes upstream text', () => {
    const html = renderEntry(makeEntry({
      distanceKm: 0.42,
      dateStart: '1903-07-04',
      displayTitle: '<img src=x onerror=alert(1)>',
    }))
    expect(html).toContain('420 m away')
    expect(html).toContain('4 July 1903')
    expect(html).not.toContain('<img')
  })
})

describe('ladder states', () => {
  it('distinguishes a short prior rung from an empty one', () => {
    const short = renderStatus(outcomeOf(makeEntries(12), {
      rungKm: 15,
      previousRungKm: 5,
      previousReturned: 4,
    }), 150)
    expect(short).toContain('Only 4 records within 5 km.')
    expect(short).not.toContain('Nothing within 5 km.')

    const empty = renderStatus(outcomeOf(makeEntries(12), {
      rungKm: 15,
      previousRungKm: 5,
      previousReturned: 0,
    }), 150)
    expect(empty).toContain('Nothing within 5 km.')
  })

  it('renders final short and empty states honestly', () => {
    expect(renderStatus(outcomeOf(makeEntries(3), {
      rungKm: 150,
      previousRungKm: 50,
      previousReturned: 2,
      satisfied: false,
    }), 150)).toContain('Only 3 records within 150 km.')
    expect(renderStatus(outcomeOf([], {
      rungKm: 150,
      previousRungKm: 50,
      previousReturned: 0,
      satisfied: false,
    }), 150)).toContain('No records within 150 km')
  })
})

describe('failure states', () => {
  it('disables retry until the rate-limit wait expires', () => {
    const html = renderFailure({ kind: 'rate-limited', retryAfterSeconds: 30 })
    expect(html).toContain('data-retry disabled')
    expect(html).toContain('Retry in 30 seconds')
  })

  it('offers immediate retry for a transport failure', () => {
    const html = renderFailure({ kind: 'unreachable' })
    expect(html).toContain('data-retry')
    expect(html).not.toContain('data-retry disabled')
  })
})
