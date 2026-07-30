import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { markdownToEmailHtml, markdownToPlainText } from '@/lib/emailMarkdown'

describe('markdownToEmailHtml', () => {
  it('returns an empty string for empty input', () => {
    expect(markdownToEmailHtml('')).toBe('')
    expect(markdownToEmailHtml('   \n  ')).toBe('')
  })

  it('renders plain text paragraphs with line breaks preserved', () => {
    const html = markdownToEmailHtml('Hello there.\nSecond line.\n\nNew paragraph.')
    expect(html).toContain('Hello there.<br />Second line.')
    expect(html.match(/<p /g)).toHaveLength(2)
    expect(html).toContain('New paragraph.')
  })

  it('renders headings at the right level', () => {
    const html = markdownToEmailHtml('# Big\n\n### Small')
    expect(html).toContain('<h1 style=')
    expect(html).toContain('>Big</h1>')
    expect(html).toContain('<h3 style=')
    expect(html).toContain('>Small</h3>')
  })

  it('renders bold, italic, strikethrough and inline code', () => {
    const html = markdownToEmailHtml('**bold** and *italic* and _also italic_ and ~~gone~~ and `code()`')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<em>also italic</em>')
    expect(html).toContain('<del>gone</del>')
    expect(html).toContain('>code()</code>')
  })

  it('does not italicise snake_case identifiers', () => {
    const html = markdownToEmailHtml('use some_var_name here')
    expect(html).not.toContain('<em>')
    expect(html).toContain('some_var_name')
  })

  it('renders markdown links and bare URLs', () => {
    const html = markdownToEmailHtml('See [SaaSRow](https://saasrow.com) or https://saasrow.com/pricing')
    expect(html).toContain('<a href="https://saasrow.com" style=')
    expect(html).toContain('>SaaSRow</a>')
    expect(html).toContain('<a href="https://saasrow.com/pricing"')
  })

  it('links bare email addresses with mailto', () => {
    const html = markdownToEmailHtml('Reply to hello@saasrow.com anytime')
    expect(html).toContain('<a href="mailto:hello@saasrow.com"')
  })

  it('keeps numbers in text intact', () => {
    const html = markdownToEmailHtml('We now have 5 plans and 12 integrations.')
    expect(html).toContain('We now have 5 plans and 12 integrations.')
  })

  it('renders unordered and ordered lists', () => {
    const ul = markdownToEmailHtml('- one\n- two\n- three')
    expect(ul).toContain('<ul style=')
    expect(ul.match(/<li /g)).toHaveLength(3)

    const ol = markdownToEmailHtml('1. first\n2. second')
    expect(ol).toContain('<ol style=')
    expect(ol.match(/<li /g)).toHaveLength(2)
  })

  it('renders nested lists', () => {
    const html = markdownToEmailHtml('- parent\n  - child\n- sibling')
    expect(html.match(/<ul /g)).toHaveLength(2)
    expect(html).toContain('child')
  })

  it('renders blockquotes, rules and fenced code blocks', () => {
    const html = markdownToEmailHtml('> quoted\n\n---\n\n```\nconst a = 1\n```')
    expect(html).toContain('<blockquote style=')
    expect(html).toContain('<hr style=')
    expect(html).toContain('<pre style=')
    expect(html).toContain('const a = 1')
  })

  it('renders images', () => {
    const html = markdownToEmailHtml('![logo](https://saasrow.com/logo.png)')
    expect(html).toContain('<img src="https://saasrow.com/logo.png" alt="logo"')
  })

  it('escapes pasted HTML instead of rendering it', () => {
    const html = markdownToEmailHtml('<script>alert(1)</script> and <b>bold?</b>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('drops javascript: and data: URLs', () => {
    const html = markdownToEmailHtml('[click](javascript:alert(1)) and ![x](data:text/html,evil)')
    expect(html).not.toContain('href="javascript')
    expect(html).not.toContain('src="data:')
  })

  it('does not treat markdown inside code spans as markup', () => {
    const html = markdownToEmailHtml('`**not bold**`')
    expect(html).not.toContain('<strong>')
    expect(html).toContain('**not bold**')
  })

  it('applies inline styles so email clients cannot strip them', () => {
    const html = markdownToEmailHtml('# Title\n\nBody')
    expect(html).toMatch(/<h1 style="[^"]+"/)
    expect(html).toMatch(/<p style="[^"]+"/)
  })
})

describe('markdownToPlainText', () => {
  it('strips markdown syntax but keeps the text readable', () => {
    const text = markdownToPlainText('# Title\n\n**Bold** and [a link](https://saasrow.com)\n\n- one\n- two')
    expect(text).toContain('Title')
    expect(text).toContain('Bold and a link (https://saasrow.com)')
    expect(text).toContain('- one')
    expect(text).not.toContain('**')
    expect(text).not.toContain('#')
  })

  it('returns an empty string for empty input', () => {
    expect(markdownToPlainText('')).toBe('')
  })
})

describe('renderer copies stay in sync', () => {
  it('src/lib and supabase/functions/_shared hold identical files', () => {
    const root = process.cwd()
    const web = fs.readFileSync(path.join(root, 'src/lib/emailMarkdown.ts'), 'utf8')
    const edge = fs.readFileSync(path.join(root, 'supabase/functions/_shared/emailMarkdown.ts'), 'utf8')
    expect(edge).toBe(web)
  })
})
