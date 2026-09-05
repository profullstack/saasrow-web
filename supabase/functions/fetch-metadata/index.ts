import { createClient } from 'npm:@supabase/supabase-js@2.76.1'
import { OpenAI } from 'npm:openai@4.47.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface MetaData {
  title?: string
  description?: string
  image?: string
  favicon?: string
  socialLinks?: Array<{ platform: string; url: string }>
}

async function fetchUrlMetadata(url: string): Promise<MetaData> {
  try {
    console.log('[METADATA] Starting metadata fetch for URL:', url)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSRow/1.0)',
      },
    })

    console.log('[METADATA] Fetch response status:', response.status, response.statusText)

    if (!response.ok) {
      console.warn('[METADATA] Fetch failed with status:', response.status)
      return {}
    }

    const html = await response.text()
    console.log('[METADATA] HTML fetched, length:', html.length)
    const metadata: MetaData = {}

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) {
      metadata.title = titleMatch[1].trim()
    }

    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    if (ogTitleMatch) {
      metadata.title = ogTitleMatch[1].trim()
    }

    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    if (descMatch) {
      metadata.description = descMatch[1].trim()
    }

    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
    if (ogDescMatch) {
      metadata.description = ogDescMatch[1].trim()
    }

    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    if (ogImageMatch) {
      metadata.image = ogImageMatch[1].trim()
    }
    
    const urlObj = new URL(url)
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`

    const pngIconMatch = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*type=["']image\/png["'][^>]*href=["']([^"']+)["']/i) ||
                         html.match(/<link[^>]*type=["']image\/png["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i) ||
                         html.match(/<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"'+\.png[^"']*)["']'/i)

    if (pngIconMatch) {
      let favicon = pngIconMatch[1].trim()
      if (!favicon.startsWith('http')) {
        favicon = favicon.startsWith('/') ? `${baseUrl}${favicon}` : `${baseUrl}/${favicon}`
      }
      metadata.favicon = favicon
    } else {
      const anyIconMatch = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i)
      if (anyIconMatch) {
        let favicon = anyIconMatch[1].trim()
        if (!favicon.startsWith('http')) {
          favicon = favicon.startsWith('/') ? `${baseUrl}${favicon}` : `${baseUrl}/${favicon}`
        }
        metadata.favicon = favicon
      } else {
        metadata.favicon = `${baseUrl}/favicon.ico`
      }
    }

    const socialLinks: Array<{ platform: string; url: string }> = []
    const socialPatterns = [
      { platform: 'twitter', pattern: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+/gi },
      { platform: 'github', pattern: /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/gi },
      { platform: 'linkedin', pattern: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_-]+/gi },
      { platform: 'facebook', pattern: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/gi },
      { platform: 'discord', pattern: /(?:https?:\/\/)?(?:www\.)?discord\.(?:gg|com\/invite)\/[a-zA-Z0-9]+/gi },
      { platform: 'youtube', pattern: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c\/|channel\/|@)[a-zA-Z0-9_-]+/gi },
      { platform: 'instagram', pattern: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-zA-Z0-9._]+/gi },
    ]

    const seenUrls = new Set<string>()
    for (const { platform, pattern } of socialPatterns) {
      const matches = html.match(pattern)
      if (matches) {
        for (let match of matches) {
          if (!match.startsWith('http')) {
            match = `https://${match}`
          }

          const normalizedUrl = match.toLowerCase().replace(/\/$/, '')
          if (!seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl)
            socialLinks.push({ platform, url: match })
          }
        }
      }
    }

    if (socialLinks.length > 0) {
      metadata.socialLinks = socialLinks
      console.log('[METADATA] Found social links:', socialLinks.length)
    }

    console.log('[METADATA] Metadata extraction complete:', {
      hasTitle: !!metadata.title,
      hasDescription: !!metadata.description,
      hasImage: !!metadata.image,
      hasFavicon: !!metadata.favicon,
      socialLinksCount: socialLinks.length
    })

    return metadata
  } catch (error) {
    console.error('[METADATA] Error fetching metadata:', error)
    console.error('[METADATA] Error details:', error instanceof Error ? error.message : String(error))
    return {}
  }
}

interface AiListing {
  title: string
  description: string
  category: string
  tags: string[]
}

function buildPrompt(url: string, metadata: MetaData): string {
  const existingInfo = `
URL: ${url}
${metadata.title ? `Existing Title: ${metadata.title}` : ''}
${metadata.description ? `Existing Description: ${metadata.description}` : ''}
`.trim()

  return `You are analyzing a website for a software directory. Based on the following information:

${existingInfo}

Generate:
1. A clear, concise title (max 60 characters) - use existing title if good, otherwise improve it
2. A compelling description (100-150 characters) that explains what the software does - use existing description if good, otherwise write better
3. A category from: Software, Security, Productivity, Development, Design, Marketing, Analytics, Communication
4. 3-5 relevant tags (lowercase, single words or short phrases) that describe the software's features, use cases, or technologies (e.g., "automation", "cloud", "open-source", "saas", "api", "analytics")

Return ONLY a JSON object with keys: title, description, category, tags (array of strings)
No markdown, no code blocks, just the raw JSON.`
}

