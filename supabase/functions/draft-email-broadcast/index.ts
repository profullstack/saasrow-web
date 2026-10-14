// Drafts an email broadcast (subject + markdown body) from the admin's description.
// Admin-only; nothing is sent or stored, the page drops the draft into its form.
//
// Providers are tried in order, like fetch-metadata: OpenAI, then Gemini. A provider
// with no key is skipped.
import { createClient } from 'npm:@supabase/supabase-js@2.76.1'
import { requireAdmin } from '../_shared/adminAuth.ts'
import {
  DRAFT_SYSTEM_PROMPT,
  MAX_DESCRIPTION_LENGTH,
  buildDraftUserPrompt,
  parseDraft,
  type BroadcastAudience,
  type BroadcastDraft,
} from '../_shared/broadcastDraft.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Token',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

async function askOpenAI(user: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('BROADCAST_AI_MODEL') || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: DRAFT_SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

async function askGemini(user: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: DRAFT_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const admin = await requireAdmin(req, supabase, corsHeaders)
    if (admin instanceof Response) return admin

    const { description, audience = 'all', subject, content } = (await req.json()) as {
      description?: string
      audience?: BroadcastAudience
      subject?: string
      content?: string
    }
    if (!description || !description.trim()) return json({ error: 'Describe the email you want written' }, 400)
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return json({ error: `Description is too long (max ${MAX_DESCRIPTION_LENGTH} characters)` }, 400)
    }

    const user = buildDraftUserPrompt(description, audience, { subject, content })
    const providers: Array<[string, () => Promise<string>]> = []
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (openaiKey) providers.push(['openai', () => askOpenAI(user, openaiKey)])
    if (geminiKey) providers.push(['gemini', () => askGemini(user, geminiKey)])
    if (providers.length === 0) return json({ error: 'No AI provider configured (OPENAI_API_KEY or GEMINI_API_KEY)' }, 500)

    let lastError = ''
    for (const [name, ask] of providers) {
      try {
        const draft: BroadcastDraft = parseDraft(await ask())
        return json({ ...draft, provider: name })
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        console.error(`[draft-email-broadcast] ${name} failed:`, lastError)
      }
    }
    return json({ error: `AI draft failed: ${lastError}` }, 502)
  } catch (error) {
    console.error('[draft-email-broadcast] error:', error)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
