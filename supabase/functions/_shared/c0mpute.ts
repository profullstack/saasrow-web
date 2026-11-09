// c0mpute (https://c0mpute.com): the peer network that goes first in every AI
// provider chain in these functions, through @profullstack/ai-providers. The
// existing vendor calls (OpenAI, Gemini) stay behind it as the paid tier.
//
// C0MPUTE_API_KEY is an Infernet account key; without one the network's small
// free tier answers. C0MPUTE_DISABLED=1 skips it.
import { createAiProviders, extractJson } from 'npm:@profullstack/ai-providers@0.2.0'

/**
 * The self-hosted edge runtime stops a worker after about 60 s of wall clock,
 * so c0mpute gets most of that and leaves room for one vendor attempt. Peer
 * nodes write about two tokens a second, so long outputs may not finish here.
 */
export const C0MPUTE_EDGE_TIMEOUT_MS = Number(Deno.env.get('C0MPUTE_TIMEOUT_MS')) || 40_000

export interface C0mputeAsk {
  system?: string
  user: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  feature?: string
  fetch?: typeof fetch
}

/** True unless C0MPUTE_DISABLED is set, so key gates can count it. */
export function c0mputeEnabled(): boolean {
  return !/^(1|true|yes|on)$/i.test(Deno.env.get('C0MPUTE_DISABLED') ?? '')
}

/** Ask c0mpute for a JSON answer; returns the raw text. Throws on any failure. */
export async function askC0mpute(req: C0mputeAsk): Promise<string> {
  const [provider] = createAiProviders({
    env: Deno.env.toObject(),
    paidFallback: false,
    ...(req.fetch ? { c0mpute: { fetch: req.fetch } } : {}),
  }).primary
  if (!provider) throw new Error('c0mpute is disabled')
  const { text } = await provider.generate({
    system: req.system,
    user: req.user,
    maxTokens: req.maxTokens ?? 1024,
    temperature: req.temperature,
    timeoutMs: req.timeoutMs ?? C0MPUTE_EDGE_TIMEOUT_MS,
    json: true,
    feature: req.feature,
  })
  if (!text.trim()) throw new Error('c0mpute returned no text')
  return text
}

/** The JSON object in a model's answer, fenced or not, re-serialized. */
export function jsonText(raw: string): string {
  return JSON.stringify(extractJson(raw))
}

// ---------------------------------------------------------------------------
// Async jobs. A ~500-token answer from a 9B peer model takes minutes, longer
// than one edge request (60-180 s worker clock, 150 s gateway). So a slow
// caller starts a job, returns its id, and polls: each poll reconnects to the
// job stream, which replays every persisted event, and reads for a few seconds.

const c0mputeUrl = () => (Deno.env.get('C0MPUTE_URL') || 'https://infernetprotocol.com').replace(/\/+$/, '')
const HOUSE_MODELS = ['huihui_ai/qwen3.5-abliterated:9b', 'qwen2.5:7b', 'huihui_ai/qwen3.5-abliterated:4b']

function c0mputeHeaders(): Record<string, string> {
  const key = Deno.env.get('C0MPUTE_API_KEY')
  return key ? { authorization: `Bearer ${key}` } : {}
}

/** Queue a chat job on the first house model a live node serves. Returns the job id. */
export async function startC0mputeJob(req: {
  system?: string
  user: string
  maxTokens?: number
  temperature?: number
}): Promise<string> {
  const configured = (Deno.env.get('C0MPUTE_MODELS') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const messages = [...(req.system ? [{ role: 'system', content: req.system }] : []), { role: 'user', content: req.user }]
  let last = 'no model configured'
  let downRetries = 6 // Infernet redeploys often; its nginx serves an HTML 503 for ~30 s meanwhile
  const models = configured.length ? configured : HOUSE_MODELS
  for (let i = 0; i < models.length; i++) {
    const modelName = models[i]
    const res = await fetch(`${c0mputeUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...c0mputeHeaders() },
      body: JSON.stringify({ messages, maxTokens: req.maxTokens ?? 1024, temperature: req.temperature ?? 0.4, modelName }),
      signal: AbortSignal.timeout(20_000),
    })
    const isJson = (res.headers.get('content-type') ?? '').includes('json')
    if (res.status >= 500 && !isJson && downRetries-- > 0) {
      await res.body?.cancel()
      await new Promise((r) => setTimeout(r, 5_000))
      i-- // same model again
      continue
    }
    const job = isJson ? await res.json().catch(() => ({})) : (await res.body?.cancel(), {})
    if (res.ok && job.jobId) return String(job.jobId)
    last = `${modelName}: ${job.error ?? `HTTP ${res.status}`}`
    if (res.status !== 503) break // 503 = no live node for this model: try the next one
  }
  throw new Error(`c0mpute: ${last}`)
}

export type C0mputePoll =
  | { state: 'done'; text: string }
  | { state: 'pending'; tokens: number }
  | { state: 'failed'; error: string }

/** Read a job's stream for up to `waitMs`: done, still writing, or failed. */
export async function pollC0mputeJob(jobId: string, waitMs = 20_000, replay = false): Promise<C0mputePoll> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { state: 'failed', error: 'bad job id' }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), waitMs)
  let text = ''
  let tokens = 0
  try {
    const res = await fetch(`${c0mputeUrl()}/api/chat/stream/${jobId}`, {
      headers: { accept: 'text/event-stream', ...c0mputeHeaders() },
      signal: ctl.signal,
    })
    // 5xx = Infernet restarting or a deploy: the job lives on in its database, poll again.
    if (res.status >= 500) return { state: 'pending', tokens: 0 }
    if (!res.ok || !res.body) return { state: 'failed', error: `c0mpute stream HTTP ${res.status}` }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (value) buf += decoder.decode(value, { stream: true })
      if (done) buf += '\n\n'
      buf = buf.replace(/\r\n/g, '\n')
      let cut
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, cut)
        buf = buf.slice(cut + 2)
        const event = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim()
        const raw = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).replace(/^ /, ''))
          .join('\n')
        let data: Record<string, unknown>
        try {
          data = JSON.parse(raw)
        } catch {
          continue
        }
        if (event === 'token' && typeof data.text === 'string') {
          text += data.text
          tokens++
        } else if (event === 'done') {
          await reader.cancel().catch(() => {})
          if (typeof data.text === 'string' && data.text) return { state: 'done', text: data.text }
          // A done that arrived live can beat token events still being backfilled, so the
          // tokens read so far may be short. The job is complete now: one fresh replay
          // reads every persisted event in order.
          if (!replay) return pollC0mputeJob(jobId, 15_000, true)
          const final = text
          return final.trim() ? { state: 'done', text: final } : { state: 'failed', error: 'c0mpute returned no text' }
        } else if (event === 'error') {
          await reader.cancel().catch(() => {})
          return { state: 'failed', error: `c0mpute: ${String(data.message ?? data.error ?? 'job failed')}` }
        }
      }
      if (done) return { state: 'pending', tokens }
    }
  } catch (e) {
    if (ctl.signal.aborted) return { state: 'pending', tokens }
    return { state: 'failed', error: `c0mpute: ${e instanceof Error ? e.message : String(e)}` }
  } finally {
    clearTimeout(timer)
  }
}
