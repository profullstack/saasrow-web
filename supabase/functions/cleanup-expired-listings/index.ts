import { createClient } from 'npm:@supabase/supabase-js@2.76.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromDomain = Deno.env.get('RESEND_DOMAIN') || 'saasrow.com'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://saasrow.com'

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if cleanup should run (max once per hour)
    const { data: shouldRun } = await supabase.rpc('should_run_cleanup')

    if (!shouldRun) {
      console.log('Cleanup not needed (ran within last hour)')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Cleanup not needed',
          skipped: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('Running cleanup...')

    // Mark expired listings and get all that need notifications
    const { data: notificationListings, error: markError } = await supabase.rpc('mark_expired_listings')

    if (markError) {
      console.error('Error marking expired listings:', markError)
      throw markError
    }

    console.log(`Found ${notificationListings?.length || 0} listings needing notification`)

    let expiredCount = 0
    let expiringCount = 0

    // Send notification emails asynchronously
    if (notificationListings && notificationListings.length > 0 && resendApiKey) {
      for (const listing of notificationListings) {
        try {
          if (listing.notification_type === 'expired') {
            expiredCount++
          } else {
            expiringCount++
          }

          // Get management token for this email
          const { data: tokenData } = await supabase
            .from('user_tokens')
            .select('token')
            .eq('email', listing.email)
            .maybeSingle()

          const managementLink = tokenData
            ? `${siteUrl}/manage/${encodeURIComponent(tokenData.token)}`
            : siteUrl

          // Send appropriate email based on type
          if (listing.notification_type === 'expired') {
            // Expiration email
            const emailHtml = `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #E0FF04 0%, #4FFFE3 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                  .header h1 { margin: 0; color: #1a1a1a; font-size: 24px; }
                  .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px; }
                  .listing-info { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
                  .cta-button { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #E0FF04 0%, #4FFFE3 100%); color: #1a1a1a; text-decoration: none; border-radius: 25px; font-weight: bold; margin: 10px 5px; }
                  .secondary-button { display: inline-block; padding: 14px 28px; background: #4a4a4a; color: #fff; text-decoration: none; border-radius: 25px; font-weight: bold; margin: 10px 5px; }
                  .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>⏰ Your Free Listing Has Expired</h1>
                  </div>
                  <div class="content">
                    <p>Hi there,</p>
                    <p>Your free listing on SaaSRow has reached its 90-day expiration period and has been archived:</p>
                    <div class="listing-info">
                      <strong>${listing.title}</strong><br>
                      <a href="${listing.url}" style="color: #4FFFE3;">${listing.url}</a><br>
                      <small>Expired on: ${new Date(listing.expires_at).toLocaleDateString()}</small>
                    </div>
                    <h3>What happens now?</h3>
                    <p>You have two options:</p>
                    <ol>
                      <li><strong>Renew for Free</strong> - Extend your listing for another 90 days at no cost</li>
                      <li><strong>Upgrade to Featured/Premium</strong> - Get permanent placement, analytics, and more visibility</li>
                    </ol>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${managementLink}" class="cta-button">Renew Free Listing</a>
                      <a href="${siteUrl}/featured" class="secondary-button">View Paid Plans</a>
                    </div>
                    <h3>Why upgrade?</h3>
                    <ul>
                      <li>✅ <strong>No more expiration</strong> - Keep your listing live permanently</li>
                      <li>📊 <strong>Advanced analytics</strong> - Track views, clicks, and conversions</li>
                      <li>⭐ <strong>Featured badge</strong> - Stand out from the competition</li>
                      <li>🚀 <strong>Priority placement</strong> - Get more visibility and traffic</li>
                      <li>📸 <strong>Screenshot gallery</strong> - Show off your product</li>
                      <li>📧 <strong>Newsletter featuring</strong> - Reach 200K+ subscribers (Premium)</li>
                    </ul>
                    <p><strong>Featured Tier:</strong> Only $1.60/month (billed annually)</p>
                    <p><strong>Premium Tier:</strong> Only $4.17/month (billed annually)</p>
                    <p>Questions? Just reply to this email - we're here to help!</p>
                    <p>Best regards,<br>The SaaSRow Team</p>
                  </div>
                  <div class="footer">
                    <p>SaaSRow - The World's Best Place to Find Self-Hosted Software</p>
                    <p><a href="${siteUrl}/unsubscribe?email=${encodeURIComponent(listing.email)}" style="color: #999;">Unsubscribe</a></p>
                  </div>
                </div>
              </body>
              </html>
            `

            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: `SaaSRow <noreply@${fromDomain}>`,
                to: listing.email,
                subject: `⏰ Your SaaSRow Listing Has Expired - Renew or Upgrade`,
                html: emailHtml,
              }),
            })

            console.log(`Sent expiration email to ${listing.email}`)
          } else {
            // Warning email for expiring soon
            const daysUntilExpiry = Math.ceil(
              (new Date(listing.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            )

            const emailHtml = `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #E0FF04 0%, #4FFFE3 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                  .header h1 { margin: 0; color: #1a1a1a; font-size: 24px; }
                  .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px; }
                  .warning-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
                  .listing-info { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
                  .cta-button { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #E0FF04 0%, #4FFFE3 100%); color: #1a1a1a; text-decoration: none; border-radius: 25px; font-weight: bold; margin: 10px 5px; }
                  .secondary-button { display: inline-block; padding: 14px 28px; background: #4a4a4a; color: #fff; text-decoration: none; border-radius: 25px; font-weight: bold; margin: 10px 5px; }
                  .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>⚠️ Your Listing Expires in ${daysUntilExpiry} Day${daysUntilExpiry > 1 ? 's' : ''}</h1>
                  </div>
                  <div class="content">
                    <p>Hi there,</p>
                    <div class="warning-box">
                      <strong>Action Required:</strong> Your free listing will expire soon!
                    </div>
                    <p>Your listing is about to expire:</p>
                    <div class="listing-info">
                      <strong>${listing.title}</strong><br>
                      <a href="${listing.url}" style="color: #4FFFE3;">${listing.url}</a><br>
                      <small style="color: #dc3545;"><strong>Expires: ${new Date(listing.expires_at).toLocaleDateString()}</strong></small>
                    </div>
                    <h3>Don't lose your listing!</h3>
                    <p>You have two options to keep your software visible:</p>
                    <ol>
                      <li><strong>Renew for Free</strong> - Quick and easy, extends for 90 days</li>
                      <li><strong>Upgrade to Featured/Premium</strong> - Never worry about expiration again + get premium benefits</li>
                    </ol>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${managementLink}" class="cta-button">Renew Now (Free)</a>
                      <a href="${siteUrl}/featured" class="secondary-button">Upgrade Instead</a>
                    </div>
                    <h3>Why upgrade to paid?</h3>
                    <ul>
                      <li>✅ <strong>Permanent listing</strong> - No more expiration reminders</li>
                      <li>📊 <strong>Track your performance</strong> - See views, clicks, and trends</li>
                      <li>⭐ <strong>Stand out</strong> - Featured badge and priority placement</li>
                      <li>🚀 <strong>Get more traffic</strong> - Better visibility = more visitors</li>
                      <li>📸 <strong>Showcase your product</strong> - Add screenshot galleries</li>
                    </ul>
                    <p><strong>Special Offer:</strong> Subscribe to our newsletter and get a <strong>50% discount code</strong> for Featured or Premium!</p>
                    <p>Questions? Just reply to this email!</p>
                    <p>Best regards,<br>The SaaSRow Team</p>
                  </div>
                  <div class="footer">
                    <p>SaaSRow - The World's Best Place to Find Self-Hosted Software</p>
                    <p><a href="${siteUrl}/unsubscribe?email=${encodeURIComponent(listing.email)}" style="color: #999;">Unsubscribe</a></p>
                  </div>
                </div>
              </body>
              </html>
            `

            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: `SaaSRow <noreply@${fromDomain}>`,
                to: listing.email,
                subject: `⚠️ Your SaaSRow Listing Expires in ${daysUntilExpiry} Day${daysUntilExpiry > 1 ? 's' : ''}`,
                html: emailHtml,
              }),
            })

            console.log(`Sent expiration warning to ${listing.email}`)
          }
        } catch (emailError) {
          console.error(`Error sending email to ${listing.email}:`, emailError)
        }
      }
    }

    // Record that cleanup ran
    await supabase.rpc('record_cleanup_run', {
      p_expired_count: expiredCount,
      p_notified_count: notificationListings?.length || 0,
    })

    return new Response(
      JSON.stringify({
        success: true,
        expiredCount,
        expiringCount,
        totalNotified: notificationListings?.length || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error in cleanup-expired-listings:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})