// A thin HTTP client over the SaaSRow API. Every error the server explains
// becomes an ApiClientError carrying the status and that explanation, so
// commands can print it verbatim instead of "request failed".

import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
export const VERSION = pkg.version

export class ApiClientError extends Error {
  constructor(status, message, body) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.body = body
  }
}

function extractMessage(body, status, statusText) {
  if (body && typeof body === 'object') {
    if (body.error && typeof body.error === 'object' && body.error.message) return body.error.message
    if (typeof body.error === 'string') return body.error
    if (typeof body.message === 'string') return body.message
  }
  return statusText ? `${status} ${statusText}` : `Request failed with status ${status}`
}

export function createClient({ baseUrl, apiKey = null, fetch = globalThis.fetch }) {
  async function request(method, path, { body, query, auth = true } = {}) {
    const url = new URL(path, `${baseUrl}/`)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
      }
    }
    const headers = {
      Accept: 'application/json',
      'User-Agent': `saasrow-cli/${VERSION} (+https://www.saasrow.com)`,
    }
    if (auth && apiKey) headers.Authorization = `Bearer ${apiKey}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    let res
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (err) {
      throw new ApiClientError(0, `Could not reach ${url.origin}: ${err.message}`)
    }

    const text = await res.text()
    let json = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = { error: text.slice(0, 200) }
      }
    }
    if (!res.ok) throw new ApiClientError(res.status, extractMessage(json, res.status, res.statusText), json)
    return json
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
    baseUrl,
    hasKey: Boolean(apiKey),
  }
}
