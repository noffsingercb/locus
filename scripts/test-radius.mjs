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
  await page.route('https://tiles.example.test/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [] }, headers: { 'access-control-allow-origin': '*' } }))
  await page.route('https://api.example.test/v1/nearby', async route => {
    const request = route.request()
    const body = request.postDataJSON()
    requests.push({ method: request.method(), url: request.url(), body })
    const total = body.radiusKm === 200 ? 149 : 1
    const offset = body.offset
    const count = Math.min(body.limit, total - offset)
    const entries = Array.from({ length: count }, (_, n) => { const i = offset + n; return ({ id: `Q${i}`, title: `Record ${i}`, displayTitle: null, blurb: null, dateStart: '1900-01-01', dateEnd: null, datePrecision: 'day', category: 'event', scope: 'local', significance: 0.5, notability: 0.5, coordSource: 'P625', lat: 39.7392 + i / 10000, lng: -104.9903 + i / 10000, distanceKm: i / 10, sourceUrl: `https://example.org/${i}` }) })
    await route.fulfill({ json: { datasetVersion: 'test', datasetBuild: build, engine: 'test', radiusKm: body.radiusKm, coordinateMode: 'direct', significanceFloor: 0.05, totalWithinRadius: total, offset, returned: count, entries }, headers: { 'access-control-allow-origin': '*' } })
  })
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.waitForSelector('.maplibregl-canvas')
  await page.locator('.maplibregl-canvas').click({ position: { x: 250, y: 220 } })
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 1–1 of 1'))
  await page.locator('#radius').fill('200')
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 1–25 of 149'))
  assert.equal(await page.locator('.entry').count(), 25)
  assert.equal(await page.locator('#radius-value').textContent(), '200 km')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 26–50 of 149'))
  assert.equal(await page.locator('.entry').count(), 25)
  const countBefore = requests.length
  await page.getByRole('button', { name: 'Show Record 25 on the map' }).click()
  await page.waitForTimeout(2200)
  const pin = await page.locator('.locus-result-pin').filter({hasText: '26'}).boundingBox()
  const map = await page.locator('#map').boundingBox()
  assert.ok(pin && map && Math.abs((pin.x + pin.width/2) - (map.x + map.width/2)) < 12 && Math.abs((pin.y + pin.height/2) - (map.y + map.height/2)) < 12, 'selected result centered on map')
  assert.equal(requests.length, countBefore, 'map focus must not trigger a new search')
  const nextMarker = page.getByRole('button', { name: 'Show Record 26 on the map' })
  await nextMarker.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2200)
  const keyboardPin = await page.locator('.locus-result-pin').filter({hasText: '27'}).boundingBox()
  assert.ok(keyboardPin && Math.abs((keyboardPin.x + keyboardPin.width/2) - (map.x + map.width/2)) < 12, 'keyboard centers marker')
  for (let i = 2; i < 6; i++) {
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.waitForFunction(n => document.querySelector('.pagination')?.textContent?.includes(`Page ${n}`), i + 1)
  }
  assert.equal(await page.locator('.entry').count(), 24)
  assert.equal(await page.getByRole('button', {name: 'Next', exact: true}).isDisabled(), true)
  for (let i = 6; i > 1; i--) {
    await page.getByRole('button', { name: 'Previous', exact: true }).click()
    await page.waitForFunction(n => document.querySelector('.pagination')?.textContent?.includes(`Page ${n}`), i - 1)
  }
  build = 'changed'
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('dataset changed'))
  assert.equal(await page.locator('.entry').count(), 0)
  assert.deepEqual(requests.map(r => r.body.offset), [0, 0, 25, 50, 75, 100, 125, 100, 75, 50, 25, 0, 25])
  assert.ok(requests.every(r => r.method === 'POST' && r.body.limit === 25))
  assert.ok(requests.every(r => !r.url.includes('?')))
  console.log('Browser test passed: paging, focus without a search, privacy, dataset-change guard.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
