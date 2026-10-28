import { createClient } from '@supabase/supabase-js'
import { Webhooks, type WebhooksOptions, type WebhookStore } from '@profullstack/webhooks'
import { supabaseStore, type SupabaseLike } from './supabase-store'
import { WEBHOOK_EVENT_TYPES } from './events'

/**
 * Customer webhooks for SaaSRow, on @profullstack/webhooks.
 *
 * A listing owner registers HTTPS endpoints and SaaSRow POSTs signed
 * CloudEvents (Standard Webhooks headers) to them. Endpoints and a durable
 * delivery outbox live in Supabase (hub_webhook_* tables); the drainer started
 * once at server boot (instrumentation.ts) sends with retries and backoff.
 *
 * The events themselves are written by Postgres triggers into
 * hub_webhook_events (see the 20261028160000_webhooks_hub migration), because
 * most of them happen outside this app: approvals and anonymous votes in edge
 * functions, karma in SQL. pumpEvents() turns each row into hooks.emit().
 *
 * No webhooks existed before this, so there is no legacy signature to keep.
 */

export { WEBHOOK_EVENT_TYPES, WEBHOOK_EVENT_HELP, type WebhookEventType } from './events'

export const WEBHOOK_SOURCE = 'https://saasrow.com'

export function createHooks(store: WebhookStore, options: Partial<WebhooksOptions> = {}): Webhooks {
  return new Webhooks({
    store,
    source: WEBHOOK_SOURCE,
    eventTypes: [...WEBHOOK_EVENT_TYPES],
    maxEndpoints: 10,
    guard: process.env.NODE_ENV === 'production' ? {} : { allowHttp: true },
    log: (m) => console.warn(`[webhooks] ${m}`),
    ...options,
  })
}

/** The supabase-js service client, built here rather than via supabaseAdmin so boot code can load it. */
export function serviceClient(): SupabaseLike {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service env not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as SupabaseLike
}

const KEY = Symbol.for('saasrow.webhooks.hub')
type HubState = { hooks: Webhooks; client: SupabaseLike; pump?: ReturnType<typeof setInterval> }
type HubGlobal = typeof globalThis & { [KEY]?: HubState }

/**
 * The process-wide hub. Kept on globalThis because Next bundles route handlers
 * and instrumentation separately: a module-level singleton would give each its
 * own instance, and only the one that called start() would drain.
 */
function state(): HubState {
  const g = globalThis as HubGlobal
  if (!g[KEY]) {
    const client = serviceClient()
    g[KEY] = { client, hooks: createHooks(supabaseStore(client)) }
  }
  return g[KEY]!
}

export function getHooks(): Webhooks {
  return state().hooks
}

export const EVENTS_TABLE = 'hub_webhook_events'
export const CLAIM_EVENTS_RPC = 'claim_hub_webhook_events'

interface OutboxRow {
  id: number | string
  owner: string
  type: string
  subject: string | null
  data: unknown
}

/**
 * Move up to `limit` outbox rows into the hub: emit each (which queues one
 * delivery per subscribed endpoint) and delete it. The CloudEvent id comes
 * from the row id, so a row emitted twice after a crash carries the same
 * webhook-id and receivers can drop the repeat. Returns how many rows it took.
 */
export async function pumpEvents(hooks: Webhooks, client: SupabaseLike, limit = 100): Promise<number> {
  const { data, error } = await client.rpc(CLAIM_EVENTS_RPC, { p_limit: limit })
  if (error) throw new Error(`webhooks outbox: claim: ${error.message}`)
  const rows = (data ?? []) as unknown as OutboxRow[]
  const done: Array<number | string> = []
  for (const row of rows) {
    try {
      await hooks.emit(row.owner, row.type, row.data ?? {}, {
        ...(row.subject ? { subject: row.subject } : {}),
        id: `evt_saasrow_${row.id}`,
      })
      done.push(row.id)
    } catch (err) {
      // Left claimed; the lease runs out and the next pump tries again.
      console.warn(`[webhooks] outbox event ${row.id} (${row.type}) not emitted: ${(err as Error).message}`)
    }
  }
  if (done.length) {
    const del = await client.from(EVENTS_TABLE).delete().in('id', done)
    if (del?.error) throw new Error(`webhooks outbox: delete: ${del.error.message}`)
  }
  return rows.length
}

/** Start the delivery drainer and the outbox pump, once per server process. */
export function startWebhooks(intervalMs = 5000): void {
  const s = state()
  if (s.pump) return
  s.hooks.start()
  let running = false
  s.pump = setInterval(async () => {
    if (running) return
    running = true
    try {
      // Keep going while full pages come back, so a burst drains in one tick.
      while ((await pumpEvents(s.hooks, s.client)) === 100) {}
    } catch (err) {
      console.warn(`[webhooks] outbox pump: ${(err as Error).message}`)
    } finally {
      running = false
    }
  }, intervalMs)
  s.pump.unref?.()
}