/** Models like to wrap JSON in a code fence no matter what the prompt says. */
function parseAiJson(raw: string, metadata: MetaData): AiListing {
  let content = raw.trim()
  if (content.startsWith('```json')) {
    content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (content.startsWith('```')) {
    content = content.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }
  const parsed = JSON.parse(content.trim())
  return {
    title: parsed.title || metadata.title || 'Unknown Software',
    description: parsed.description || metadata.description || 'No description available',
    category: parsed.category || 'Software',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  }
}

async function askOpenAI(prompt: string, apiKey: string): Promise<string> {
  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  })
  return completion.choices[0]?.message?.content || '{}'
}

async function askGemini(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) throw new Error('Gemini returned no text')
  return text
}

/**
 * Title, description, category and tags from a model. Providers are tried
 * in order and the first one that answers wins: OpenAI when it has credits,
 * otherwise Gemini. A provider with no key is skipped; if all fail we fall
 * back to the page's own title and meta description rather than blocking
 * the submission.
 */
async function generateWithAI(url: string, metadata: MetaData): Promise<AiListing> {
  console.log('[AI] Starting AI generation for URL:', url)
  const prompt = buildPrompt(url, metadata)
  const providers: Array<[string, () => Promise<string>]> = []
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (openaiKey) providers.push(['openai', () => askOpenAI(prompt, openaiKey)])
  if (geminiKey) providers.push(['gemini', () => askGemini(prompt, geminiKey)])
  if (providers.length === 0) console.warn('[AI] No OPENAI_API_KEY or GEMINI_API_KEY configured, falling back to metadata only')

  for (const [name, ask] of providers) {
    try {
      console.log(`[AI] Asking ${name}...`)
      const raw = await ask()
      console.log(`[AI] ${name} raw response:`, raw.substring(0, 200))
      const result = parseAiJson(raw, metadata)
      console.log(`[AI] Final data from ${name}:`, result)
      return result
    } catch (error) {
      console.error(`[AI] ${name} failed:`, error instanceof Error ? error.message : String(error))
    }
  }

  return {
    title: metadata.title || 'Unknown Software',
    description: metadata.description || 'No description available',
    category: 'Software',
    tags: [],
  }
}

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return `${urlObj.protocol}//${urlObj.host}`
  } catch {
    throw new Error('Invalid URL format')
  }
}

