/**
 * Turning a result list into map markers.
 *
 * The numbering is the contract between the two halves of the screen: marker
 * N and card N are the same event. Kept here as a pure function, separate from
 * any Leaflet code, so that contract can be asserted in tests without a DOM --
 * the same reason view.ts is pure strings.
 */

import type { NearbyEntry } from './api'

export interface NumberedResult {
  /** Position in the displayed list, 1-based. Not a rank. */
  number: number
  /** id of the matching card, so a marker can find it. */
  domId: string
  lat: number
  lng: number
  title: string
}

export function domIdForResult(number: number): string {
  return `result-${number}`
}

/**
 * Numbers entries by their position in the list, then drops any that cannot be
 * plotted.
 *
 * The order matters: numbering first and filtering second means an entry with
 * a missing coordinate loses its marker but every other number still matches
 * its card. Filtering first would renumber the remainder and quietly
 * desynchronise the map from the list -- a failure that looks like correct
 * output, which is the worst kind.
 *
 * The API contract requires lat and lng on every entry, so this guard should
 * never fire. It exists because a silent mismatch here would be invisible.
 */
export function numberResults(entries: readonly NearbyEntry[]): NumberedResult[] {
  const plotted: NumberedResult[] = []

  entries.forEach((entry, index) => {
    const number = index + 1
    if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) return
    plotted.push({
      number,
      domId: domIdForResult(number),
      lat: entry.lat,
      lng: entry.lng,
      title: entry.displayTitle ?? entry.title,
    })
  })

  return plotted
}
