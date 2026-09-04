import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, statSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  configPath,
  loadConfig,
  saveConfig,
  clearConfig,
  resolveApiKey,
  resolveApiUrl,
  DEFAULT_API_URL,
} from '../src/config.mjs'

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'saasrow-cli-'))
  return { dir, env: { SAASROW_HOME: dir }, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('config path honours the override ladder', () => {
  assert.equal(configPath({ SAASROW_CONFIG: '/x/y.json' }), '/x/y.json')
  assert.equal(configPath({ SAASROW_HOME: '/h' }), join('/h', 'config.json'))
  assert.equal(configPath({ PROFULLSTACK_HOME: '/p' }), join('/p', 'saasrow', 'config.json'))
  assert.match(configPath({}), /[\\/]\.profullstack[\\/]saasrow[\\/]config\.json$/)
})

test('save then load round-trips and the file is private', () => {
  const { dir, env, cleanup } = scratch()
  try {
    const path = saveConfig({ apiKey: 'sr_test', email: 'a@b.co' }, env)
    assert.equal(path, join(dir, 'config.json'))
    assert.deepEqual(loadConfig(env), { apiKey: 'sr_test', email: 'a@b.co' })
    if (process.platform !== 'win32') {
      assert.equal(statSync(path).mode & 0o777, 0o600)
    }
    clearConfig(env)
    assert.deepEqual(loadConfig(env), {})
  } finally {
    cleanup()
  }
})

test('a corrupt config file reads as empty rather than throwing', () => {
  const { dir, env, cleanup } = scratch()
  try {
    writeFileSync(join(dir, 'config.json'), '{not json')
    assert.deepEqual(loadConfig(env), {})
  } finally {
    cleanup()
  }
})

test('the environment key beats the stored key', () => {
  assert.equal(resolveApiKey({ SAASROW_API_KEY: 'sr_env' }, { apiKey: 'sr_file' }), 'sr_env')
  assert.equal(resolveApiKey({}, { apiKey: 'sr_file' }), 'sr_file')
  assert.equal(resolveApiKey({}, {}), null)
})

test('api url resolution: flag, env, config, default; trailing slash stripped', () => {
  assert.equal(resolveApiUrl({ 'api-url': 'http://a/' }, { SAASROW_API_URL: 'http://b' }, { apiUrl: 'http://c' }), 'http://a')
  assert.equal(resolveApiUrl({}, { SAASROW_API_URL: 'http://b/' }, { apiUrl: 'http://c' }), 'http://b')
  assert.equal(resolveApiUrl({}, {}, { apiUrl: 'http://c' }), 'http://c')
  assert.equal(resolveApiUrl({}, {}, {}), DEFAULT_API_URL)
})
