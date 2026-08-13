import { describe, it, expect } from 'vitest'
import { detectBot, attributeClient, knownBotNames } from '@/lib/aiClients'

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'

describe('detectBot', () => {
  it('recognises GPTBot inside a full user-agent string', () => {
    expect(
      detectBot('Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)'),
    ).toBe('GPTBot')
  })

  it('recognises ClaudeBot', () => {
    expect(detectBot('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)')).toBe(
      'ClaudeBot',
    )
  })

  it('recognises PerplexityBot', () => {
    expect(detectBot('Mozilla/5.0 (compatible; PerplexityBot/1.0)')).toBe('PerplexityBot')
  })

  it('matches case-insensitively', () => {
    expect(detectBot('gptbot/1.0')).toBe('GPTBot')
    expect(detectBot('GPTBOT/1.0')).toBe('GPTBot')
  })

  it('returns null for an ordinary browser', () => {
    expect(detectBot(CHROME_UA)).toBeNull()
  })

  it('returns null for missing input', () => {
    expect(detectBot(null)).toBeNull()
    expect(detectBot(undefined)).toBeNull()
    expect(detectBot('')).toBeNull()
  })

  it('prefers the more specific Applebot-Extended over Applebot', () => {
    expect(detectBot('Mozilla/5.0 (compatible; Applebot-Extended/0.1)')).toBe(
      'Applebot-Extended',
    )
  })
})

describe('attributeClient', () => {
  it('counts a known crawler on the crawler channel', () => {
    expect(attributeClient('GPTBot/1.0', 'crawler')).toEqual({
      bot: 'GPTBot',
      channel: 'crawler',
    })
  })

  it('does not count a browser on the crawler channel', () => {
    expect(attributeClient(CHROME_UA, 'crawler')).toBeNull()
  })

  it('counts an unknown client on the api channel as programmatic', () => {
    expect(attributeClient('curl/8.4.0', 'api')).toEqual({
      bot: 'unknown-client',
      channel: 'api',
    })
  })

  it('counts an unknown client on the mcp channel', () => {
    expect(attributeClient(null, 'mcp')).toEqual({
      bot: 'unknown-client',
      channel: 'mcp',
    })
  })

  it('keeps the recognised name when a known bot uses the api', () => {
    expect(attributeClient('ClaudeBot/1.0', 'api')).toEqual({
      bot: 'ClaudeBot',
      channel: 'api',
    })
  })

  it('does not count a browser reading llms.txt', () => {
    expect(attributeClient(CHROME_UA, 'llms_txt')).toBeNull()
  })
})

describe('knownBotNames', () => {
  it('is sorted and free of duplicates', () => {
    const names = knownBotNames()
    expect(names).toEqual([...new Set(names)])
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('includes the major assistant crawlers', () => {
    const names = knownBotNames()
    for (const expected of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
      expect(names).toContain(expected)
    }
  })
})