Deno.serve(async (req: Request) => {
  console.log('[MAIN] ========== New Request ==========')
  console.log('[MAIN] Method:', req.method)
  console.log('[MAIN] URL:', req.url)

  if (req.method === 'OPTIONS') {
    console.log('[MAIN] Handling OPTIONS preflight request')
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    if (req.method !== 'POST') {
      console.warn('[MAIN] Invalid method:', req.method)
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const body = await req.json()
    console.log('[MAIN] Request body:', body)
    const { url: inputUrl } = body

    if (!inputUrl) {
      console.warn('[MAIN] No URL provided in request')
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    let url: string
    try {
      url = normalizeUrl(inputUrl)
      console.log('[MAIN] Normalized URL:', url)
    } catch {
      console.warn('[MAIN] Invalid URL format:', inputUrl)
      return new Response(
        JSON.stringify({ error: 'Invalid URL format. Please provide a valid domain (e.g., https://example.com)' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('[MAIN] Initializing Supabase client')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('[MAIN] Checking for duplicate submissions...')
    const { data: existing } = await supabase
      .from('software_submissions')
      .select('id, title, status')
      .eq('url', url)
      .maybeSingle()

    if (existing) {
      console.log('[MAIN] Duplicate found:', existing)
      return new Response(
        JSON.stringify({
          error: `This domain has already been submitted as "${existing.title}"${existing.status === 'approved' ? ' and is live' : ' and is pending review'}.`,
          duplicate: true
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('[MAIN] No duplicate found, proceeding with metadata extraction')
    const metadata = await fetchUrlMetadata(url)
    console.log('[MAIN] Metadata extracted, generating AI content')
    const aiGenerated = await generateWithAI(url, metadata)

    let logoPath: string | null = null
    let imagePath: string | null = null
    let screenshotPath: string | null = null

    if (metadata.favicon) {
      try {
        console.log('[LOGO] Downloading favicon from:', metadata.favicon)
        const logoResponse = await fetch(metadata.favicon)
        console.log('[LOGO] Favicon fetch status:', logoResponse.status)
        if (logoResponse.ok) {
          const logoBlob = await logoResponse.blob()
          console.log('[LOGO] Favicon blob size:', logoBlob.size, 'type:', logoBlob.type)
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${logoBlob.type.split('/')[1] || 'png'}`

          console.log('[LOGO] Uploading to storage as:', fileName)
          const { error: uploadError } = await supabase.storage
            .from('software-logos')
            .upload(fileName, logoBlob, {
              contentType: logoBlob.type,
              cacheControl: '3600',
            })

          if (!uploadError) {
            logoPath = fileName
            console.log('[LOGO] Logo uploaded successfully:', logoPath)
          } else {
            console.error('[LOGO] Upload error:', uploadError)
          }
        }
      } catch (error) {
        console.error('[LOGO] Failed to download/upload logo:', error)
        console.error('[LOGO] Error details:', error instanceof Error ? error.message : String(error))
      }
    } else {
      console.log('[LOGO] No favicon found in metadata')
    }

    if (metadata.image) {
      try {
        console.log('[IMAGE] Downloading OG image from:', metadata.image)
        const imageResponse = await fetch(metadata.image)
        console.log('[IMAGE] OG image fetch status:', imageResponse.status)
        if (imageResponse.ok) {
          const imageBlob = await imageResponse.blob()
          console.log('[IMAGE] OG image blob size:', imageBlob.size, 'type:', imageBlob.type)
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${imageBlob.type.split('/')[1] || 'png'}`

          console.log('[IMAGE] Uploading OG image to storage as:', fileName)
          const { error: uploadError } = await supabase.storage
            .from('software-images')
            .upload(fileName, imageBlob, {
              contentType: imageBlob.type,
              cacheControl: '3600',
            })

          if (!uploadError) {
            imagePath = fileName
            console.log('[IMAGE] OG image uploaded successfully:', imagePath)
          } else {
            console.error('[IMAGE] Upload error:', uploadError)
          }
        }
      } catch (error) {
        console.error('[IMAGE] Failed to download/upload OG image:', error)
        console.error('[IMAGE] Error details:', error instanceof Error ? error.message : String(error))
      }
    } else {
      console.log('[IMAGE] No OG image found in metadata')
    }

    // Screenshot functionality commented out - Puppeteer doesn't work in Supabase Edge Functions
    // Reason: No Chrome/Chromium binaries available in the serverless environment
    // TODO: Consider using a third-party screenshot service API if screenshots are needed
    // For now, relying on OG images from websites

    /*
    try {
      console.log('[PUPPETEER] ========== Starting Puppeteer Screenshot ==========')
      console.log('[PUPPETEER] Target URL:', url)
      console.log('[PUPPETEER] Launching browser...')

      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      console.log('[PUPPETEER] ✓ Browser launched successfully')

      const page = await browser.newPage()
      console.log('[PUPPETEER] ✓ New page created')

      await page.setViewport({ width: 1280, height: 800 })
      console.log('[PUPPETEER] ✓ Viewport set to 1280x800')

      console.log('[PUPPETEER] Navigating to URL (timeout: 30s)...')
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
      console.log('[PUPPETEER] ✓ Page loaded successfully')

      console.log('[PUPPETEER] Capturing screenshot...')
      const screenshotBuffer = await page.screenshot({
        type: 'png',
        fullPage: false,
      })
      console.log('[PUPPETEER] ✓ Screenshot captured, size:', screenshotBuffer.length, 'bytes')

      await browser.close()
      console.log('[PUPPETEER] ✓ Browser closed')

      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.png`
      console.log('[PUPPETEER] Uploading screenshot as:', fileName)

      const { error: uploadError } = await supabase.storage
        .from('software-images')
        .upload(fileName, screenshotBuffer, {
          contentType: 'image/png',
          cacheControl: '3600',
        })

      if (!uploadError) {
        screenshotPath = fileName
        if (!imagePath) {
          imagePath = fileName
        }
        console.log('[PUPPETEER] ✓ Screenshot uploaded successfully:', fileName)
      } else {
        console.error('[PUPPETEER] Screenshot upload error:', uploadError)
      }
    } catch (error) {
      console.error('[PUPPETEER] ========== SCREENSHOT FAILED ==========')
      console.error('[PUPPETEER] Error type:', error?.constructor?.name)
      console.error('[PUPPETEER] Error message:', error instanceof Error ? error.message : String(error))
      console.error('[PUPPETEER] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      console.error('[PUPPETEER] ========================================')
    }
    */

    const result = {
      url,
      title: aiGenerated.title,
      description: aiGenerated.description,
      category: aiGenerated.category,
      tags: aiGenerated.tags,
      image: imagePath,
      logo: logoPath,
      socialLinks: metadata.socialLinks || [],
    }

    console.log('[MAIN] ========== Request Complete ==========')
    console.log('[MAIN] Final result:', {
      url: result.url,
      title: result.title,
      category: result.category,
      tagsCount: result.tags.length,
      hasImage: !!result.image,
      hasLogo: !!result.logo,
      socialLinksCount: result.socialLinks.length
    })

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[MAIN] ========== SERVER ERROR ==========')
    console.error('[MAIN] Error type:', error?.constructor?.name)
    console.error('[MAIN] Error message:', error instanceof Error ? error.message : String(error))
    const errorStack = error instanceof Error ? error.stack : ''
    console.error('[MAIN] Error stack:', errorStack)
    console.error('[MAIN] =====================================')

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        details: errorStack ? errorStack.split('\n').slice(0, 3).join('\n') : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})