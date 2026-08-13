import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { USE_CASES, AUDIENCES, PLATFORMS, PRICING_MODELS } from '@/lib/vocab'

// The edge function cannot import from the Next.js source tree, so
// supabase/functions/_shared/vocab.ts carries a second copy of the term lists.
// This test is the thing that stops those copies drifting apart: it parses the
// Deno file as text and compares every list against the canonical one.
//
// Reading the file rather than importing it matters -- the edge module is
// written for Deno and pulled in by a `.ts` specifier that Vite will not
// resolve.

const EDGE_VOCAB_PATH = resolve(
  process.cwd(),
  'supabase/functions/_shared/vocab.ts',
)

function parseStringArray(source: string, name: string): string[] {
  const match = source.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`))
  if (!match) throw new Error(`Could not find "export const ${name}" in the edge vocab`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('vocabulary parity between the app and the edge function', () => {
  const source = readFileSync(EDGE_VOCAB_PATH, 'utf8')

  const cases: Array<[string, readonly string[]]> = [
    ['USE_CASES', USE_CASES],
    ['AUDIENCES', AUDIENCES],
    ['PLATFORMS', PLATFORMS],
    ['PRICING_MODELS', PRICING_MODELS],
  ]

  for (const [name, canonical] of cases) {
    it(`${name} matches src/lib/vocab.ts exactly`, () => {
      expect(parseStringArray(source, name)).toEqual([...canonical])
    })
  }

  it('the parser actually finds terms (guards against a silently-passing regex)', () => {
    expect(parseStringArray(source, 'USE_CASES').length).toBeGreaterThan(5)
  })
})
