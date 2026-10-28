'use client'

import { useCallback, useEffect, useState } from 'react'
import { WEBHOOK_EVENT_HELP } from '@/lib/webhooks/events'

// Webhook endpoints for the listing management page. Talks to /api/v1/webhooks
// with the management token from the URL, which the server resolves to the
// same account an API key would. A signing secret is shown once, when it is
// created or rotated, and on request after that.

interface Endpoint {
  id: string
  url: string
  events: string[]
  description: string
  enabled: boolean
  failures: number
  disabled_reason: string | null
  created_at: string
}

interface Delivery {
  id: string
  endpoint_id: string
  event_type: string
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  last_status: number | null
  last_error: string | null
  created_at: string
}

async function hooksRequest(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`/api/v1/webhooks${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Management-Token': token,
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error?.message || body?.error || `Request failed (${res.status})`)
  }
  return body
}

function when(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString()
}

export function WebhooksPanel({ managementToken }: { managementToken: string }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [eventTypes, setEventTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<{ id: string; value: string; label: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [log, setLog] = useState<{ id: string; rows: Delivery[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const body = await hooksRequest(managementToken, '')
      setEndpoints(body.endpoints ?? [])
      setEventTypes(body.event_types ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load webhooks')
    } finally {
      setLoading(false)
    }
  }, [managementToken])

  useEffect(() => {
    load()
  }, [load])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const showSecret = (id: string, value: string, label: string) => {
    setSecret({ id, value, label })
    setCopied(false)
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    run('create', async () => {
      const body = await hooksRequest(managementToken, '', {
        method: 'POST',
        body: JSON.stringify({
          url: url.trim(),
          events: picked.length ? picked : ['*'],
          description: description.trim(),
        }),
      })
      showSecret(body.endpoint.id, body.secret, `Signing secret for ${body.endpoint.url}`)
      setUrl('')
      setDescription('')
      setPicked([])
      await load()
    }).finally(() => setCreating(false))
  }

  const test = (ep: Endpoint) =>
    run(`test:${ep.id}`, async () => {
      const r = await hooksRequest(managementToken, `/${ep.id}/test`, { method: 'POST' })
      setNotice(
        r.ok
          ? `Test delivered to ${ep.url} (HTTP ${r.status}).`
          : `Test to ${ep.url} failed: ${r.error ?? `HTTP ${r.status}`}.`,
      )
      if (log?.id === ep.id) await openLog(ep.id)
    })

  const rotate = (ep: Endpoint) => {
    if (!window.confirm(`Replace the signing secret for ${ep.url}? The old one stops verifying immediately.`)) return
    run(`rotate:${ep.id}`, async () => {
      const r = await hooksRequest(managementToken, `/${ep.id}/rotate`, { method: 'POST' })
      showSecret(ep.id, r.secret, `New signing secret for ${ep.url}`)
    })
  }

  const reveal = (ep: Endpoint) =>
    run(`secret:${ep.id}`, async () => {
      const r = await hooksRequest(managementToken, `/${ep.id}/secret`)
      showSecret(ep.id, r.secret, `Signing secret for ${ep.url}`)
    })

  const toggle = (ep: Endpoint) =>
    run(`toggle:${ep.id}`, async () => {
      await hooksRequest(managementToken, `/${ep.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !ep.enabled }),
      })
      await load()
    })

  const remove = (ep: Endpoint) => {
    if (!window.confirm(`Remove the webhook to ${ep.url}? Its delivery log goes with it.`)) return
    run(`remove:${ep.id}`, async () => {
      await hooksRequest(managementToken, `/${ep.id}`, { method: 'DELETE' })
      if (secret?.id === ep.id) setSecret(null)
      if (log?.id === ep.id) setLog(null)
      await load()
    })
  }

  const openLog = async (id: string) => {
    const r = await hooksRequest(managementToken, `/${id}/deliveries?limit=20`)
    setLog({ id, rows: r.deliveries ?? [] })
  }

  const retry = (d: Delivery) =>
    run(`retry:${d.id}`, async () => {
      await hooksRequest(managementToken, `/deliveries/${d.id}/retry`, { method: 'POST' })
      setNotice('Queued to send again.')
      await openLog(d.endpoint_id)
    })

  const copySecret = async () => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret.value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const togglePick = (t: string) =>
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))

  const link = 'text-[#4FFFE3] hover:underline disabled:opacity-50'

  return (
    <div id="webhooks" className="bg-[#2a2a2a] rounded-2xl border border-white/10 p-4 sm:p-6 mb-6">
      <h2 className="text-xl font-bold text-white mb-2 font-ubuntu">Webhooks</h2>
      <p className="text-white/70 font-ubuntu text-sm sm:text-base">
        SaaSRow POSTs a signed JSON event to your URL when your listings are approved, featured,
        upvoted or commented on, or your karma changes. Bodies are CloudEvents; verify the{' '}
        <code className="text-[#4FFFE3] font-mono text-xs">webhook-signature</code> header with the
        signing secret (Standard Webhooks, e.g.{' '}
        <code className="text-[#4FFFE3] font-mono text-xs">@profullstack/webhooks</code>). Failed
        deliveries are retried for about three days.
      </p>
      <p className="text-white/50 font-ubuntu text-sm mt-2 mb-4">
        Also from the terminal (<code className="text-[#4FFFE3] font-mono">saasrow webhooks</code>),
        the <a href="/api/v1" className="text-[#4FFFE3] hover:underline">API</a> and the{' '}
        <a href="/api/mcp" className="text-[#4FFFE3] hover:underline">MCP server</a>.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 font-ubuntu text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 p-3 rounded-lg bg-[#4FFFE3]/10 border border-[#4FFFE3]/30 text-[#4FFFE3] font-ubuntu text-sm">
          {notice}
        </div>
      )}

      {secret && (
        <div className="mb-4 p-4 rounded-lg bg-[#1a1a1a] border border-[#E0FF04]/40">
          <p className="text-[#E0FF04] font-ubuntu font-bold mb-1">{secret.label}</p>
          <p className="text-white/60 font-ubuntu text-sm mb-3">
            Keep it on your server only. Anyone with it can forge events to your URL.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 bg-neutral-900 text-[#4FFFE3] font-mono text-sm rounded-lg p-3 break-all select-all">
              {secret.value}
            </code>
            <button
              type="button"
              onClick={copySecret}
              className="px-4 py-2 rounded-full bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold hover:bg-[#4FFFE3]/30 transition-colors text-sm"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => setSecret(null)}
              className="px-4 py-2 rounded-full text-white/60 border border-white/20 font-ubuntu hover:text-white transition-colors text-sm"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.example.com/hooks/saasrow"
            className="flex-1 min-w-0 bg-[#1a1a1a] text-white font-ubuntu rounded-lg px-4 py-2 border border-white/10 focus:border-[#4FFFE3] focus:outline-none"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Note (optional)"
            maxLength={200}
            className="sm:w-48 bg-[#1a1a1a] text-white font-ubuntu rounded-lg px-4 py-2 border border-white/10 focus:border-[#4FFFE3] focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating}
            className="px-6 py-2 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
          >
            {creating ? 'Adding…' : 'Add webhook'}
          </button>
        </div>
        {eventTypes.length > 0 && (
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-ubuntu text-white/70">
            <legend className="text-white/50 text-xs mb-1">Events (none ticked = all of them)</legend>
            {eventTypes.map((t) => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={picked.includes(t)} onChange={() => togglePick(t)} />
                <span className="font-mono text-xs text-white">{t}</span>
                {t in WEBHOOK_EVENT_HELP && (
                  <span className="text-white/40 text-xs">{WEBHOOK_EVENT_HELP[t as keyof typeof WEBHOOK_EVENT_HELP]}</span>
                )}
              </label>
            ))}
          </fieldset>
        )}
      </form>

      {loading ? (
        <p className="text-white/50 font-ubuntu text-sm">Loading webhooks…</p>
      ) : endpoints.length === 0 ? (
        <p className="text-white/50 font-ubuntu text-sm">No webhooks yet.</p>
      ) : (
        <ul className="divide-y divide-white/10">
          {endpoints.map((ep) => (
            <li key={ep.id} className="py-3">
              <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-ubuntu font-bold break-all">
                    {ep.url}
                    {!ep.enabled && (
                      <span className="ml-2 text-xs font-normal text-red-300">
                        off{ep.disabled_reason ? ` (${ep.disabled_reason})` : ''}
                      </span>
                    )}
                  </p>
                  <p className="text-white/50 font-ubuntu text-xs font-mono break-all">
                    {ep.id} · {ep.events.join(', ')}
                    {ep.description ? ` · ${ep.description}` : ''}
                    {ep.failures > 0 ? ` · ${ep.failures} failures in a row` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-sm font-ubuntu">
                  <button type="button" disabled={busy !== null} onClick={() => test(ep)} className={link}>
                    {busy === `test:${ep.id}` ? 'Sending…' : 'Test'}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(`log:${ep.id}`, () => (log?.id === ep.id ? (setLog(null), Promise.resolve()) : openLog(ep.id)))}
                    className={link}
                  >
                    {log?.id === ep.id ? 'Hide log' : 'Log'}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => reveal(ep)} className={link}>
                    Secret
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => rotate(ep)} className={link}>
                    Rotate
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => toggle(ep)} className={link}>
                    {ep.enabled ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => remove(ep)}
                    className="text-red-300 hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {log?.id === ep.id && (
                <div className="mt-3 overflow-x-auto">
                  {log.rows.length === 0 ? (
                    <p className="text-white/40 font-ubuntu text-xs">No deliveries yet.</p>
                  ) : (
                    <table className="w-full text-xs font-mono text-white/70">
                      <tbody>
                        {log.rows.map((d) => (
                          <tr key={d.id} className="border-t border-white/5">
                            <td className="py-1 pr-3 whitespace-nowrap">{when(d.created_at)}</td>
                            <td className="py-1 pr-3">{d.event_type}</td>
                            <td
                              className={`py-1 pr-3 ${d.status === 'delivered' ? 'text-[#4FFFE3]' : d.status === 'failed' ? 'text-red-300' : ''}`}
                            >
                              {d.status}
                              {d.last_status ? ` ${d.last_status}` : ''}
                            </td>
                            <td className="py-1 pr-3">×{d.attempts}</td>
                            <td className="py-1 pr-3 break-all">{d.last_error ?? ''}</td>
                            <td className="py-1">
                              {d.status !== 'pending' && (
                                <button type="button" disabled={busy !== null} onClick={() => retry(d)} className={link}>
                                  Retry
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
