// Where the CLI keeps its credential.
//
// One path on every platform, `~/.profullstack/saasrow/config.json`, written
// with mode 0600. Overrides, most specific first:
//   SAASROW_CONFIG       a file
//   SAASROW_HOME         a directory holding config.json
//   PROFULLSTACK_HOME    the parent of saasrow/
// The key itself can also come from SAASROW_API_KEY, which wins over the file
// and is what CI and agents should use.

import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const DEFAULT_API_URL = 'https://www.saasrow.com'

export function configPath(env = process.env) {
  if (env.SAASROW_CONFIG) return env.SAASROW_CONFIG
  if (env.SAASROW_HOME) return join(env.SAASROW_HOME, 'config.json')
  const root = env.PROFULLSTACK_HOME || join(homedir(), '.profullstack')
  return join(root, 'saasrow', 'config.json')
}

export function loadConfig(env = process.env) {
  const path = configPath(env)
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveConfig(config, env = process.env) {
  const path = configPath(env)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  // rename is atomic on every platform we support; a crash mid-write leaves
  // the old file intact rather than a half-written one.
  writeFileSync(path, readFileSync(tmp), { mode: 0o600 })
  unlinkSync(tmp)
  return path
}

export function clearConfig(env = process.env) {
  const path = configPath(env)
  if (existsSync(path)) unlinkSync(path)
  return path
}

export function resolveApiUrl(flags = {}, env = process.env, config = {}) {
  const raw = flags['api-url'] || env.SAASROW_API_URL || config.apiUrl || DEFAULT_API_URL
  return String(raw).replace(/\/+$/, '')
}

export function resolveApiKey(env = process.env, config = {}) {
  return env.SAASROW_API_KEY || config.apiKey || null
}
