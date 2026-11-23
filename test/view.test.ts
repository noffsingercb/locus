import { describe, expect, it } from 'vitest'
import { renderEntry, renderFailure, renderResults, renderStatus } from '../src/view'
import { makeEntry, makeEntries, makeResponse } from './fixtures'

describe('result presentation', () => {
  it('preserves API order and renders per-item attribution', () => {
    const entries = [
      makeEntry({ id: 'Q-old', dateStart: '1850-01-01', distanceKm: 9.9, title: 'Older and further' }),
      makeEntry({ id: 'Q-new', dateStart: '1990-01-01', distanceKm: 0.2, title: 'Newer and nearer' }),
    ]
    const html = renderResults(makeResponse(15, entries))
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

describe('radius result states', () => {
  it('reports capped counts without claiming all holdings are shown', () => {
    const html = renderStatus(makeResponse(200, makeEntries(100), { totalWithinRadius: 149 }))
    expect(html).toContain('100 closest of 149 matching records within 200 km')
    expect(html).not.toContain('everything GeoHistory holds')
  })
  it('reports short and empty matching lists', () => {
    expect(renderStatus(makeResponse(15, makeEntries(3)))).toContain('Showing 3 matching records within 15 km')
    expect(renderStatus(makeResponse(5, []))).toContain('No matching records within 5 km')
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
