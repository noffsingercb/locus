/**
 * The privacy posture is the product's identity, so it is asserted against the
 * source itself rather than described in a README. These tests fail if a future
 * change introduces a way for a coordinate to leave memory.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_DIR = join(process.cwd(), 'src')

function sourceFiles(): Array<{ name: string; text: string }> {
  return readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, text: readFileSync(join(SOURCE_DIR, name), 'utf8') }))
}

const FORBIDDEN = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'document.cookie',
  'sendBeacon',
  'history.pushState',
  'history.replaceState',
  'location.hash',
  'location.search',
]

describe('coordinate containment', () => {
  it('never writes to a persistent or navigational store', () => {
    for (const file of sourceFiles()) {
      for (const pattern of FORBIDDEN) {
        expect(`${file.name}: ${file.text.includes(pattern)}`).toBe(`${file.name}: false`)
      }
    }
  })

  it('makes network requests from exactly one module', () => {
    const callers = sourceFiles().filter((file) => /\bfetch\s*\(/.test(file.text))

    expect(callers.map((file) => file.name)).toEqual(['api.ts'])
  })

  it('sends the coordinate only to the configured GeoHistory nearby route', () => {
    const api = readFileSync(join(SOURCE_DIR, 'api.ts'), 'utf8')
    const urls = api.match(/https?:\/\/[^'"`\s]+/g) ?? []

    // The only absolute URL in the network module is the local dev default.
    expect(urls).toEqual([])
    expect(api).toContain('/v1/nearby')
  })

  it('does not ship the v0.2 geolocation path', () => {
    for (const file of sourceFiles()) {
      expect(`${file.name}: ${file.text.includes('geolocation')}`).toBe(`${file.name}: false`)
    }
  })
})
