import './style.css'
import { fetchNearby, NearbyError } from './api'
import type { NearbyFailure, Point } from './api'
import { DEBOUNCE_MS, DEFAULT_RADIUS_KM } from './config'
import { EVENT_CATEGORIES, makeFilters } from './filters'
import { createMapPinInput } from './map-input'
import { numberResults } from './result-markers'
import type { NumberedResult } from './result-markers'
import { renderEntry, renderFailure, renderIdle, renderResults, renderSearching } from './view'

const app = document.querySelector<HTMLElement>('#app')
if (!app) throw new Error('Locus application root is missing')

app.innerHTML = `
  <header class="masthead">
    <img class="masthead-mark" src="/locus-mark-128.png" alt="" width="128" height="128" />
    <div class="masthead-text">
      <p class="eyebrow">GeoHistory applet</p>
      <h1>Locus</h1>
      <p class="lede">What happened near here?</p>
    </div>
  </header>
  <div class="layout">
    <div id="map" class="map" role="application" aria-label="Map. Click to place a pin."></div>
    <div class="results-column">
      <div class="radius-control">
        <label for="radius">Search radius: <output id="radius-value" for="radius">${DEFAULT_RADIUS_KM} km</output></label>
        <input id="radius" type="range" min="5" max="200" step="5" value="${DEFAULT_RADIUS_KM}" />
      </div>
      <div class="filter-bar">
        <label class="filter-option"><input id="notable" type="checkbox" /> Notable events only</label>
        <span class="filter-help">Shows records with a GeoHistory significance score of 0.9 or higher. Scores are estimates.</span>
        <details class="category-filter">
          <summary>Filter event categories</summary>
          <fieldset>
            <legend>Show categories</legend>
            <div class="category-grid">${EVENT_CATEGORIES.map(([id, label]) => `<label><input type="checkbox" data-category="${id}" checked /> ${label}</label>`).join('')}
              <label><input type="checkbox" id="people" /> People (births and deaths; approximate places)</label>
            </div>
            <p class="filter-help">People are off by default. Birthplace and death-place records use an approximate place, not an exact event site.</p>
          </fieldset>
        </details>
      </div>
      <section id="results" class="results" aria-label="Nearby results" tabindex="0">${renderIdle()}</section>
    </div>
  </div>
  <footer class="attribution">
    Event data from <a href="https://github.com/noffsingercb/GeoHistory" rel="noopener noreferrer">GeoHistory</a>,
    derived from Wikidata and Wikipedia and reused under
    <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener noreferrer">CC BY-SA</a>.
    Each displayed result links to its source. Map data from OpenStreetMap via OpenFreeMap/OpenMapTiles.
  </footer>
`

const mapElement = document.querySelector<HTMLElement>('#map')
const resultsElement = document.querySelector<HTMLElement>('#results')
if (!mapElement || !resultsElement) throw new Error('Locus layout failed to mount')

const results: HTMLElement = resultsElement
const radius = document.querySelector<HTMLInputElement>('#radius')!
const radiusValue = document.querySelector<HTMLOutputElement>('#radius-value')!
const notable = document.querySelector<HTMLInputElement>('#notable')!
const people = document.querySelector<HTMLInputElement>('#people')!
const categories = [...document.querySelectorAll<HTMLInputElement>('[data-category]')]
function currentFilters() {
  return makeFilters(categories.filter(item => !item.checked).map(item => item.dataset.category!), people.checked, notable.checked)
}
let currentPoint: Point | null = null
let radiusTimer: number | undefined
let generation = 0
let inFlight: AbortController | null = null
let retryTimer: number | undefined
let activeResults: NumberedResult[] = []
let activeOffset = 0
let activeTotal = 0
let activeBuild: string | null = null
let loadingMore = false

function clearRetryTimer(): void {
  if (retryTimer !== undefined) window.clearInterval(retryTimer)
  retryTimer = undefined
}

function wireRetry(point: Point, failure: NearbyFailure, offset: number, expectedBuild: string | null, append = false): void {
  const button = results.querySelector<HTMLButtonElement>('[data-retry]')
  if (button === null) return

  button.addEventListener('click', () => {
    if (button.disabled) return
    clearRetryTimer()
    if (append) void loadMore()
    else void search(point, offset, expectedBuild)
  })

  if (failure.kind !== 'rate-limited') return
  let remaining = failure.retryAfterSeconds
  retryTimer = window.setInterval(() => {
    remaining -= 1
    if (remaining > 0) {
      button.textContent = `Retry in ${remaining} seconds`
      return
    }
    clearRetryTimer()
    button.disabled = false
    button.textContent = 'Try again'
  }, 1000)
}

