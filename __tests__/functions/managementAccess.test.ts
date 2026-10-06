import { describe, it, expect } from 'vitest'
import {
  exactIlike,
  listingIdsForEmail,
  managementUrlFor,
  normalizeEmail,
  resolveManagementAccess,
} from '../../supabase/functions/_shared/managementAccess'

type Row = Record<string, any>

// Just enough of the supabase-js builder for managementAccess.ts.
function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0
  const ilikeMatch = (value: unknown, pattern: string) => {
    const re = new RegExp(
      '^' + pattern.replace(/\\([\\%_])|([%_])|([.*+?^${}()|[\]])/g, (_m, esc, wild, meta) =>
        esc ? `\\${esc}` : wild ? (wild === '%' ? '.*' : '.') : `\\${meta}`
      ) + '$',
      'i'
    )
    return typeof value === 'string' && re.test(value)
  }

  return {
    tables,
    from(table: string) {
      const rows = (tables[table] ??= [])
      const filters: ((r: Row) => boolean)[] = []
      let op: 'select' | 'update' | 'insert' = 'select'
      let patch: Row = {}
      let inserted: Row | null = null
      let order: { col: string; asc: boolean } | null = null
      let limit = Infinity

      const run = () => {
        if (op === 'insert') return { data: inserted, error: null }
        const hit = rows.filter((r) => filters.every((f) => f(r)))
        if (op === 'update') {
          hit.forEach((r) => Object.assign(r, patch))
          return { data: hit, error: null }
        }
        let out = [...hit]
        if (order) {
          const { col, asc } = order
          out.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1))
        }
        return { data: out.slice(0, limit), error: null }
      }

      const q: any = {
        select: () => q,
        insert: (row: Row) => {
          op = 'insert'
          inserted = { id: `gen-${++seq}`, created_at: new Date(seq).toISOString(), ...row }
          rows.push(inserted)
          return q
        },
        update: (p: Row) => {
          op = 'update'
          patch = p
          return q
        },
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        ilike: (c: string, p: string) => (filters.push((r) => ilikeMatch(r[c], p)), q),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
        is: (c: string, v: null) => (filters.push((r) => (r[c] ?? null) === v), q),
        not: (c: string, _op: 'is', v: null) => (filters.push((r) => (r[c] ?? null) !== v), q),
        order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), q),
        limit: (n: number) => ((limit = n), q),
        single: () => Promise.resolve(run()),
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      }
      return q
    },
  }
}

describe('normalizeEmail', () => {
  it('trims and lower-cases, rejects junk', () => {
    expect(normalizeEmail('  SubmitDirs2024@Gmail.com ')).toBe('submitdirs2024@gmail.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })

  it('escapes ILIKE wildcards so an address only matches itself', () => {
    expect(exactIlike('a_b%c@x.io')).toBe('a\\_b\\%c@x.io')
  })
})

describe('resolveManagementAccess', () => {
  it('finds website listings that have no user_id (the 2026-10-06 sign-in 404)', async () => {
    const db = fakeDb({
      users: [{ id: 'u1', email: 'dev@example.com', created_at: '2026-10-01' }],
      software_submissions: [
        { id: 's1', user_id: null, management_token: 'old', created_at: '2026-10-01' },
        { id: 's2', user_id: null, management_token: 'new', created_at: '2026-10-02' },
        { id: 's3', user_id: null, management_token: 'other', created_at: '2026-10-03' },
      ],
      submission_contacts: [
        { submission_id: 's1', email: 'dev@example.com' },
        { submission_id: 's2', email: 'Dev@Example.com' },
        { submission_id: 's3', email: 'someone@else.com' },
      ],
      user_tokens: [],
    })

    const access = await resolveManagementAccess(db, 'dev@example.com')

    expect(access).toEqual({ kind: 'listing', token: 'new', userId: 'u1' })
    const owners = Object.fromEntries(db.tables.software_submissions.map((s) => [s.id, s.user_id]))
    expect(owners).toEqual({ s1: 'u1', s2: 'u1', s3: null })
  })

  it('gives a premium subscriber their user token and links it to the account', async () => {
    const db = fakeDb({
      users: [{ id: 'u1', email: 'submitdirs2024@gmail.com', created_at: '2026-10-06' }],
      software_submissions: [{ id: 's1', user_id: null, management_token: 'm1', created_at: '2026-10-06' }],
      submission_contacts: [{ submission_id: 's1', email: 'submitdirs2024@gmail.com' }],
      user_tokens: [{ id: 't1', email: 'submitdirs2024@gmail.com', token: 'ab/c+d=', user_id: null, tier: 'premium', created_at: '2026-10-06' }],
    })

    const access = await resolveManagementAccess(db, 'submitdirs2024@gmail.com')

    expect(access).toEqual({ kind: 'subscriber', token: 'ab/c+d=', userId: 'u1' })
    expect(db.tables.user_tokens[0].user_id).toBe('u1')
    expect(db.tables.software_submissions[0].user_id).toBe('u1')
  })

  it('lets a subscriber with no listings in', async () => {
    const db = fakeDb({
      users: [],
      software_submissions: [],
      submission_contacts: [],
      user_tokens: [{ id: 't1', email: 'payer@example.com', token: 'tok', user_id: null, created_at: '2026-10-06' }],
    })

    const access = await resolveManagementAccess(db, 'payer@example.com')

    expect(access.kind).toBe('subscriber')
    expect(db.tables.users).toHaveLength(1)
    expect(db.tables.user_tokens[0].user_id).toBe(access.userId)
  })

  it('never steals a listing another account already owns', async () => {
    const db = fakeDb({
      users: [{ id: 'u2', email: 'late@example.com', created_at: '2026-10-01' }],
      software_submissions: [{ id: 's1', user_id: 'u9', management_token: 'm1', created_at: '2026-10-01' }],
      submission_contacts: [{ submission_id: 's1', email: 'late@example.com' }],
      user_tokens: [],
    })

    const access = await resolveManagementAccess(db, 'late@example.com')

    expect(access).toEqual({ kind: 'none', userId: 'u2' })
    expect(db.tables.software_submissions[0].user_id).toBe('u9')
  })
})

describe('listingIdsForEmail', () => {
  it('collects listings by contact email and by owning user, case-insensitively', async () => {
    const db = fakeDb({
      users: [{ id: 'u1', email: 'dev@example.com' }],
      software_submissions: [
        { id: 's1', user_id: null },
        { id: 's2', user_id: 'u1' },
        { id: 's3', user_id: 'u7' },
      ],
      submission_contacts: [{ submission_id: 's1', email: 'DEV@example.com' }],
    })

    expect((await listingIdsForEmail(db, 'dev@example.com')).sort()).toEqual(['s1', 's2'])
    expect(await listingIdsForEmail(db, 'nobody@example.com')).toEqual([])
  })
})

describe('managementUrlFor', () => {
  it('keeps a base64 user token in one path segment', () => {
    expect(managementUrlFor('https://saasrow.com/', 'Jm8g/e0V+A=')).toBe('https://saasrow.com/manage/Jm8g%2Fe0V%2BA%3D')
  })
})
