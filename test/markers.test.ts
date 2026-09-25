import { describe, expect, it } from 'vitest'
import { domIdForResult, numberResults } from '../src/result-markers'
import { makeEntry } from './fixtures'

describe('result numbering', () => {
  it('numbers entries by list position, starting at one', () => {
    const results = numberResults([
      makeEntry({ title: 'First' }),
      makeEntry({ title: 'Second' }),
      makeEntry({ title: 'Third' }),
    ])

    expect(results.map((r) => r.number)).toEqual([1, 2, 3])
    expect(results.map((r) => r.title)).toEqual(['First', 'Second', 'Third'])
  })

  it('keeps card numbers aligned when an entry cannot be plotted', () => {
    // The middle entry loses its marker. The third must still be number 3, or
    // the map and the list disagree while both look correct.
    const results = numberResults([
      makeEntry({ title: 'First' }),
      makeEntry({ title: 'Unplottable', lat: Number.NaN }),
      makeEntry({ title: 'Third' }),
    ])

    expect(results.map((r) => r.number)).toEqual([1, 3])
    expect(results.map((r) => r.title)).toEqual(['First', 'Third'])
  })

  it('prefers the display title, matching the card', () => {
    const results = numberResults([
      makeEntry({ title: 'Raw label', displayTitle: 'Readable label' }),
    ])

    expect(results[0].title).toBe('Readable label')
  })

  it('points each result at the id its card will carry', () => {
    const results = numberResults([makeEntry({}), makeEntry({})])

    expect(results[0].domId).toBe(domIdForResult(1))
    expect(results[1].domId).toBe(domIdForResult(2))
  })

  it('plots nothing for an empty result set', () => {
    expect(numberResults([])).toEqual([])
  })
})
