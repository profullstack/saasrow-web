import type { MetadataRoute } from 'next'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.saasrow.com').replace(
  /\/+$/,
  '',
)

// Private/internal areas stay closed to everyone.
const DISALLOW = ['/admin', '/manage', '/favorites', '/unsubscribe']

// The session-scoped internal endpoints stay closed, but the public
// distribution surface is explicitly opened: blanket-disallowing /api/ would
// hide the very API and MCP server we want agents to find.
const API_RULES = {
  allow: ['/api/v1/', '/api/mcp', '/llms.txt', '/llms-full.txt'],
  disallow: [...DISALLOW, '/api/'],
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        ...API_RULES,
      },
      // Naming the AI crawlers explicitly is not strictly required -- the
      // wildcard rule already permits them -- but an explicit Allow is what
      // several of these operators check for, and it documents the intent.
      {
        userAgent: [
          'GPTBot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'ClaudeBot',
          'Claude-User',
          'Claude-SearchBot',
          'anthropic-ai',
          'PerplexityBot',
          'Perplexity-User',
          'Google-Extended',
          'Applebot-Extended',
          'meta-externalagent',
          'Amazonbot',
          'DuckAssistBot',
          'MistralAI-User',
          'cohere-ai',
          'CCBot',
          'YouBot',
        ],
        ...API_RULES,
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  }
}
