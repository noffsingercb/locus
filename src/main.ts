import './style.css'
import { fetchNearby, NearbyError } from './api'
import type { NearbyFailure, Point } from './api'
import { DEBOUNCE_MS, DEFAULT_RADIUS_KM } from './config'
import { createMapPinInput } from './map-input'
import { numberResults } from './result-markers'
import type { NumberedResult } from './result-markers'
import { renderFailure, renderIdle, renderResults, renderSearching } from './view'

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
      <section id="results" class="results" aria-live="polite">${renderIdle()}</section>
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
let currentPoint: Point | null = null
let radiusTimer: number | undefined
let generation = 0
let inFlight: AbortController | null = null
let retryTimer: number | undefined

function clearRetryTimer(): void {
  if (retryTimer !== undefined) window.clearInterval(retryTimer)
  retryTimer = undefined
}

function wireRetry(point: Point, failure: NearbyFailure): void {
  const button = results.querySelector<HTMLButtonElement>('[data-retry]')
  if (button === null) return

  button.addEventListener('click', () => {
    if (button.disabled) return
    clearRetryTimer()
    void search(point)
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

async function search(point: Point): Promise<void> {
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

  try {
    const response = await fetchNearby(point, radiusKm, { signal: controller.signal })
    if (mine !== generation) return
    results.innerHTML = renderResults(response)
    mapInput.showResults(numberResults(response.entries))
  } catch (error) {
    if (mine !== generation) return
    if (error instanceof Error && error.name === 'AbortError') return
    const failure: NearbyFailure = error instanceof NearbyError
      ? error.failure
      : { kind: 'malformed' }
    results.innerHTML = renderFailure(failure)
    mapInput.clearResults()
    wireRetry(point, failure)
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

// Invalidate old responses immediately, not only after the debounce expires.
radius.addEventListener('input', () => {
  radiusValue.value = `${radius.value} km`
  generation += 1
  inFlight?.abort()
  clearRetryTimer()
  if (radiusTimer !== undefined) window.clearTimeout(radiusTimer)
  mapInput.clearResults()
  if (currentPoint === null) return
  results.innerHTML = renderSearching(Number(radius.value))
  radiusTimer = window.setTimeout(() => {
    if (currentPoint !== null) void search(currentPoint)
  }, DEBOUNCE_MS)
})
