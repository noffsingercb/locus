import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The written pages are hand-authored HTML copied verbatim out of public/, so
 * nothing in the build checks them. Circa's footer carries a warning that its
 * link list is duplicated in six places and that a page shipped once without
 * being added to the app's copy. These tests are that warning made executable:
 * the link lists must agree, every destination and every referenced asset must
 * exist, and every page must carry the shared stylesheets and the
 * privacy-relevant meta.
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

/*
 * The sibling applet. It sits after the spacer rather than in the internal
 * link list, which keeps that list at six destinations -- Circa's own footer
 * carries a warning that a seventh link is the point at which a shared include
 * should be built instead.
 */
const CIRCA = 'https://www.circatimeline.org'

/*
 * Sampled from the logo artwork. Asserting the literal is the point: the
 * palette is only "one file" for as long as nobody hand-edits a hex into a
 * component, and this fails loudly if the token moves away from the mark.
 */
const ACCENT = '#104d9d'

/*
 * www is canonical; the apex redirects to it. Both the canonical link and the
 * og: tags have to name the same host, or a crawler is told one thing and a
 * scraper another.
 */
const SITE = 'https://www.locustimeline.org'

function pageFile(route: string): string {
  return join(PUBLIC_DIR, route.replace(/^\//, ''), 'index.html')
}

function readPage(route: string): string {
  return readFileSync(pageFile(route), 'utf8')
}

/** Every document, applet first. */
function allDocuments(): { name: string; html: string }[] {
  return [
    { name: '/', html: readFileSync(join(ROOT, 'index.html'), 'utf8') },
    ...PAGES.map((route) => ({ name: route, html: readPage(route) })),
  ]
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

  it('credits the author and links the sibling applet from every footer', () => {
    for (const { html } of allDocuments()) {
      expect(html).toContain(LINKEDIN)
      expect(html).toContain(CIRCA)
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

  it('keeps the palette in one file, and on the logo', () => {
    const theme = readFileSync(join(PUBLIC_DIR, 'theme.css'), 'utf8')
    const app = readFileSync(join(ROOT, 'src', 'style.css'), 'utf8')
    const favicon = readFileSync(join(PUBLIC_DIR, 'favicon.svg'), 'utf8')
    expect(theme).toContain(`--accent: ${ACCENT}`)
    // The favicon is served from public/ and so cannot read a custom property
    // from theme.css; its fill is a hand-kept copy and drifts silently.
    expect(favicon).toContain(ACCENT)
    // theme-color is a third hand-kept copy of the same value, in six heads.
    for (const { name, html } of allDocuments()) {
      expect(`${name}: ${html.includes(`<meta name="theme-color" content="${ACCENT}" />`)}`).toBe(
        `${name}: true`,
      )
    }
    // The app stylesheet may use tokens but must not redefine them, or the
    // pages and the applet can drift apart on colour.
    expect(app).not.toContain('--accent:')
    expect(app).not.toContain(':root')
  })

  it('carries the icon set and the installable manifest on every document', () => {
    for (const { name, html } of allDocuments()) {
      for (const tag of [
        'rel="icon" href="/favicon.svg"',
        'rel="icon" href="/favicon.ico"',
        'rel="apple-touch-icon" href="/apple-touch-icon.png"',
        'rel="manifest" href="/site.webmanifest"',
      ]) {
        expect(`${name}: ${tag}: ${html.includes(tag)}`).toBe(`${name}: ${tag}: true`)
      }
    }
  })

  it('declares a canonical URL and an og: card that agree on the host', () => {
    const expected: Record<string, string> = { '/': `${SITE}/` }
    for (const route of PAGES) expected[route] = `${SITE}${route}`

    for (const { name, html } of allDocuments()) {
      const canonical = /<link rel="canonical" href="([^"]+)" \/>/.exec(html)?.[1]
      const ogUrl = /<meta property="og:url" content="([^"]+)" \/>/.exec(html)?.[1]
      expect(`${name} canonical: ${canonical}`).toBe(`${name} canonical: ${expected[name]}`)
      // A canonical that disagrees with og:url tells a crawler one thing and a
      // scraper another, which is worse than omitting both.
      expect(`${name} og:url: ${ogUrl}`).toBe(`${name} og:url: ${expected[name]}`)
      expect(`${name}: ${html.includes(`content="${SITE}/og-card.png"`)}`).toBe(`${name}: true`)
      expect(`${name}: ${html.includes('name="twitter:card"')}`).toBe(`${name}: true`)
      // og:title and og:description must exist rather than be inherited: a
      // scraper that finds neither falls back to whatever text it likes.
      expect(`${name}: ${/property="og:title" content="[^"]+"/.test(html)}`).toBe(`${name}: true`)
      expect(`${name}: ${/property="og:description" content="[^"]{40,}"/.test(html)}`).toBe(
        `${name}: true`,
      )
    }
  })

  it('references no icon, image or manifest that is missing from public/', () => {
    const manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, 'site.webmanifest'), 'utf8'))
    const referenced = new Set<string>(
      (manifest.icons as { src: string }[]).map((icon) => icon.src),
    )

    for (const { html } of allDocuments()) {
      // Root-relative assets in a link/meta, plus absolute og: image URLs on
      // our own host, reduced to the path they resolve to inside public/.
      for (const [, path] of html.matchAll(/(?:href|src|content)="(\/[\w./-]+\.(?:png|ico|svg|webmanifest))"/g)) {
        referenced.add(path)
      }
      for (const [, path] of html.matchAll(
        new RegExp(`content="${SITE}(/[\\w./-]+\\.(?:png|ico|svg))"`, 'g'),
      )) {
        referenced.add(path)
      }
    }

    // This is the gate that catches an icon set that was generated but never
    // committed: the tags ship, the files 404, and nothing else notices.
    for (const path of [...referenced].sort()) {
      expect(`${path}: ${existsSync(join(PUBLIC_DIR, path.replace(/^\//, '')))}`).toBe(
        `${path}: true`,
      )
    }
    expect(referenced.size).toBeGreaterThan(8)
  })

  it('serves the mark in the wordmark of every written page', () => {
    for (const route of PAGES) {
      expect(`${route}: ${readPage(route).includes('<img src="/locus-mark-128.png" alt=""')}`).toBe(
        `${route}: true`,
      )
    }
  })
})
