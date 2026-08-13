// Recognising AI crawlers and agent clients.
//
// The point of this module is that the "read by AI assistants" number on the
// distribution page is measured rather than asserted. If we can't attribute a
// request to a known bot, it doesn't get counted.

export type ReadChannel = 'crawler' | 'api' | 'mcp' | 'llms_txt'

/**
 * User-agent substrings (lowercased) mapped to the bot family we report.
 * Sourced from the operators' own published crawler documentation.
 */
const BOT_SIGNATURES: Array<[needle: string, bot: string]> = [
  // OpenAI
  ['gptbot', 'GPTBot'],
  ['oai-searchbot', 'OAI-SearchBot'],
  ['chatgpt-user', 'ChatGPT-User'],
  // Anthropic
  ['claudebot', 'ClaudeBot'],
  ['claude-web', 'Claude-Web'],
  ['claude-user', 'Claude-User'],
  ['claude-searchbot', 'Claude-SearchBot'],
  ['anthropic-ai', 'Anthropic-AI'],
  // Google
  ['google-extended', 'Google-Extended'],
  ['googleother', 'GoogleOther'],
  // Perplexity
  ['perplexitybot', 'PerplexityBot'],
  ['perplexity-user', 'Perplexity-User'],
  // Microsoft / Bing
  ['bingbot', 'BingBot'],
  ['msnbot', 'MSNBot'],
  // Meta
  ['meta-externalagent', 'Meta-ExternalAgent'],
  ['facebookbot', 'FacebookBot'],
  // Apple
  ['applebot-extended', 'Applebot-Extended'],
  ['applebot', 'Applebot'],
  // Others
  ['amazonbot', 'Amazonbot'],
  ['bytespider', 'Bytespider'],
  ['ccbot', 'CCBot'],
  ['cohere-ai', 'Cohere-AI'],
  ['diffbot', 'Diffbot'],
  ['duckassistbot', 'DuckAssistBot'],
  ['mistralai-user', 'MistralAI-User'],
  ['petalbot', 'PetalBot'],
  ['timpibot', 'Timpibot'],
  ['youbot', 'YouBot'],
]

/**
 * Returns the bot family for a user-agent, or null when it looks like an
 * ordinary browser. Matching is substring-based and case-insensitive because
 * crawler UAs embed their token inside a longer Mozilla-compatible string.
 */
export function detectBot(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  const ua = userAgent.toLowerCase()
  for (const [needle, bot] of BOT_SIGNATURES) {
    if (ua.includes(needle)) return bot
  }
  return null
}

/**
 * Anything hitting the public API or MCP endpoint is a programmatic client by
 * definition, so we attribute it even when the UA is unknown -- but we keep
 * the recognised name when there is one, so the stats can break down by tool.
 */
export function attributeClient(
  userAgent: string | null | undefined,
  channel: ReadChannel,
): { bot: string; channel: ReadChannel } | null {
  const known = detectBot(userAgent)
  if (known) return { bot: known, channel }
  if (channel === 'api' || channel === 'mcp') {
    return { bot: 'unknown-client', channel }
  }
  // A crawler channel with an unrecognised UA is just a browser. Don't count it.
  return null
}

/** The list we advertise in robots.txt and on the distribution page. */
export function knownBotNames(): string[] {
  return [...new Set(BOT_SIGNATURES.map(([, bot]) => bot))].sort((a, b) =>
    a.localeCompare(b),
  )
}
