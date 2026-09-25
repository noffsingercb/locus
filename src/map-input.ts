/**
 * The input layer: a map with one pin.
 *
 * Structured as a swappable source so the v0.2 "use my location" affordance can
 * be added beside it without restructuring the app. The browser location API is
 * deliberately absent from this release, and privacy.test.ts asserts that the
 * shipped source does not so much as name it.
 *
 * Tiles are requested by z/x/y viewport coordinates only. The pin coordinate is
 * never appended to a tile URL or any other third-party request.
 */

import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Point } from './api'
import { DEBOUNCE_MS } from './config'

export interface PinInput {
  destroy(): void
}

const TILE_HOST = 'https://tile.openstreetmap.org'
const TILE_URL = `${TILE_HOST}/{z}/{x}/{y}.png`

/** Keeps a dragged pin inside a single world copy after worldCopyJump wrapping. */
function normalize(latlng: L.LatLng): Point {
  return { lat: latlng.lat, lng: ((((latlng.lng + 180) % 360) + 360) % 360) - 180 }
}

export function createMapPinInput(
  container: HTMLElement,
  onSettled: (point: Point) => void,
  debounceMs: number = DEBOUNCE_MS,
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
    destroy(): void {
      if (timer !== undefined) window.clearTimeout(timer)
      map.remove()
    },
  }
}
