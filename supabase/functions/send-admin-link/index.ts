import { createClient } from 'npm:@supabase/supabase-js@2.76.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { email } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const adminEmail = Deno.env.get('ADMIN_EMAIL')
    if (email !== adminEmail) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Not an admin email' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { error: insertError } = await supabase
      .from('admin_tokens')
      .insert({
        email,
        token,
        expires_at: expiresAt,
      })

    if (insertError) {
      console.error('Error creating admin token:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to create admin token' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'
    const adminUrl = `${siteUrl}/admin?token=${encodeURIComponent(token)}`

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Admin Login - SaaSRow</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
              background: linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%);
              color: #ffffff;
              line-height: 1.6;
              padding: 40px 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: linear-gradient(180deg, #1a1a1a 0%, #2a2a2a 100%);
              border-radius: 24px;
              padding: 48px 40px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
              border: 1px solid rgba(79, 255, 227, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 40px;
              padding-bottom: 30px;
              border-bottom: 2px solid rgba(79, 255, 227, 0.2);
            }
            .logo {
              height: 64px;
              width: auto;
              margin: 0 auto 12px;
              display: block;
            }
            .subtitle {
              color: #4FFFE3;
              font-size: 24px;
              font-weight: 600;
              margin: 0;
            }
            .content {
              color: #e0e0e0;
              font-size: 16px;
              line-height: 1.8;
              margin-bottom: 32px;
            }
            .content p { margin-bottom: 16px; }
            .highlight {
              color: #4FFFE3;
              font-weight: 600;
            }
            .button-container {
              text-align: center;
              margin: 32px 0;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #E0FF04 0%, #4FFFE3 100%);
              color: #0a0a0a;
              padding: 18px 48px;
              border-radius: 30px;
              text-decoration: none;
              font-weight: 700;
              font-size: 16px;
              box-shadow: 0 10px 30px rgba(79, 255, 227, 0.3);
              transition: transform 0.2s, box-shadow 0.2s;
              letter-spacing: 0.5px;
            }
            .button:hover {
              transform: translateY(-2px);
              box-shadow: 0 15px 40px rgba(79, 255, 227, 0.4);
            }
            .url-fallback {
              background: rgba(79, 255, 227, 0.1);
              border: 1px solid rgba(79, 255, 227, 0.2);
              border-radius: 12px;
              padding: 16px;
              margin-top: 24px;
              text-align: center;
            }
            .url-fallback p {
              font-size: 13px;
              color: #999;
              margin-bottom: 8px;
            }
            .url-fallback a {
              color: #4FFFE3;
              word-break: break-all;
              font-size: 14px;
              text-decoration: none;
            }
            .footer {
              text-align: center;
              color: #888;
              font-size: 13px;
              margin-top: 40px;
              padding-top: 30px;
              border-top: 1px solid rgba(255, 255, 255, 0.1);
              line-height: 1.6;
            }
            .security-note {
              background: rgba(224, 255, 4, 0.1);
              border-left: 3px solid #E0FF04;
              padding: 16px;
              border-radius: 8px;
              margin-top: 24px;
              font-size: 14px;
              color: #ccc;
            }
            @media only screen and (max-width: 600px) {
              .container { padding: 32px 24px; }
              .logo { height: 48px; }
              .subtitle { font-size: 20px; }
              .button { padding: 16px 36px; font-size: 15px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://saasrow.com/wiresniff-logo-1-1.png" alt="SaaSRow" class="logo" />
              <h2 class="subtitle">Admin Login</h2>
            </div>
            <div class="content">
              <p>👋 <strong>Hi Admin!</strong></p>
              <p>Click the button below to securely log in to your <span class="highlight">SaaSRow</span> admin dashboard.</p>
              <p>This link is valid for <strong>24 hours</strong> and can only be used once.</p>
            </div>
            <div class="button-container">
              <a href="${adminUrl}" class="button">Access Admin Dashboard</a>
            </div>
            <div class="url-fallback">
              <p>If the button doesn't work, copy this link:</p>
              <a href="${adminUrl}">${adminUrl}</a>
            </div>
            <div class="security-note">
              <strong>🔒 Security Notice</strong><br>
              This is a secure admin login link. Never share it with anyone. If you didn't request this, please ignore this email.
            </div>
            <div class="footer">
              <p><strong>SaaSRow</strong> - Admin Access</p>
              <p style="margin-top: 8px;">This link expires in 24 hours for your security.</p>
            </div>
          </div>
        </body>
      </html>
    `

    const emailText = `
Hi Admin!

Click the link below to securely log in to your SaaSRow admin dashboard.

${adminUrl}

This link is valid for 24 hours and can only be used once.

🔒 Security Notice
This is a secure admin login link. Never share it with anyone. If you didn't request this, please ignore this email.

---
SaaSRow - Admin Access
This link expires in 24 hours for your security.
    `

    try {
      const resendApiKey = Deno.env.get('RESEND_API_KEY')

      if (resendApiKey) {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'SaaSRow <noreply@saasrow.com>',
            to: email,
            subject: 'Admin Login - SaaSRow',
            html: emailHtml,
            text: emailText,
          }),
        })

        if (!resendResponse.ok) {
          console.error('Resend API error:', await resendResponse.text())
        } else {
          console.log('Admin email sent successfully via Resend to:', email)
        }
      } else {
        console.log('RESEND_API_KEY not configured')
        console.log('Would send admin email to:', email)
        console.log('Admin URL:', adminUrl)
      }
    } catch (emailErr) {
      console.error('Error sending email:', emailErr)
    }

    return new Response(
      JSON.stringify({
        message: 'Admin login link sent to your email. Please check your inbox.',
        success: true
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})