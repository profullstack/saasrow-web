import { createClient } from 'npm:@supabase/supabase-js@2.76.1'
import { managementUrlFor, normalizeEmail, resolveManagementAccess } from '../_shared/managementAccess.ts'

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

    const { email: rawEmail } = await req.json()

    if (!rawEmail) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const email = normalizeEmail(rawEmail)
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Listings submitted on the website are matched by their contact email and
    // adopted; subscribers get their user token even with no listings yet.
    const access = await resolveManagementAccess(supabase, email)

    if (access.kind === 'none') {
      return new Response(
        JSON.stringify({ error: 'No listings or subscription found for this email address' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'
    const managementUrl = managementUrlFor(siteUrl, access.token)

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Manage Your SaaSRow Listings</title>
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
              <h2 class="subtitle">Manage Your Listings</h2>
            </div>
            <div class="content">
              <p>👋 <strong>Hi there!</strong></p>
              <p>Thank you for submitting your software to <span class="highlight">SaaSRow</span>. Your submission is being reviewed and will be live soon!</p>
              <p>We've created a unique management dashboard for you where you can:</p>
              <ul style="margin: 16px 0; padding-left: 20px; color: #ccc;">
                <li style="margin-bottom: 8px;">📊 Track your listing's performance</li>
                <li style="margin-bottom: 8px;">✏️ Update your software information</li>
                <li style="margin-bottom: 8px;">🚀 Upgrade to featured tiers</li>
                <li style="margin-bottom: 8px;">📈 View analytics and engagement</li>
              </ul>
            </div>
            <div class="button-container">
              <a href="${managementUrl}" class="button">Access My Dashboard</a>
            </div>
            <div class="url-fallback">
              <p>If the button doesn't work, copy this link:</p>
              <a href="${managementUrl}">${managementUrl}</a>
            </div>
            <div class="security-note">
              <strong>🔒 Keep This Email Safe</strong><br>
              This link provides direct access to manage your listings. Don't share it with anyone.
            </div>
            <div class="footer">
              <p><strong>SaaSRow</strong> - The World's Best Place to Find Software</p>
              <p style="margin-top: 8px;">This is an automated email. You're receiving this because you submitted software to our directory.</p>
            </div>
          </div>
        </body>
      </html>
    `

    const emailText = `
Hi there!

Thank you for submitting your software to SaaSRow. Your submission is being reviewed and will be live soon!

We've created a unique management dashboard for you where you can:
- Track your listing's performance
- Update your software information
- Upgrade to featured tiers
- View analytics and engagement

Access your dashboard here:
${managementUrl}

🔒 Keep This Email Safe
This link provides direct access to manage your listings. Don't share it with anyone.

---
SaaSRow - The World's Best Place to Find Software
This is an automated email. You're receiving this because you submitted software to our directory.
    `

    let sent = false
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
            subject: 'Manage Your SaaSRow Listings',
            html: emailHtml,
            text: emailText,
          }),
        })

        if (!resendResponse.ok) {
          console.error('Resend API error:', await resendResponse.text())
        } else {
          console.log('Email sent successfully via Resend to:', email)
          sent = true
        }
      } else {
        console.log('RESEND_API_KEY not configured')
        console.log('Would send email to:', email)
        console.log('Management URL:', managementUrl)
      }
    } catch (emailErr) {
      console.error('Error sending email:', emailErr)
    }

    // Saying "check your inbox" when nothing was sent leaves people waiting
    // for a link that will never come.
    if (!sent) {
      return new Response(
        JSON.stringify({ error: 'We could not send the email just now. Please try again in a few minutes.' }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({
        message: 'Management link sent to your email. Please check your inbox.',
        success: true
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})