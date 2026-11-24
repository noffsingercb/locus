import { describe, expect, it } from 'vitest'
import { makeFilters, NOTABLE_FLOOR } from '../src/filters'

describe('Locus filters', () => {
  it('defaults to all event categories, no people, no notable filter', () => {
    expect(makeFilters()).toEqual({ excludeCategories: ['birth', 'death'], notableOnly: false })
  })
  it('combines category, people and notable choices without hiding unknown categories', () => {
    expect(makeFilters(['founding', 'not-a-known-category'], true, true)).toEqual({ excludeCategories: ['founding'], notableOnly: true })
    expect(NOTABLE_FLOOR).toBe(0.9)
  })
})
