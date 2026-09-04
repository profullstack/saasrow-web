'use client'

import { useCallback, useEffect, useState } from 'react'

// Key management for the listing management page. Talks to /api/v1/keys with
// the management token from the URL, which the server resolves to the same
// account an API key would. The plaintext of a new key is shown once, here,
// and never again.

interface ApiKey {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  active: boolean
}

interface Props {
  managementToken: string
}

async function keysRequest(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`/api/v1/keys${path}`, {
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
  if (!iso) return 'never'
  return new Date(iso).toLocaleDateString()
}

export function ApiKeysPanel({ managementToken }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [freshKey, setFreshKey] = useState<{ name: string; value: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showRevoked, setShowRevoked] = useState(false)

  const load = useCallback(async () => {
    try {
      const body = await keysRequest(managementToken, '')
      setKeys(body.data ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load API keys')
    } finally {
      setLoading(false)
    }
  }, [managementToken])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const body = await keysRequest(managementToken, '', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() || 'API key' }),
      })
      setFreshKey({ name: body.key.name, value: body.api_key })
      setCopied(false)
      setNewName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the key')
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (id: string) => {
    const name = renameValue.trim()
    if (!name) return
    try {
      await keysRequest(managementToken, `/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      setRenamingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the key')
    }
  }

  const handleRevoke = async (key: ApiKey) => {
    if (!window.confirm(`Revoke "${key.name}" (${key.prefix}…)? Anything using it stops working immediately.`)) {
      return
    }
    try {
      await keysRequest(managementToken, `/${key.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the key')
    }
  }

  const copyFreshKey = async () => {
    if (!freshKey) return
    try {
      await navigator.clipboard.writeText(freshKey.value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const visible = keys.filter((k) => showRevoked || k.active)
  const revokedCount = keys.filter((k) => !k.active).length

  return (
    <div className="bg-[#2a2a2a] rounded-2xl border border-white/10 p-4 sm:p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4 mb-4">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white mb-2 font-ubuntu">API keys</h2>
          <p className="text-white/70 font-ubuntu text-sm sm:text-base">
            Manage your listings from the terminal, a script, or an AI agent over MCP. A key
            can do everything this page can for your listings, so treat it like a password.
          </p>
          <p className="text-white/50 font-ubuntu text-sm mt-2">
            Terminal:{' '}
            <code className="text-[#4FFFE3] font-mono">npx @profullstack/saasrow login</code>
            {' · '}
            <a href="/api/v1" className="text-[#4FFFE3] hover:underline">
              API reference
            </a>
            {' · '}
            <a href="/api/mcp" className="text-[#4FFFE3] hover:underline">
              MCP server
            </a>
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 font-ubuntu text-sm">
          {error}
        </div>
      )}

      {freshKey && (
        <div className="mb-4 p-4 rounded-lg bg-[#1a1a1a] border border-[#E0FF04]/40">
          <p className="text-[#E0FF04] font-ubuntu font-bold mb-1">
            New key &ldquo;{freshKey.name}&rdquo; — copy it now
          </p>
          <p className="text-white/60 font-ubuntu text-sm mb-3">
            This is the only time the full key is shown. If you lose it, revoke it and create
            another.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 bg-neutral-900 text-[#4FFFE3] font-mono text-sm rounded-lg p-3 break-all select-all">
              {freshKey.value}
            </code>
            <button
              type="button"
              onClick={copyFreshKey}
              className="px-4 py-2 rounded-full bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold hover:bg-[#4FFFE3]/30 transition-colors text-sm"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => setFreshKey(null)}
              className="px-4 py-2 rounded-full text-white/60 border border-white/20 font-ubuntu hover:text-white transition-colors text-sm"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Key name, e.g. laptop CLI"
          maxLength={80}
          className="flex-1 bg-[#1a1a1a] text-white font-ubuntu rounded-lg px-4 py-2 border border-white/10 focus:border-[#4FFFE3] focus:outline-none"
        />
        <button
          type="submit"
          disabled={creating}
          className="px-6 py-2 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
        >
          {creating ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {loading ? (
        <p className="text-white/50 font-ubuntu text-sm">Loading keys…</p>
      ) : visible.length === 0 ? (
        <p className="text-white/50 font-ubuntu text-sm">No active API keys yet.</p>
      ) : (
        <ul className="divide-y divide-white/10">
          {visible.map((key) => (
            <li key={key.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                {renamingId === key.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleRename(key.id)
                    }}
                    className="flex gap-2"
                  >
                    <input
                      autoFocus
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      maxLength={80}
                      className="flex-1 bg-[#1a1a1a] text-white font-ubuntu rounded-lg px-3 py-1 border border-white/10 focus:border-[#4FFFE3] focus:outline-none text-sm"
                    />
                    <button type="submit" className="text-[#4FFFE3] font-ubuntu text-sm font-bold">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="text-white/50 font-ubuntu text-sm"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <p className="text-white font-ubuntu font-bold truncate">
                    {key.name}
                    {!key.active && (
                      <span className="ml-2 text-xs font-normal text-red-300">revoked</span>
                    )}
                  </p>
                )}
                <p className="text-white/50 font-ubuntu text-xs font-mono">
                  {key.prefix}… · created {when(key.created_at)} · last used {when(key.last_used_at)}
                </p>
              </div>
              {key.active && renamingId !== key.id && (
                <div className="flex gap-3 text-sm font-ubuntu">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(key.id)
                      setRenameValue(key.name)
                    }}
                    className="text-[#4FFFE3] hover:underline"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevoke(key)}
                    className="text-red-300 hover:underline"
                  >
                    Revoke
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {revokedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowRevoked((v) => !v)}
          className="mt-3 text-white/40 hover:text-white/70 font-ubuntu text-xs"
        >
          {showRevoked ? 'Hide' : 'Show'} {revokedCount} revoked {revokedCount === 1 ? 'key' : 'keys'}
        </button>
      )}
    </div>
  )
}
