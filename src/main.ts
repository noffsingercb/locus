import './style.css'
import { fetchNearby, NearbyError } from './api'
import type { NearbyFailure, Point } from './api'
import { DEBOUNCE_MS, LADDER_KM } from './config'
import { walkLadder } from './ladder'
import { createMapPinInput } from './map-input'
import { numberResults } from './result-markers'
import type { NumberedResult } from './result-markers'
import { renderFailure, renderIdle, renderResults, renderSearching } from './view'

const app = document.querySelector<HTMLElement>('#app')
if (!app) throw new Error('Locus application root is missing')

app.innerHTML = `
  <header class="masthead">
    <p class="eyebrow">GeoHistory applet</p>
    <h1>Locus</h1>
    <p class="lede">What happened near here?</p>
  </header>
  <div class="layout">
    <div id="map" class="map" role="application" aria-label="Map. Click to place a pin."></div>
    <section id="results" class="results" aria-live="polite">${renderIdle()}</section>
  </div>
  <footer class="attribution">
    Event data from <a href="https://github.com/noffsingercb/GeoHistory" rel="noopener noreferrer">GeoHistory</a>,
    derived from Wikidata and Wikipedia and reused under
    <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener noreferrer">CC BY-SA</a>.
    Each result links to its own source. Map tiles &copy; OpenStreetMap contributors.
  </footer>
`

const mapElement = document.querySelector<HTMLElement>('#map')
const resultsElement = document.querySelector<HTMLElement>('#results')
if (!mapElement || !resultsElement) throw new Error('Locus layout failed to mount')

const results: HTMLElement = resultsElement
const finalRungKm: number = LADDER_KM[LADDER_KM.length - 1]

// A moved pin invalidates everything in flight. The generation counter is what
// stops a slow 150 km answer from overwriting a fresh 5 km one.
let generation = 0
let inFlight: AbortController | null = null

async function search(point: Point): Promise<void> {
  const mine = generation + 1
  generation = mine
  inFlight?.abort()
  const controller = new AbortController()
  inFlight = controller

  results.innerHTML = renderSearching(LADDER_KM[0])
  // Markers from the previous pin are wrong the moment a new search starts.
  mapInput.clearResults()

  try {
    const outcome = await walkLadder(async (radiusKm) => {
      results.innerHTML = renderSearching(radiusKm)
      return fetchNearby(point, radiusKm, { signal: controller.signal })
    })
    if (mine !== generation) return
    results.innerHTML = renderResults(outcome, finalRungKm)
    mapInput.showResults(numberResults(outcome.response.entries))
  } catch (error) {
    if (mine !== generation) return
    if (error instanceof Error && error.name === 'AbortError') return
    const failure: NearbyFailure =
      error instanceof NearbyError ? error.failure : { kind: 'malformed' }
    results.innerHTML = renderFailure(failure)
    mapInput.clearResults()
  }
}

/** Brings the card for a clicked marker into view and flags it briefly. */
function revealCard(result: NumberedResult): void {
  const card = document.getElementById(result.domId)
  if (card === null) return
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  card.classList.add('entry--active')
  window.setTimeout(() => card.classList.remove('entry--active'), 1600)
}

const mapInput = createMapPinInput(
  mapElement,
  (point) => {
    void search(point)
  },
  DEBOUNCE_MS,
  revealCard,
)
