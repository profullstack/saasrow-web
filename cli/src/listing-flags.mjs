// Map `saasrow listings create/update` flags onto the API's listing body.
// Kept separate from the commands so it is trivially unit-tested.

import { readFileSync } from 'node:fs'
import { listFlag } from './args.mjs'

const STRING_FIELDS = [
  ['name', ['name', 'title']],
  ['website', ['website', 'url']],
  ['description', ['description']],
  ['category', ['category']],
  ['pricing_model', ['pricing-model', 'pricing_model']],
]

const LIST_FIELDS = [
  ['tags', ['tags', 'tag']],
  ['use_cases', ['use-cases', 'use-case', 'use_cases']],
  ['audiences', ['audiences', 'audience']],
  ['platforms', ['platforms', 'platform']],
  ['alternatives', ['alternatives', 'alternative-to', 'alternative']],
]

/**
 * Build the request body. `--from file.json` (or `--from -` for stdin) seeds
 * the body; explicit flags override individual fields on top of it.
 */
export function listingBodyFromFlags(flags, { readStdin } = {}) {
  let body = {}
  if (flags.from) {
    const text = flags.from === '-' ? (readStdin ? readStdin() : readFileSync(0, 'utf8')) : readFileSync(String(flags.from), 'utf8')
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('--from must point at a JSON object')
    }
    body = { ...parsed }
  }

  for (const [field, names] of STRING_FIELDS) {
    for (const n of names) {
      if (flags[n] !== undefined && flags[n] !== true) {
        body[field] = String(flags[n])
        break
      }
    }
  }
  for (const [field, names] of LIST_FIELDS) {
    for (const n of names) {
      const list = listFlag(flags[n])
      if (list !== undefined) {
        body[field] = list
        break
      }
    }
  }
  return body
}

export const LISTING_FLAG_HELP = `  --name <text>            product name (alias --title)
  --website <url>          product website (alias --url)
  --description <text>     what it does
  --category <text>        category name (default Software)
  --tags a,b,c             free-text tags, comma separated
  --use-cases a,b          controlled vocabulary (see: saasrow vocabulary)
  --audiences a,b          controlled vocabulary
  --platforms a,b          controlled vocabulary
  --pricing-model <term>   controlled vocabulary
  --alternatives a,b       products this one is an alternative to
  --from <file.json|->     read fields from a JSON object; flags override`
