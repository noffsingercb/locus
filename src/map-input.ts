/**
 * The map layer: one input pin, plus the numbered markers for whatever the
 * last search returned.
 *
 * Structured as a swappable source so the v0.2 "use my location" affordance can
 * be added beside it without restructuring the app. The browser location API is
 * deliberately absent from this release, and privacy.test.ts asserts that the
 * shipped source does not so much as name it.
 *
 * Tiles are requested by z/x/y viewport coordinates only. The pin coordinate is
 * never appended to a tile URL or any other third-party request, and the result
 * markers plot coordinates the API has already returned, so drawing them sends
 * nothing anywhere.
 */

import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Point } from './api'
import { DEBOUNCE_MS } from './config'
import type { NumberedResult } from './result-markers'
import { escapeHtml } from './view'

export interface PinInput {
  /** Replaces the plotted markers with this list. */
  showResults(results: readonly NumberedResult[]): void
  clearResults(): void
  destroy(): void
}

const TILE_HOST = 'https://tile.openstreetmap.org'
const TILE_URL = `${TILE_HOST}/{z}/{x}/{y}.png`

/**
 * Marker diameter in px. The .locus-result-pin rule in style.css hard-codes a
 * matching width, height and line-height, because centring the digits depends
 * on the box being exactly this size. Change both together.
 */
const RESULT_MARKER_PX = 26

/** Keeps a dragged pin inside a single world copy after worldCopyJump wrapping. */
function normalize(latlng: L.LatLng): Point {
  return { lat: latlng.lat, lng: ((((latlng.lng + 180) % 360) + 360) % 360) - 180 }
}

export function createMapPinInput(
  container: HTMLElement,
  onSettled: (point: Point) => void,
  debounceMs: number = DEBOUNCE_MS,
  onResultSelected?: (result: NumberedResult) => void,
): PinInput {
  const map = L.map(container, {
    center: [39.7392, -104.9903],
    zoom: 11,
    worldCopyJump: true,
  })

  L.tileLayer(TILE_URL, {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)

  // A divIcon avoids Leaflet's bundled marker image, which breaks under Vite's
  // asset handling and would otherwise need a workaround.
  const icon = L.divIcon({ className: 'locus-pin', iconSize: [20, 20], iconAnchor: [10, 10] })

  const resultLayer = L.layerGroup().addTo(map)

  let marker: L.Marker | null = null
  let timer: number | undefined

  const settle = (point: Point): void => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => onSettled(point), debounceMs)
  }

  const place = (latlng: L.LatLng): void => {
    if (marker === null) {
      marker = L.marker(latlng, { icon, draggable: true, keyboard: true }).addTo(map)
      marker.on('drag', () => {
        if (marker !== null) settle(normalize(marker.getLatLng()))
      })
      marker.on('dragend', () => {
        if (marker !== null) settle(normalize(marker.getLatLng()))
      })
    } else {
      marker.setLatLng(latlng)
    }
    settle(normalize(latlng))
  }

  map.on('click', (event: L.LeafletMouseEvent) => place(event.latlng))

  return {
    showResults(results: readonly NumberedResult[]): void {
      resultLayer.clearLayers()
      if (results.length === 0) return

      const points: L.LatLngTuple[] = []
      const half = RESULT_MARKER_PX / 2

      for (const result of results) {
        const numberIcon = L.divIcon({
          className: 'locus-result-pin',
          html: String(result.number),
          iconSize: [RESULT_MARKER_PX, RESULT_MARKER_PX],
          iconAnchor: [half, half],
        })
        const resultMarker = L.marker([result.lat, result.lng], {
          icon: numberIcon,
          keyboard: true,
          // Leaflet writes this into a title attribute, so it must not be
          // pre-escaped -- the browser would render the entities literally.
          title: `${result.number}. ${result.title}`,
        })
        resultMarker.bindTooltip(
          `${result.number}. ${escapeHtml(result.title)}`,
          { direction: 'top' },
        )
        resultMarker.on('click', () => onResultSelected?.(result))
        resultMarker.addTo(resultLayer)
        points.push([result.lat, result.lng])
      }

      if (marker !== null) {
        const pinAt = marker.getLatLng()
        points.push([pinAt.lat, pinAt.lng])
      }

      // Only move the map when something is off screen. A 50 km rung can put
      // results well outside the view, but recentring on every search would
      // pull the map away from the place the user deliberately chose.
      const bounds = L.latLngBounds(points)
      if (!map.getBounds().contains(bounds)) {
        map.fitBounds(bounds, { padding: [32, 32] })
      }
    },

    clearResults(): void {
      resultLayer.clearLayers()
    },

    destroy(): void {
      resultLayer.clearLayers()
      if (timer !== undefined) window.clearTimeout(timer)
      map.remove()
    },
  }
}
}