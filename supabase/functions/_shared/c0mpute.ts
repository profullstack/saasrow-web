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
