// Tiny argv parser: `--key value`, `--key=value`, boolean switches, and
// positionals. No dependency, no magic; every command declares nothing and
// reads what it needs from `flags`.

const BOOLEAN_FLAGS = new Set(['json', 'yes', 'help', 'version', 'all', 'revoke'])

const ALIASES = { y: 'yes', h: 'help', v: 'version' }

export function parseArgs(argv) {
  const positionals = []
  const flags = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }

    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      let key = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
      let value = eq === -1 ? undefined : arg.slice(eq + 1)

      if (key.startsWith('no-') && value === undefined) {
        flags[key.slice(3)] = false
        continue
      }
      if (value === undefined) {
        if (BOOLEAN_FLAGS.has(key)) {
          value = true
        } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          value = argv[++i]
        } else {
          value = true
        }
      }
      flags[key] = value
      continue
    }

    if (arg.startsWith('-') && arg.length > 1) {
      for (const ch of arg.slice(1)) {
        const key = ALIASES[ch] ?? ch
        flags[key] = true
      }
      continue
    }

    positionals.push(arg)
  }

  return { positionals, flags }
}

/** `--tags a,b,c` or repeated values → a clean string array; undefined stays undefined. */
export function listFlag(value) {
  if (value === undefined || value === true || value === false) return undefined
  const raw = Array.isArray(value) ? value : String(value).split(',')
  return raw.map((s) => s.trim()).filter(Boolean)
}
