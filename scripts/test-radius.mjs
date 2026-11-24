import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'

const port = await new Promise((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)) })
})
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  env: { ...process.env, VITE_GEOHISTORY_API_BASE_URL: 'https://api.example.test', VITE_MAP_STYLE_URL: 'https://tiles.example.test/style.json' },
  stdio: 'ignore',
})
let browser
try {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error('Local Vite server exited before readiness')
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break } catch {}
    if (i === 79) throw new Error('Local Vite server did not start')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    headless: true,
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const requests = []
  let build = 'test'
  let failNextPage = false
  let changeNextPage = false
  let delayNextPage = false
  await page.route('https://tiles.example.test/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [] }, headers: { 'access-control-allow-origin': '*' } }))
  await page.route('https://api.example.test/v1/nearby', async route => {
    const request = route.request()
    const body = request.postDataJSON()
    requests.push({ method: request.method(), url: request.url(), body })
    if (body.offset > 0 && delayNextPage) { delayNextPage = false; await new Promise(resolve => setTimeout(resolve, 1000)) }
    if (body.offset > 0 && failNextPage) { failNextPage = false; await route.fulfill({ status: 503, json: { error: 'Temporary failure' }, headers: { 'access-control-allow-origin': '*' } }); return }
    const responseBuild = body.offset > 0 && changeNextPage ? 'changed' : build
    const baseTotal = body.radiusKm === 200 ? 549 : body.radiusKm === 195 ? 94 : 1
    const all = Array.from({ length: baseTotal }, (_, i) => ({ id: `Q${i}`, title: `Record ${i}`, displayTitle: null, blurb: null, dateStart: `${1800 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-01`, dateEnd: null, datePrecision: 'day', category: i % 2 ? 'event' : 'founding', scope: 'local', significance: i % 3 === 0 ? 0.95 : 0.5, notability: 0.5, coordSource: 'P625', lat: 39.7392 + i / 10000, lng: -104.9903 + i / 10000, distanceKm: i / 10, sourceUrl: `https://example.org/${i}` }))
    const filtered = all.filter(e => !body.excludeCategories.includes(e.category) && e.significance >= body.significanceFloor)
    const total = filtered.length
    const offset = body.offset
    const entries = filtered.slice(offset, offset + body.limit)
    const count = entries.length
    await route.fulfill({ json: { datasetVersion: 'test', datasetBuild: responseBuild, engine: 'test', radiusKm: body.radiusKm, coordinateMode: body.coordinateMode, order: body.order, significanceFloor: body.significanceFloor, totalWithinRadius: total, offset, returned: count, entries }, headers: { 'access-control-allow-origin': '*' } })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.waitForSelector('.maplibregl-canvas')
  await page.locator('.maplibregl-canvas').click({ position: { x: 250, y: 220 } })
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 1 of 1'))
  const panel = page.locator('#results')
  const originalY = await page.evaluate(() => window.scrollY)

  // A Madrid-sized search loads completely in a single request, without scrolling.
  await page.locator('#radius').fill('195')
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 94 of 94'))
  assert.equal(await page.locator('.entry').count(), 94)
  assert.equal(await page.locator('.locus-result-pin').count(), 94)
  assert.equal(await panel.evaluate(e => e.scrollTop), 0)
  assert.equal(await panel.evaluate(e => getComputedStyle(e).overflowY), 'auto')
  assert.ok(await panel.evaluate(e => e.scrollHeight > e.clientHeight))
  assert.equal(requests.at(-1).body.offset, 0)

  // More than one batch also completes without scroll or a Load more click.
  await page.locator('#radius').fill('200')
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 549 of 549'))
  assert.equal(await page.locator('.entry').count(), 549)
  assert.equal(await page.locator('.locus-result-pin').count(), 549)
  assert.equal(await panel.evaluate(e => e.scrollTop), 0)
  assert.deepEqual(requests.slice(-2).map(r => r.body.offset), [0, 500])
  assert.ok(await page.getByText('Lots to explore', { exact: false }).isVisible())
  assert.equal(await page.getByRole('button', { name: 'Load more results' }).count(), 0)
  assert.ok(requests.every(r => r.method === 'POST' && r.body.limit === 500 && r.body.order === 'chronological' && !r.url.includes('?')))

  const countBefore = requests.length
  await page.getByRole('button', { name: 'Show Record 25 on the map' }).click()
  const pin = await page.locator('.locus-result-pin').filter({hasText: /^26$/}).boundingBox()
  const map = await page.locator('#map').boundingBox()
  assert.ok(pin && map && Math.abs((pin.x + pin.width/2) - (map.x + map.width/2)) < 12 && Math.abs((pin.y + pin.height/2) - (map.y + map.height/2)) < 12)
  assert.equal(requests.length, countBefore)
  assert.equal(await page.evaluate(() => window.scrollY), originalY)
  const keyboardButton = page.getByRole('button', { name: 'Show Record 26 on the map' })
  await keyboardButton.focus()
  await page.keyboard.press('Enter')
  const keyboardPin = await page.locator('.locus-result-pin').filter({hasText: /^27$/}).boundingBox()
  assert.ok(keyboardPin && Math.abs((keyboardPin.x + keyboardPin.width/2) - (map.x + map.width/2)) < 12)

  // A failed automatic continuation preserves the first batch and can resume.
  await page.locator('#radius').fill('195')
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 94 of 94'))
  failNextPage = true
  await page.locator('#radius').fill('200')
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Temporary failure'))
  assert.equal(await page.locator('.entry').count(), 500)
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 549 of 549'))

  await page.locator('#radius').fill('195')
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 94 of 94'))
  changeNextPage = true
  await page.locator('#radius').fill('200')
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('dataset changed'))
  assert.equal(await page.locator('.entry').count(), 500)
  changeNextPage = false

  // An in-flight later batch cannot contaminate a new search.
  delayNextPage = true
  await page.getByRole('button', { name: 'Start again' }).click()
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 500 of 549'))
  await page.locator('#radius').fill('195')
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 94 of 94'))
  await page.waitForTimeout(1200)
  assert.equal(await page.locator('.entry').count(), 94)

  await page.getByText('Filter event categories').click()
  await page.locator('[data-category="founding"]').uncheck()
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 47 of 47'))
  assert.ok(requests.at(-1).body.excludeCategories.includes('founding'))
  await page.locator('#notable').check()
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 16 of 16'))
  assert.equal(requests.at(-1).body.significanceFloor, 0.9)
  const peopleResponse = page.waitForResponse(response => response.url().endsWith('/v1/nearby') && !response.request().postDataJSON().excludeCategories.includes('birth'))
  await page.locator('#people').check()
  await peopleResponse
  assert.equal(requests.at(-1).body.coordinateMode, 'direct-with-people')

  await page.setViewportSize({ width: 420, height: 760 })
  const card = page.getByRole('button', { name: 'Show Record 3 on the map' })
  await card.scrollIntoViewIfNeeded()
  await card.click()
  await page.waitForFunction(() => { const r = document.querySelector('#map').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  console.log('Browser test passed: automatic full loading, retries, cancellation, map focus, filters and privacy.')

} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
