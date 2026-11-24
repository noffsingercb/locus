/** Locus presentation policy; unknown categories remain visible by default. */
export const EVENT_CATEGORIES = [
  ['event', 'Events'],
  ['founding', 'Foundings'],
  ['conflict', 'Conflicts'],
  ['disaster', 'Disasters'],
  ['treaty', 'Treaties'],
  ['discovery', 'Discoveries'],
  ['election', 'Elections'],
  ['milestone', 'Milestones'],
] as const
export const NOTABLE_FLOOR = 0.9
export interface ResultFilters {
  excludeCategories: string[]
  notableOnly: boolean
}
export function makeFilters(hidden: readonly string[] = [], includePeople = false, notableOnly = false): ResultFilters {
  const known = new Set(EVENT_CATEGORIES.map(([id]) => id as string))
  return {
    excludeCategories: [...hidden.filter(id => known.has(id)), ...(includePeople ? [] : ['birth', 'death'])],
    notableOnly,
  }
}
