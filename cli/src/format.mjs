// Output helpers. Human output is a plain aligned table; `--json` prints the
// server response untouched so scripts and agents get the real shape.

export function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function width(s) {
  return String(s ?? '').length
}

/**
 * Render rows as columns. `columns` is [{ key, label, max? }]; values longer
 * than `max` are cut with an ellipsis so one long description does not push
 * everything else off screen.
 */
export function table(rows, columns) {
  if (rows.length === 0) return ''
  const cells = rows.map((row) =>
    columns.map(({ key, max }) => {
      let v = typeof key === 'function' ? key(row) : row[key]
      if (Array.isArray(v)) v = v.join(', ')
      if (v === null || v === undefined) v = ''
      v = String(v).replace(/\s+/g, ' ')
      if (max && v.length > max) v = `${v.slice(0, max - 1)}…`
      return v
    }),
  )
  const widths = columns.map((c, i) => Math.max(width(c.label), ...cells.map((r) => width(r[i]))))
  const line = (cols) => cols.map((v, i) => (i === cols.length - 1 ? v : v.padEnd(widths[i]))).join('  ')
  const out = [line(columns.map((c) => c.label)), line(widths.map((w) => '-'.repeat(w)))]
  for (const row of cells) out.push(line(row))
  return `${out.join('\n')}\n`
}

export function date(iso) {
  if (!iso) return 'never'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toISOString().slice(0, 10)
}

export function listingSummary(l) {
  const lines = [
    `${l.name}  [${l.status ?? 'approved'}]`,
    `  id:          ${l.id}`,
    `  website:     ${l.website}`,
    `  category:    ${l.category ?? ''}`,
  ]
  if (l.tags?.length) lines.push(`  tags:        ${l.tags.join(', ')}`)
  if (l.use_cases?.length) lines.push(`  use cases:   ${l.use_cases.join(', ')}`)
  if (l.audiences?.length) lines.push(`  audiences:   ${l.audiences.join(', ')}`)
  if (l.platforms?.length) lines.push(`  platforms:   ${l.platforms.join(', ')}`)
  if (l.pricing_model) lines.push(`  pricing:     ${l.pricing_model}`)
  if (l.alternatives?.length) lines.push(`  alternative: ${l.alternatives.join(', ')}`)
  if (l.saasrow_url) lines.push(`  page:        ${l.saasrow_url}`)
  if (l.manage_url) lines.push(`  manage:      ${l.manage_url}`)
  if (l.expires_at) lines.push(`  expires:     ${date(l.expires_at)}`)
  lines.push(`  description: ${String(l.description ?? '').replace(/\s+/g, ' ')}`)
  return `${lines.join('\n')}\n`
}
