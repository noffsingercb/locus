import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The written pages are hand-authored HTML copied verbatim out of public/, so
 * nothing in the build checks them. Circa's footer carries a warning that its
 * link list is duplicated in six places and that a page shipped once without
 * being added to the app's copy. These tests are that warning made executable:
 * the link lists must agree, every destination must exist, and every page must
 * carry the shared stylesheets and the privacy-relevant meta.
 */

const ROOT = process.cwd()
const PUBLIC_DIR = join(ROOT, 'public')

/** Static pages, by the path they are served at. */
const PAGES = ['/why', '/how-it-works', '/resources', '/faq', '/privacy'] as const

/** The footer as the written pages carry it: the app link, then the pages. */
const PAGE_FOOTER_LINKS = ['/', ...PAGES]

/** The applet's copy drops the link to itself and keeps everything else. */
const APP_FOOTER_LINKS = [...PAGES]

const LINKEDIN = 'https://www.linkedin.com/in/noffsingercb/'

function pageFile(route: string): string {
  return join(PUBLIC_DIR, route.replace(/^\//, ''), 'index.html')
}

function readPage(route: string): string {
  return readFileSync(pageFile(route), 'utf8')
}

/** Internal hrefs inside the site footer, in document order. */
function footerLinks(html: string): string[] {
  const footer = /<footer class="site-footer[^"]*">([\s\S]*?)<\/footer>/.exec(html)
  if (footer === null) return []
  return [...footer[1].matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1])
}

describe('written pages', () => {
  it('has a file for every footer destination', () => {
    for (const route of PAGES) {
      expect(`${route}: ${existsSync(pageFile(route))}`).toBe(`${route}: true`)
    }
  })

  it('links the shared theme and site stylesheets rather than a private copy', () => {
    for (const route of PAGES) {
      const html = readPage(route)
      expect(`${route}: ${html.includes('href="/theme.css"')}`).toBe(`${route}: true`)
      expect(`${route}: ${html.includes('href="/site.css"')}`).toBe(`${route}: true`)
      expect(`${route}: ${html.includes('<style')}`).toBe(`${route}: false`)
    }
  })

  it('keeps every footer copy in agreement, including the applet', () => {
    for (const route of PAGES) {
      expect(`${route}: ${footerLinks(readPage(route)).join(' ')}`).toBe(
        `${route}: ${PAGE_FOOTER_LINKS.join(' ')}`,
      )
    }

    const index = readFileSync(join(ROOT, 'index.html'), 'utf8')
    expect(footerLinks(index)).toEqual(APP_FOOTER_LINKS)
  })

  it('credits the author from every footer', () => {
    const files = [readFileSync(join(ROOT, 'index.html'), 'utf8'), ...PAGES.map(readPage)]
    for (const html of files) {
      expect(html).toContain(LINKEDIN)
    }
  })

  it('carries the page metadata a static route needs', () => {
    for (const route of PAGES) {
      const html = readPage(route)
      expect(`${route}: ${html.includes('<html lang="en">')}`).toBe(`${route}: true`)
      expect(`${route}: ${/<title>[^<]+ — Locus<\/title>/.test(html)}`).toBe(`${route}: true`)
      expect(`${route}: ${/<meta name="description" content="[^"]{40,}"/.test(html)}`).toBe(
        `${route}: true`,
      )
      expect(`${route}: ${html.includes('name="viewport"')}`).toBe(`${route}: true`)
      expect(`${route}: ${html.includes('href="/favicon.svg"')}`).toBe(`${route}: true`)
      expect(`${route}: ${(html.match(/<h1>/g) ?? []).length}`).toBe(`${route}: 1`)
    }
  })

  it('applies the same referrer policy the applet and the headers use', () => {
    for (const route of PAGES) {
      expect(`${route}: ${readPage(route).includes('content="strict-origin-when-cross-origin"')}`)
        .toBe(`${route}: true`)
    }
  })

  it('ships no script, no third-party embed and no coordinate-bearing link', () => {
    for (const route of PAGES) {
      const html = readPage(route)
      expect(`${route}: ${html.includes('<script')}`).toBe(`${route}: false`)
      expect(`${route}: ${html.includes('<iframe')}`).toBe(`${route}: false`)
      expect(`${route}: ${html.includes('?lat=')}`).toBe(`${route}: false`)
    }
  })

  it('states the coverage limits rather than promising uniform history', () => {
    // The density study's verdict was explicit that launch copy must not imply
    // global local-history coverage. These are the two pages that make claims.
    expect(readPage('/how-it-works')).toContain('broad rather than complete')
    expect(readPage('/resources')).toContain('broad rather than complete')
    expect(readPage('/why')).toContain('Open ocean')
  })

  it('keeps the palette in one file', () => {
    const theme = readFileSync(join(PUBLIC_DIR, 'theme.css'), 'utf8')
    const app = readFileSync(join(ROOT, 'src', 'style.css'), 'utf8')
    expect(theme).toContain('--accent: #1b4f9c')
    // The app stylesheet may use tokens but must not redefine them, or the
    // pages and the applet can drift apart on colour.
    expect(app).not.toContain('--accent:')
    expect(app).not.toContain(':root')
  })
})
