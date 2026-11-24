/** MapLibre pin input and numbered result-marker layer. */

import { LngLatBounds, Map, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Point } from './api'
import { DEBOUNCE_MS, MAP_STYLE_URL } from './config'
import type { NumberedResult } from './result-markers'

export interface PinInput {
  showResults(results: readonly NumberedResult[]): void
  appendResults(results: readonly NumberedResult[]): void
  focusResult(result: NumberedResult): void
  clearResults(): void
  destroy(): void
}

function normalize(latlng: { lat: number; lng: number }): Point {
  return { lat: latlng.lat, lng: ((((latlng.lng + 180) % 360) + 360) % 360) - 180 }
}

function markerElement(className: string, text?: string): HTMLDivElement {
  const element = document.createElement('div')
  element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

export function createMapPinInput(
  container: HTMLElement,
  onSettled: (point: Point) => void,
  debounceMs: number = DEBOUNCE_MS,
  onResultSelected?: (result: NumberedResult) => void,
): PinInput {
  const map = new Map({
    container,
    style: MAP_STYLE_URL,
    center: [-104.9903, 39.7392],
    zoom: 10,
  })
  map.addControl(new NavigationControl({ showCompass: false }), 'top-left')

  const resultMarkers: Marker[] = []
  let marker: Marker | null = null
  let timer: number | undefined

  const settle = (point: Point): void => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => onSettled(point), debounceMs)
  }

  const place = (latlng: { lat: number; lng: number }): void => {
    if (marker === null) {
      const element = markerElement('locus-pin')
      element.setAttribute('aria-label', 'Selected location')
      marker = new Marker({ element, draggable: true, anchor: 'center' })
        .setLngLat([latlng.lng, latlng.lat])
        .addTo(map)
      marker.on('drag', () => {
        if (marker !== null) settle(normalize(marker.getLngLat()))
      })
      marker.on('dragend', () => {
        if (marker !== null) settle(normalize(marker.getLngLat()))
      })
    } else {
      marker.setLngLat([latlng.lng, latlng.lat])
    }
    settle(normalize(latlng))
  }

  map.on('click', (event) => place(event.lngLat))

  const clearResults = (): void => {
    while (resultMarkers.length > 0) resultMarkers.pop()?.remove()
  }

  const addResults = (numbered: readonly NumberedResult[]): LngLatBounds => {
    const bounds = new LngLatBounds()
    for (const result of numbered) {
      const element = markerElement('locus-result-pin', String(result.number))
      element.title = `${result.number}. ${result.title}`
      element.setAttribute('role', 'button')
      element.setAttribute('tabindex', '0')
      element.setAttribute('aria-label', `${result.number}. ${result.title}`)
      element.addEventListener('click', (event) => { event.stopPropagation(); onResultSelected?.(result) })
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onResultSelected?.(result)
        }
      })
      resultMarkers.push(new Marker({ element, anchor: 'center' }).setLngLat([result.lng, result.lat]).addTo(map))
      bounds.extend([result.lng, result.lat])
    }
    return bounds
  }

  return {
    showResults(numbered: readonly NumberedResult[]): void {
      clearResults()
      if (numbered.length === 0) return
      const bounds = addResults(numbered)
      if (marker !== null) {
        const pinAt = marker.getLngLat()
        bounds.extend([pinAt.lng, pinAt.lat])
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 32, maxZoom: 14 })
    },
    appendResults(numbered: readonly NumberedResult[]): void {
      addResults(numbered)
    },
    focusResult(result): void {
      const center: [number, number] = [result.lng, result.lat]
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) map.jumpTo({ center, zoom: 14 })
      else map.flyTo({ center, zoom: 14 })
      const bounds = container.getBoundingClientRect()
      if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
        container.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      }
    },
    clearResults,
    destroy(): void {
      clearResults()
      marker?.remove()
      if (timer !== undefined) window.clearTimeout(timer)
      map.remove()
    },
  }
}