async function search(point: Point, offset = 0, expectedBuild: string | null = null): Promise<void> {
  if (radiusTimer !== undefined) window.clearTimeout(radiusTimer)
  radiusTimer = undefined
  currentPoint = point
  clearRetryTimer()
  const mine = generation + 1
  generation = mine
  inFlight?.abort()
  const controller = new AbortController()
  inFlight = controller

  const radiusKm = Number(radius.value)
  results.innerHTML = renderSearching(radiusKm)
  mapInput.clearResults()
  activeResults = []
  activeOffset = 0
  activeTotal = 0
  activeBuild = null
  loadingMore = false
  results.scrollTop = 0

  try {
    const response = await fetchNearby(point, radiusKm, { signal: controller.signal, offset, filters: currentFilters() })
    if (mine !== generation) return
    if (offset > 0 && (!expectedBuild || response.datasetBuild !== expectedBuild)) {
      results.innerHTML = '<p class="status status--error">The dataset changed or could not be identified. Start the search again to see consistent results.</p><button type="button" class="retry" data-restart>Start again</button>'
      return
    }
    activeOffset = offset + response.returned
    activeTotal = response.totalWithinRadius
    activeBuild = response.datasetBuild
    activeResults = numberResults(response.entries, offset)
    results.innerHTML = renderResults(response)
    mapInput.showResults(activeResults)
    if (activeOffset < activeTotal) void loadMore()
  } catch (error) {
    if (mine !== generation) return
    if (error instanceof Error && error.name === 'AbortError') return
    const failure: NearbyFailure = error instanceof NearbyError
      ? error.failure
      : { kind: 'malformed' }
    results.innerHTML = renderFailure(failure)
    mapInput.clearResults()
    wireRetry(point, failure, offset, expectedBuild)
  }
}

// Fetch remaining bounded batches automatically. Keep existing cards and map
// state intact, and offer a retry if a later batch fails.
async function loadMore(): Promise<void> {
  if (currentPoint === null || loadingMore || activeOffset >= activeTotal) return
  const point = currentPoint
  const offset = activeOffset
  const mine = generation
  const more = results.querySelector<HTMLElement>('.more-status')
  if (!more) return
  if (!activeBuild) {
    more.innerHTML = '<p class="status status--error">The dataset could not be identified. Start the search again to see consistent results.</p><button type="button" class="retry" data-restart>Start again</button>'
    return
  }
  clearRetryTimer()
  loadingMore = true
  more.innerHTML = '<p class="status status--busy">Loading more results…</p>'
  const controller = new AbortController()
  inFlight = controller
  let continueLoading = false
  try {
    const response = await fetchNearby(point, Number(radius.value), { signal: controller.signal, offset, filters: currentFilters() })
    if (mine !== generation) return
    if (response.datasetBuild !== activeBuild || response.totalWithinRadius !== activeTotal) {
      more.innerHTML = '<p class="status status--error">The dataset changed or could not be identified. Start the search again to see consistent results.</p><button type="button" class="retry" data-restart>Start again</button>'
      return
    }
    if (response.returned === 0) throw new NearbyError({ kind: 'malformed' })
    const list = results.querySelector<HTMLOListElement>('.entries')
    if (!list) throw new NearbyError({ kind: 'malformed' })
    const next = numberResults(response.entries, offset)
    list.insertAdjacentHTML('beforeend', response.entries.map((entry, index) => renderEntry(entry, offset + index + 1)).join(''))
    activeResults.push(...next)
    activeOffset += response.returned
    mapInput.appendResults(next)
    const count = results.querySelector<HTMLElement>('[data-count]')
    if (count) count.textContent = `Showing ${activeOffset} of ${activeTotal} matching records within ${response.radiusKm} km.`
    continueLoading = activeOffset < activeTotal
    more.innerHTML = continueLoading ? '<p class="status status--busy">Loading remaining results…</p>' : '<p class="status-detail">All matching results loaded.</p>'
  } catch (error) {
    if (mine !== generation || (error instanceof Error && error.name === 'AbortError')) return
    const failure: NearbyFailure = error instanceof NearbyError ? error.failure : { kind: 'malformed' }
    more.innerHTML = '<p class="status-detail">Some matching results have not loaded yet.</p>' + renderFailure(failure)
    wireRetry(point, failure, offset, activeBuild, true)
  } finally {
    if (mine === generation) {
      loadingMore = false
      if (continueLoading) void loadMore()
    }
  }
}

function revealCard(result: NumberedResult): void {
  const card = document.getElementById(result.domId)
  if (card === null) return
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  card.classList.add('entry--active')
  window.setTimeout(() => card.classList.remove('entry--active'), 1600)
}

const mapInput = createMapPinInput(
  mapElement,
  (point) => { void search(point) },
  DEBOUNCE_MS,
  revealCard,
)

results.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const number = target.closest<HTMLButtonElement>('[data-result-number]')
  if (number) {
    const result = activeResults.find(item => item.number === Number(number.dataset.resultNumber))
    if (result) mapInput.focusResult(result)
    return
  }
  if (currentPoint === null) return
  if (target.closest('[data-restart]')) { void search(currentPoint); return }
})

// Invalidate old responses immediately, not only after the debounce expires.
radius.addEventListener('input', () => {
  radiusValue.value = `${radius.value} km`
  generation += 1
  inFlight?.abort()
  loadingMore = false
  clearRetryTimer()
  if (radiusTimer !== undefined) window.clearTimeout(radiusTimer)
  mapInput.clearResults()
  if (currentPoint === null) return
  results.innerHTML = renderSearching(Number(radius.value))
  radiusTimer = window.setTimeout(() => {
    if (currentPoint !== null) void search(currentPoint)
  }, DEBOUNCE_MS)
})

// Invalidate in-flight pages immediately and restart with a consistent filter snapshot.
for (const control of [notable, people, ...categories]) control.addEventListener('change', () => {
  generation += 1
  inFlight?.abort()
  loadingMore = false
  clearRetryTimer()
  if (radiusTimer !== undefined) window.clearTimeout(radiusTimer)
  mapInput.clearResults()
  if (currentPoint !== null) void search(currentPoint)
})
