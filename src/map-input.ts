/** Leaflet pin input and numbered result-marker layer. */

import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Point } from './api'
import { DEBOUNCE_MS, TILE_ATTRIBUTION, TILE_URL } from './config'
import type { NumberedResult } from './result-markers'
import { escapeHtml } from './view'

export interface PinInput {
  showResults(results: readonly NumberedResult[]): void
  clearResults(): void
  destroy(): void
}

const RESULT_MARKER_PX = 26

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
    maxZoom: 20,
    attribution: TILE_ATTRIBUTION,
  }).addTo(map)

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
    showResults(numbered: readonly NumberedResult[]): void {
      resultLayer.clearLayers()
      if (numbered.length === 0) return
      const points: L.LatLngTuple[] = []
      const half = RESULT_MARKER_PX / 2

      for (const result of numbered) {
        const numberIcon = L.divIcon({
          className: 'locus-result-pin',
          html: String(result.number),
          iconSize: [RESULT_MARKER_PX, RESULT_MARKER_PX],
          iconAnchor: [half, half],
        })
        const resultMarker = L.marker([result.lat, result.lng], {
          icon: numberIcon,
          keyboard: true,
          title: `${result.number}. ${result.title}`,
        })
        resultMarker.bindTooltip(`${result.number}. ${escapeHtml(result.title)}`, { direction: 'top' })
        resultMarker.on('click', () => onResultSelected?.(result))
        resultMarker.addTo(resultLayer)
        points.push([result.lat, result.lng])
      }

      if (marker !== null) {
        const pinAt = marker.getLatLng()
        points.push([pinAt.lat, pinAt.lng])
      }
      const bounds = L.latLngBounds(points)
      if (!map.getBounds().contains(bounds)) map.fitBounds(bounds, { padding: [32, 32] })
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
