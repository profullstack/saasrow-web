// Step one of `saasrow login`: generate a one-time code, store its hash, and
// email it. Called server-to-server by the Next route /api/v1/auth/cli, which
// has already validated the address. The code is redeemed by the Next side
// (src/lib/apiAuth.ts, redeemLoginCode), so the hashing rule below must stay
// identical to src/lib/apiKeys.ts: sha256("user@example.com:ABCD2345").
//
// Deployed with verify_jwt on: the Next server attaches the anon JWT.

import { createClient } from 'npm:@supabase/supabase-js@2.76.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_TTL_SECONDS = 15 * 60
const CODES_PER_HOUR = 5

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return `${out.slice(0, 4)}-${out.slice(4)}`
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function emailHtml(code: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:40px 20px;background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#1a1a1a;border:1px solid rgba(79,255,227,0.15);border-radius:20px;padding:40px;">
      <p style="color:#4FFFE3;font-size:20px;font-weight:600;margin:0 0 24px;">SaaSRow CLI login</p>
      <p style="color:#e0e0e0;font-size:16px;line-height:1.7;margin:0 0 20px;">Enter this code in your terminal to finish signing in:</p>
      <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;letter-spacing:6px;color:#E0FF04;text-align:center;margin:0 0 24px;">${code}</p>
      <p style="color:#a0a0a0;font-size:14px;line-height:1.7;margin:0;">It expires in 15 minutes and works once. If you did not run <code>saasrow login</code>, ignore this email — nothing happens without the code.</p>
    </div>
  </body>
</html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { email: rawEmail } = await req.json().catch(() => ({}))
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      return json({ error: 'A valid email address is required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('cli_login_codes')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', hourAgo)
    if ((count ?? 0) >= CODES_PER_HOUR) {
      return json({ error: 'Too many login codes requested for this email. Try again in an hour.' }, 429)
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured')
      return json({ error: 'Email is not configured on the server' }, 500)
    }

    const code = generateCode()
    const codeHash = await sha256Hex(`${email}:${code.replace('-', '')}`)
    const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString()

    const { error: insertError } = await supabase
      .from('cli_login_codes')
      .insert({ email, code_hash: codeHash, expires_at: expiresAt })
    if (insertError) {
      console.error('cli_login_codes insert failed:', insertError)
      return json({ error: 'Could not create a login code' }, 500)
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SaaSRow <noreply@saasrow.com>',
        to: [email],
        subject: `${code} is your SaaSRow CLI login code`,
        html: emailHtml(code),
        text: `Your SaaSRow CLI login code is ${code}. It expires in 15 minutes and works once.`,
      }),
    })
    if (!resendResponse.ok) {
      console.error('Resend API error:', await resendResponse.text())
      return json({ error: 'Could not send the login email' }, 502)
    }

    return json({ ok: true, expires_in: CODE_TTL_SECONDS })
  } catch (error) {
    console.error('cli-login error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
})
