import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const SOURCE_DIR = join(ROOT, 'src')

function sourceFiles(): Array<{ name: string; text: string }> {
  return readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, text: readFileSync(join(SOURCE_DIR, name), 'utf8') }))
}

const FORBIDDEN = [
  'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'sendBeacon',
  'history.pushState', 'history.replaceState', 'location.hash', 'location.search',
]
const NETWORK_USE = /\bfetch\s*\(|globalThis\.fetch|window\.fetch|typeof fetch\b|fetchImpl/

describe('coordinate containment', () => {
  it('never writes to a persistent or navigational store', () => {
    for (const file of sourceFiles()) {
      for (const pattern of FORBIDDEN) {
        expect(`${file.name}: ${file.text.includes(pattern)}`).toBe(`${file.name}: false`)
      }
    }
  })

  it('makes coordinate-bearing requests from exactly one module', () => {
    const callers = sourceFiles().filter((file) => NETWORK_USE.test(file.text))
    expect(callers.map((file) => file.name)).toEqual(['api.ts'])
  })

  it('keeps the coordinate out of URLs and applies a request-level no-referrer policy', () => {
    const api = readFileSync(join(SOURCE_DIR, 'api.ts'), 'utf8')
    expect(api).toContain('/v1/nearby')
    expect(api).toContain("referrerPolicy: 'no-referrer'")
    expect(api).not.toContain('?lat=')
  })

  it('keeps the page policy compatible with identifiable map requests', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    const headers = readFileSync(join(ROOT, 'public', '_headers'), 'utf8')
    expect(html).toContain('content="strict-origin-when-cross-origin"')
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin')
  })

  it('uses configurable keyless OpenFreeMap instead of keyed or volunteer raster tiles', () => {
    const config = readFileSync(join(SOURCE_DIR, 'config.ts'), 'utf8')
    const map = readFileSync(join(SOURCE_DIR, 'map-input.ts'), 'utf8')
    expect(config).toContain('VITE_MAP_STYLE_URL')
    expect(config).toContain('tiles.openfreemap.org/styles/positron')
    expect(config).not.toContain('basemaps.cartocdn.com')
    expect(map).toContain("from 'maplibre-gl'")
    expect(map).not.toContain('tile.openstreetmap.org')
  })

  it('does not ship the v0.2 browser location path', () => {
    for (const file of sourceFiles()) {
      expect(`${file.name}: ${file.text.includes('geolocation')}`).toBe(`${file.name}: false`)
    }
  })
})
