import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Cloudflare security headers', () => {
  it('ships one restrictive CSP with the map and API origins', () => {
    const headers = readFileSync(join(process.cwd(), 'public', '_headers'), 'utf8')
    const lines = headers.split('\n').filter((line) => /^\s*Content-Security-Policy:/i.test(line))
    expect(lines).toHaveLength(1)
    const policy = lines[0].replace(/^\s*Content-Security-Policy:\s*/i, '')
    const directives = policy.split(';').map((part) => part.trim()).filter(Boolean)
    expect(directives).toEqual([
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://tiles.openfreemap.org",
      "connect-src 'self' https://geohistory-api.onrender.com https://tiles.openfreemap.org",
      "worker-src 'self'",
      "font-src 'self'",
      "manifest-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ])
  })
})
