#!/usr/bin/env node
// Fill missing logos, images and screenshots for every approved listing,
// using a local headless Chrome for screenshots (falling back to the same
// provider chain the edge function uses when a page will not load).
//
//   doppler run -p saasrow -c prd -- node scripts/backfill-listing-assets.mjs [--limit N] [--concurrency 3] [--dry-run]
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Uses the
// same `listings_needing_assets()` query as the edge function, so it picks
// exactly the rows the periodic sweep would, just faster. Node 24 strips the
// types from the shared .ts helper on import.

import { homedir } from 'node:os'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'
import { captureScreenshot, completeListingAssets } from '../supabase/functions/_shared/listingAssets.ts'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const LIMIT = Number.parseInt(flag('limit', '100000'), 10)
const CONCURRENCY = Number.parseInt(flag('concurrency', '3'), 10)
const DRY_RUN = args.includes('--dry-run')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (doppler run -p saasrow -c prd -- …)')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })

// Chrome on the dev box needs its staged runtime libs and fonts.
const home = homedir()
const deps = join(home, '.local/share/chrome-deps')
if (existsSync(deps)) {
  process.env.LD_LIBRARY_PATH = `${join(deps, 'usr/lib/x86_64-linux-gnu')}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}`
  process.env.FONTCONFIG_FILE = join(deps, 'etc/fonts/fonts.conf')
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const root = join(home, '.cache/puppeteer/chrome')
  if (!existsSync(root)) return undefined
  const versions = readdirSync(root).sort().reverse()
  for (const v of versions) {
    const p = join(root, v, 'chrome-linux64/chrome')
    if (existsSync(p)) return p
  }
  return undefined
}

const env = {
  SCREENSHOT_API_KEY: process.env.SCREENSHOT_API_KEY,
  GETSCREENSHOT_API_KEY: process.env.GETSCREENSHOT_API_KEY,
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: findChrome(),
  // A page that never finishes painting would otherwise hold a slot for the
  // default 180 s before Page.captureScreenshot gives up.
  protocolTimeout: 45_000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
})

async function chromeScreenshot(target) {
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 1280, height: 800 })
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 SaaSRowBot/1.0',
    )
    const res = await page.goto(target, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null)
    if (!res || res.status() >= 400) return null
    await new Promise((r) => setTimeout(r, 1500))
    const bytes = new Uint8Array(await page.screenshot({ type: 'png' }))
    return bytes.length > 2_000 ? { bytes, contentType: 'image/png', provider: 'chrome' } : null
  } catch (err) {
    console.warn(`  chrome failed for ${target}: ${err.message}`)
    return null
  } finally {
    await page.close().catch(() => {})
  }
}

const screenshot = async (target) => (await chromeScreenshot(target)) ?? captureScreenshot(target, env, { log: (m) => console.warn(`  ${m}`) })

let done = 0
const tally = { logo: 0, image: 0, screenshots: 0, failed: 0 }
const seen = new Set()

while (done < LIMIT) {
  const { data: rows, error } = await db.rpc('listings_needing_assets', { max_rows: Math.min(CONCURRENCY * 4, LIMIT - done) })
  if (error) {
    console.error('listings_needing_assets failed:', error.message)
    process.exitCode = 1
    break
  }
  const fresh = (rows ?? []).filter((r) => !seen.has(r.id))
  if (fresh.length === 0) break
  for (const r of fresh) seen.add(r.id)

  for (let i = 0; i < fresh.length; i += CONCURRENCY) {
    const chunk = fresh.slice(i, i + CONCURRENCY)
    await Promise.all(
      chunk.map(async (row) => {
        if (DRY_RUN) {
          console.log(`would process ${row.title} (${row.url}) logo=${Boolean(row.logo)} image=${Boolean(row.image)}`)
          return
        }
        try {
          const result = await completeListingAssets(db, row, { screenshot, log: () => {} })
          if (result.logo === 'added') tally.logo++
          if (result.image === 'added' || result.image === 'from-screenshot') tally.image++
          tally.screenshots += result.screenshots
          console.log(
            `${result.title} — logo:${result.logo} image:${result.image} shots:${result.screenshots}${result.provider ? ` (${result.provider})` : ''}${result.notes.length ? ` | ${result.notes.join('; ')}` : ''}`,
          )
        } catch (err) {
          tally.failed++
          console.error(`${row.title} — FAILED: ${err.message}`)
        }
      }),
    )
    done += chunk.length
  }
}

await browser.close()
console.log(`\nProcessed ${done}. Added logos: ${tally.logo}, images: ${tally.image}, screenshots: ${tally.screenshots}, failed: ${tally.failed}.`)
