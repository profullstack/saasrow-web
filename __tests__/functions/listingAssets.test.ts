import { describe, it, expect, vi } from 'vitest'
import {
  extractAssetUrls,
  imageKind,
  captureScreenshot,
  completeListingAssets,
  slugify,
} from '../../supabase/functions/_shared/listingAssets'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(3000).fill(0)])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(3000).fill(0)])

describe('extractAssetUrls', () => {
  const html = `<!doctype html><html><head>
    <link rel="icon" href="/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
    <meta property="og:image" content="https://cdn.example.com/og.jpg?v=2&amp;w=1200">
    </head><body>
    <header><nav>
      <a href="/">Home</a><a href="/pricing">Pricing</a><a href="/docs/">Docs</a>
      <a href="https://twitter.com/acme">Twitter</a><a href="#top">Top</a><a href="/pricing">Pricing again</a>
      <a href="mailto:x@y.z">Mail</a><a href="/blog">Blog</a><a href="/about">About</a>
    </nav></header></body></html>`

  it('prefers the largest bitmap icon and resolves relative URLs', () => {
    const a = extractAssetUrls(html, 'https://acme.example/')
    expect(a.favicon).toBe('https://acme.example/apple.png')
    expect(a.ogImage).toBe('https://cdn.example.com/og.jpg?v=2&w=1200')
  })

  it('collects same-origin nav links, de-duplicated, homepage and anchors excluded, capped', () => {
    const a = extractAssetUrls(html, 'https://acme.example/', 3)
    expect(a.navLinks).toEqual([
      { text: 'Pricing', href: 'https://acme.example/pricing' },
      { text: 'Docs', href: 'https://acme.example/docs/' },
      { text: 'Blog', href: 'https://acme.example/blog' },
    ])
  })

  it('falls back to /favicon.ico and no og:image', () => {
    const a = extractAssetUrls('<html><body>hi</body></html>', 'https://plain.example/app')
    expect(a.favicon).toBe('https://plain.example/favicon.ico')
    expect(a.ogImage).toBeNull()
    expect(a.navLinks).toEqual([])
  })

  it('accepts twitter:image when there is no og:image', () => {
    const a = extractAssetUrls('<meta name="twitter:image" content="/t.png">', 'https://x.example/')
    expect(a.ogImage).toBe('https://x.example/t.png')
  })
})

