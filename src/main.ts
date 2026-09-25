import './style.css'
import { fetchNearby, NearbyError } from './api'
import type { NearbyFailure, Point } from './api'
import { LADDER_KM } from './config'
import { walkLadder } from './ladder'
import { createMapPinInput } from './map-input'
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

  try {
    const outcome = await walkLadder(async (radiusKm) => {
      results.innerHTML = renderSearching(radiusKm)
      return fetchNearby(point, radiusKm, { signal: controller.signal })
    })
    if (mine !== generation) return
    results.innerHTML = renderResults(outcome, finalRungKm)
  } catch (error) {
    if (mine !== generation) return
    if (error instanceof Error && error.name === 'AbortError') return
    const failure: NearbyFailure =
      error instanceof NearbyError ? error.failure : { kind: 'malformed' }
    results.innerHTML = renderFailure(failure)
  }
}

createMapPinInput(mapElement, (point) => {
  void search(point)
})
