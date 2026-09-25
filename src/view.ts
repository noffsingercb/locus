/**
 * Every user-facing string in Locus.
 *
 * These are pure string functions so the states that carry the experience --
 * escalated, short, empty, rate-limited, unreachable -- can be asserted in
 * tests without a browser. Rendering never re-orders entries: selection was by
 * distance upstream and presentation is by date, and re-sorting here would
 * quietly break that contract.
 */

import type { NearbyEntry, NearbyFailure } from './api'
import type { LadderOutcome } from './ladder'
import { formatDistance, formatEventDate } from './format'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Attribution requires a real link; Locus never invents or substitutes one. */
export function hasUsableSource(entry: NearbyEntry): boolean {
  return typeof entry.sourceUrl === 'string' && /^https?:\/\//i.test(entry.sourceUrl)
}

export function renderEntry(entry: NearbyEntry): string {
  const title = escapeHtml(entry.displayTitle ?? entry.title)
  const date = escapeHtml(formatEventDate(entry.dateStart, entry.datePrecision))
  const distance = escapeHtml(formatDistance(entry.distanceKm))
  const scope = entry.scope ? `<span class="badge">${escapeHtml(entry.scope)}</span>` : ''
  const blurb = entry.blurb ? `<p class="blurb">${escapeHtml(entry.blurb)}</p>` : ''
  const source = hasUsableSource(entry)
    ? `<a class="source" href="${escapeHtml(entry.sourceUrl as string)}" target="_blank" rel="noopener noreferrer">Source</a>`
    : '<span class="source source--missing">No source link</span>'

  return [
    '<li class="entry">',
    `<p class="entry-meta"><time>${date}</time> &middot; <span class="distance">${distance}</span> ${scope}</p>`,
    `<h3 class="entry-title">${title}</h3>`,
    blurb,
    source,
    '</li>',
  ].join('')
}

export function renderStatus(outcome: LadderOutcome, finalRungKm: number): string {
  const { response, rungKm, previousRungKm, satisfied } = outcome

  if (response.returned === 0) {
    return [
      `<p class="status status--empty">No records within ${finalRungKm} km of this pin.</p>`,
      '<p class="status-detail">GeoHistory\u2019s coverage is uneven: it is dense in North American and European cities and thin in rural areas and open water. Move the pin to try somewhere else.</p>',
    ].join('')
  }

  if (!satisfied) {
    const plural = response.returned === 1 ? 'record' : 'records'
    return `<p class="status status--short">Only ${response.returned} ${plural} within ${finalRungKm} km. That is everything GeoHistory holds near this pin.</p>`
  }

  if (previousRungKm !== null) {
    return `<p class="status status--escalated">Nothing within ${previousRungKm} km. Showing the closest records within ${rungKm} km.</p>`
  }

  return `<p class="status">Closest records within ${rungKm} km.</p>`
}

export function renderResults(outcome: LadderOutcome, finalRungKm: number): string {
  const entries = outcome.response.entries.map(renderEntry).join('')
  const list = entries === '' ? '' : `<ol class="entries">${entries}</ol>`
  const counted =
    outcome.response.totalWithinRadius > outcome.response.returned
      ? `<p class="status-detail">Showing the ${outcome.response.returned} closest of ${outcome.response.totalWithinRadius} within ${outcome.rungKm} km, in date order.</p>`
      : ''
  return `${renderStatus(outcome, finalRungKm)}${counted}${list}`
}

export function renderSearching(radiusKm: number): string {
  return `<p class="status status--busy">Looking within ${radiusKm} km\u2026</p>`
}

export function renderIdle(): string {
  return [
    '<p class="status">Click the map to drop a pin.</p>',
    '<p class="status-detail">Locus shows the historical events closest to that point, oldest first. The pin stays in your browser and is never stored.</p>',
  ].join('')
}

export function renderFailure(failure: NearbyFailure): string {
  switch (failure.kind) {
    case 'rate-limited':
      return `<p class="status status--error">Too many requests. The service allows a burst and then asks for a pause \u2014 try again in ${failure.retryAfterSeconds} seconds.</p>`
    case 'unreachable':
      return '<p class="status status--error">Could not reach the GeoHistory service. Your pin is still here; try again in a moment.</p>'
    case 'malformed':
      return '<p class="status status--error">The service sent a response Locus could not read, so nothing is shown rather than a partial list.</p>'
    case 'rejected':
      return `<p class="status status--error">${escapeHtml(failure.message)}</p>`
  }
}
