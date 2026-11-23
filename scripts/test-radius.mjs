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
  await page.route('https://tiles.example.test/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [] }, headers: { 'access-control-allow-origin': '*' } }))
  await page.route('https://api.example.test/v1/nearby', async route => {
    const request = route.request()
    const body = request.postDataJSON()
    requests.push({ method: request.method(), url: request.url(), body })
    const count = body.radiusKm === 200 ? 100 : 1
    const entries = Array.from({ length: count }, (_, i) => ({ id: `Q${i}`, title: `Record ${i}`, displayTitle: null, blurb: null, dateStart: '1900-01-01', dateEnd: null, datePrecision: 'day', category: 'event', scope: 'local', significance: 0.5, notability: 0.5, coordSource: 'P625', lat: 39.7392, lng: -104.9903, distanceKm: i / 10, sourceUrl: `https://example.org/${i}` }))
    await route.fulfill({ json: { datasetVersion: 'test', datasetBuild: 'test', engine: 'test', radiusKm: body.radiusKm, coordinateMode: 'direct', significanceFloor: 0.05, totalWithinRadius: body.radiusKm === 200 ? 149 : count, returned: count, entries }, headers: { 'access-control-allow-origin': '*' } })
  })
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.waitForSelector('.maplibregl-canvas')
  await page.locator('.maplibregl-canvas').click({ position: { x: 250, y: 220 } })
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('Showing 1 matching'))
  await page.locator('#radius').fill('200')
  await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('100 closest of 149'))
  assert.equal(await page.locator('.entry').count(), 100)
  assert.equal(await page.locator('#radius-value').textContent(), '200 km')
  assert.deepEqual(requests.map(r => [r.method, r.body.radiusKm, r.body.limit]), [['POST', 15, 100], ['POST', 200, 100]])
  assert.ok(requests.every(r => !r.url.includes('?')))
  console.log('Radius browser test passed: POST-only coordinates, slider, 100 cards and capped-count disclosure.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
