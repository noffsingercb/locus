/** Pure rendering functions for every Locus state. */

import type { NearbyEntry, NearbyFailure, NearbyResponse } from './api'
import { formatDistance, formatEventDate } from './format'
import { domIdForResult } from './result-markers'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderEntry(entry: NearbyEntry, number?: number): string {
  const title = escapeHtml(entry.displayTitle ?? entry.title)
  const date = escapeHtml(formatEventDate(entry.dateStart, entry.datePrecision))
  const distance = escapeHtml(formatDistance(entry.distanceKm))
  const scope = entry.scope ? `<span class="badge">${escapeHtml(entry.scope)}</span>` : ''
  const blurb = entry.blurb ? `<p class="blurb">${escapeHtml(entry.blurb)}</p>` : ''
  const source = `<a class="source" href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>`
  const marker = number === undefined
    ? ''
    : `<span class="entry-number" aria-hidden="true">${number}</span>`
  const id = number === undefined ? '' : ` id="${domIdForResult(number)}"`

  return [
    `<li class="entry"${id}>`,
    marker,
    `<p class="entry-meta"><time>${date}</time> &middot; <span class="distance">${distance}</span> ${scope}</p>`,
    `<h3 class="entry-title">${title}</h3>`,
    blurb,
    source,
    '</li>',
  ].join('')
}

export function renderStatus(response: NearbyResponse): string {
  const { returned, totalWithinRadius, radiusKm } = response
  if (returned === 0) {
    return `<p class="status status--empty">No matching records within ${radiusKm} km of this pin.</p><p class="status-detail">Coverage is uneven. Try a larger radius or move the pin.</p>`
  }
  const noun = returned === 1 ? 'record' : 'records'
  if (totalWithinRadius > returned) {
    return `<p class="status">Showing the ${returned} closest of ${totalWithinRadius} matching records within ${radiusKm} km, in date order.</p>`
  }
  return `<p class="status">Showing ${returned} matching ${noun} within ${radiusKm} km, in date order.</p>`
}

export function renderResults(response: NearbyResponse): string {
  const entries = response.entries.map((entry, index) => renderEntry(entry, index + 1)).join('')
  const list = entries === '' ? '' : `<ol class="entries">${entries}</ol>`
  return `${renderStatus(response)}${list}`
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
      return [
        `<p class="status status--error">Too many requests. Try again in ${failure.retryAfterSeconds} seconds.</p>`,
        `<button type="button" class="retry" data-retry disabled>Retry in ${failure.retryAfterSeconds} seconds</button>`,
      ].join('')
    case 'unreachable':
      return '<p class="status status--error">Could not reach the GeoHistory service. Your pin is still here.</p><button type="button" class="retry" data-retry>Try again</button>'
    case 'malformed':
      return '<p class="status status--error">The service sent a response Locus could not safely render, so nothing is shown.</p><button type="button" class="retry" data-retry>Try again</button>'
    case 'rejected':
      return `<p class="status status--error">${escapeHtml(failure.message)}</p><button type="button" class="retry" data-retry>Try again</button>`
  }
}
