import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, listFlag } from '../src/args.mjs'

test('splits positionals from --key value flags', () => {
  const { positionals, flags } = parseArgs(['listings', 'create', '--name', 'Acme', '--website', 'https://acme.example'])
  assert.deepEqual(positionals, ['listings', 'create'])
  assert.equal(flags.name, 'Acme')
  assert.equal(flags.website, 'https://acme.example')
})

test('accepts --key=value', () => {
  assert.equal(parseArgs(['--limit=5']).flags.limit, '5')
})

test('known boolean flags never swallow the next token', () => {
  const { positionals, flags } = parseArgs(['keys', 'revoke', '--yes', 'abc', '--json'])
  assert.deepEqual(positionals, ['keys', 'revoke', 'abc'])
  assert.equal(flags.yes, true)
  assert.equal(flags.json, true)
})

test('a trailing unknown flag with no value is true', () => {
  assert.equal(parseArgs(['search', '--dry']).flags.dry, true)
})

test('short aliases expand', () => {
  assert.equal(parseArgs(['-h']).flags.help, true)
  assert.equal(parseArgs(['-v']).flags.version, true)
  assert.equal(parseArgs(['-y']).flags.yes, true)
})

test('--no-x sets false', () => {
  assert.equal(parseArgs(['--no-json']).flags.json, false)
})

test('everything after -- is positional', () => {
  assert.deepEqual(parseArgs(['search', '--', '--weird']).positionals, ['search', '--weird'])
})

test('listFlag splits comma lists and drops blanks', () => {
  assert.deepEqual(listFlag('a, b,,c'), ['a', 'b', 'c'])
  assert.equal(listFlag(undefined), undefined)
  assert.equal(listFlag(true), undefined)
})
