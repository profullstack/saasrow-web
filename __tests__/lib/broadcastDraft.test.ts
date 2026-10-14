import { describe, it, expect } from 'vitest'
import { buildDraftUserPrompt, parseDraft } from '@/lib/broadcastDraft'

describe('parseDraft', () => {
  it('reads subject and content from the model JSON', () => {
    expect(parseDraft('{"subject":"New screenshots for every listing","content":"Hi there,\\n\\nBody."}')).toEqual({
      subject: 'New screenshots for every listing',
      content: 'Hi there,\n\nBody.',
    })
  })

  it('tolerates a code fence around the JSON', () => {
    expect(parseDraft('```json\n{"subject":"S","content":"C"}\n```')).toEqual({ subject: 'S', content: 'C' })
  })

  it('replaces em and en dashes, and keeps the subject to one line without a trailing period', () => {
    const d = parseDraft(JSON.stringify({ subject: 'Big news — really\n.', content: 'One – two' }))
    expect(d.subject).toBe('Big news, really')
    expect(d.content).toBe('One, two')
  })

  it('throws on invalid JSON or a missing field', () => {
    expect(() => parseDraft('not json')).toThrow(/valid JSON/)
    expect(() => parseDraft('{"subject":"S"}')).toThrow(/missing/)
    expect(() => parseDraft('{"subject":"","content":"C"}')).toThrow(/missing/)
  })
})

describe('buildDraftUserPrompt', () => {
  it('includes the audience and description', () => {
    const p = buildDraftUserPrompt('  Announce screenshots  ', 'newsletter')
    expect(p).toContain('newsletter subscribers')
    expect(p).toContain('Announce screenshots')
    expect(p).not.toContain('existing draft')
  })

  it('asks for a rewrite when a draft already exists', () => {
    const p = buildDraftUserPrompt('Shorter', 'all', { subject: 'Old subject', content: 'Old body' })
    expect(p).toContain('There is an existing draft')
    expect(p).toContain('Existing subject: Old subject')
    expect(p).toContain('Old body')
  })
})