describe('imageKind', () => {
  it('sniffs bytes rather than trusting the header', () => {
    expect(imageKind(PNG, 'text/html')).toBe('png')
    expect(imageKind(JPG)).toBe('jpg')
    expect(imageKind(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg')
    expect(imageKind(new TextEncoder().encode('<html>not found</html>'), 'image/png')).toBeNull()
  })
})

describe('captureScreenshot', () => {
  it('walks the chain until a provider returns a real image', async () => {
    const log = vi.fn()
    const shot = await captureScreenshot('https://acme.example', {}, {
      log,
      providers: [
        ['dead', async () => null],
        ['html-not-image', async () => ({ bytes: new TextEncoder().encode('<html>oops</html>'), contentType: 'image/png' })],
        ['thrower', async () => { throw new Error('boom') }],
        ['good', async () => ({ bytes: JPG, contentType: 'application/octet-stream' })],
      ],
    })
    expect(shot?.provider).toBe('good')
    expect(shot?.contentType).toBe('image/jpeg')
    expect(log).toHaveBeenCalledTimes(3)
  })

  it('returns null when every provider fails', async () => {
    const shot = await captureScreenshot('https://acme.example', {}, { providers: [['dead', async () => null]] })
    expect(shot).toBeNull()
  })

  it('puts keyed providers first and keyless ones last', async () => {
    const { screenshotProviders } = await import('../../supabase/functions/_shared/listingAssets')
    expect(screenshotProviders({}).map(([n]) => n)).toEqual(['microlink', 'thum.io'])
    expect(screenshotProviders({ SCREENSHOT_API_KEY: 'k', GETSCREENSHOT_API_KEY: 'r' }).map(([n]) => n)).toEqual([
      'screenshotone',
      'rasterwise',
      'microlink',
      'thum.io',
    ])
  })
})

describe('completeListingAssets', () => {
  function fakeDb(existingShots = 0) {
    const uploads: Array<{ bucket: string; name: string; contentType: string }> = []
    const inserts: unknown[] = []
    const updates: Record<string, unknown>[] = []
    const db = {
      storage: {
        from: (bucket: string) => ({
          upload: async (name: string, _bytes: Uint8Array, opts: { contentType: string }) => {
            uploads.push({ bucket, name, contentType: opts.contentType })
            return { error: null }
          },
          getPublicUrl: (name: string) => ({ data: { publicUrl: `https://cdn/${bucket}/${name}` } }),
        }),
      },
      from: (table: string) => {
        if (table === 'submission_screenshots') {
          return {
            select: () => ({ eq: async () => ({ count: existingShots }) }),
            insert: async (row: unknown) => {
              inserts.push(row)
              return { error: null }
            },
          }
        }
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              updates.push(patch)
              return { error: null }
            },
          }),
        }
      },
    }
    return { db, uploads, inserts, updates }
  }

  const fetchFn = (async (input: string | URL | Request) => {
    const u = String(input)
    if (u === 'https://acme.example') {
      return new Response('<link rel="icon" type="image/png" href="/i.png"><meta property="og:image" content="/og.jpg">', {
        headers: { 'content-type': 'text/html' },
      })
    }
    if (u.endsWith('/i.png')) return new Response(PNG, { headers: { 'content-type': 'image/png' } })
    if (u.endsWith('/og.jpg')) return new Response(JPG, { headers: { 'content-type': 'image/jpeg' } })
    return new Response('nope', { status: 404 })
  }) as unknown as typeof fetch

  const row = { id: 'l1', url: 'https://acme.example', title: 'Acme', tier: 'free', logo: null, image: null }

  it('adds logo, og:image and a homepage screenshot for a free listing', async () => {
    const { db, uploads, inserts, updates } = fakeDb()
    const result = await completeListingAssets(db, row, {
      fetchFn,
      screenshot: async () => ({ bytes: PNG, contentType: 'image/png', provider: 'test' }),
    })
    expect(result).toMatchObject({ logo: 'added', image: 'added', screenshots: 1, provider: 'test' })
    expect(uploads.map((u) => u.bucket)).toEqual(['software-logos', 'software-images', 'submission-screenshots'])
    expect(inserts).toHaveLength(1)
    expect(updates[0]).toMatchObject({ logo: expect.stringMatching(/\.png$/), image: expect.stringMatching(/\.jpg$/) })
    expect(updates[0].assets_checked_at).toBeTruthy()
  })

  it('uses the homepage screenshot as the image when there is no og:image', async () => {
    const { db, uploads } = fakeDb()
    const noOg = (async (input: string | URL | Request) =>
      String(input) === 'https://acme.example'
        ? new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
        : new Response('', { status: 404 })) as unknown as typeof fetch
    const result = await completeListingAssets(db, row, {
      fetchFn: noOg,
      screenshot: async () => ({ bytes: PNG, contentType: 'image/png', provider: 'test' }),
    })
    expect(result.image).toBe('from-screenshot')
    expect(result.logo).toBe('none')
    expect(uploads.filter((u) => u.bucket === 'software-images')).toHaveLength(1)
  })

  it('does nothing but stamp the check when everything exists', async () => {
    const { db, uploads, updates } = fakeDb(2)
    const screenshot = vi.fn()
    const result = await completeListingAssets(db, { ...row, logo: 'x.png', image: 'y.png' }, { fetchFn, screenshot })
    expect(result.notes).toEqual(['nothing missing'])
    expect(uploads).toHaveLength(0)
    expect(screenshot).not.toHaveBeenCalled()
    expect(Object.keys(updates[0])).toEqual(['assets_checked_at'])
  })

  it('still stamps the check when the page is down, so it is not retried every sweep', async () => {
    const { db, updates } = fakeDb()
    const down = (async () => new Response('', { status: 503 })) as unknown as typeof fetch
    const result = await completeListingAssets(db, row, { fetchFn: down, screenshot: async () => null })
    expect(result.screenshots).toBe(0)
    expect(result.notes).toContain('page did not return HTML')
    expect(updates[0].assets_checked_at).toBeTruthy()
  })
})

describe('slugify', () => {
  it('makes a safe file name segment', () => {
    expect(slugify('  Pricing & Plans! ')).toBe('pricing-plans')
    expect(slugify('***')).toBe('page')
  })
})
