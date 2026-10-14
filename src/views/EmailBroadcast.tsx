'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { Alert } from '../components/Alert'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { callFn } from '@/lib/clientApi'
import { buildEmailParts, markdownToEmailHtml } from '@/lib/emailMarkdown'
import { isSendableEmail } from '@/lib/emailRecipients'

type Audience = 'newsletter' | 'users' | 'all'

interface AudienceOption {
  value: Audience
  label: string
  description: string
}

const AUDIENCE_OPTIONS: AudienceOption[] = [
  {
    value: 'newsletter',
    label: 'Newsletter Subscribers',
    description: 'Only users who opted into the newsletter',
  },
  {
    value: 'users',
    label: 'Registered Users',
    description: 'Users with accounts or software listings',
  },
  {
    value: 'all',
    label: 'Everyone',
    description: 'Newsletter subscribers + all registered users (de-duplicated)',
  },
]

/** Mirrors the footer send-email-broadcast appends, for the plain-text preview. */
const BROADCAST_FOOTER = [
  { text: "You're receiving this email because you have an account on SaaSRow." },
  { text: 'Visit SaaSRow', href: 'https://saasrow.com' },
  { text: `© ${new Date().getFullYear()} Profullstack, Inc. All rights reserved.` },
]

interface RecipientPreview {
  count: number
  loading: boolean
  error: string | null
}

export default function EmailBroadcast() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState<RecipientPreview>({ count: 0, loading: false, error: null })
  const [description, setDescription] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [previewMode, setPreviewMode] = useState<'html' | 'text'>('html')

  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('adminEmail')
    const storedToken = sessionStorage.getItem('adminToken')
    if (storedEmail && storedToken) {
      setIsAuthenticated(true)
    } else {
      router.replace('/admin')
    }
    setCheckingAuth(false)
  }, [router])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchRecipientCount(audience)
  }, [isAuthenticated, audience])

  const fetchRecipientCount = async (aud: Audience) => {
    setPreview({ count: 0, loading: true, error: null })
    try {
      const adminToken = sessionStorage.getItem('adminToken') ?? ''

      const emailSet = new Set<string>()
      // Mirrors the edge function: unsendable addresses (example.com and friends) are
      // excluded here too, so the count matches what Resend will actually accept.
      const add = (email?: string | null) => {
        if (isSendableEmail(email)) emailSet.add(email!.trim().toLowerCase())
      }

      if (aud === 'newsletter' || aud === 'all') {
        const res = await callFn('newsletter', { query: { all: true }, adminToken })
        if (res.ok) {
          const json = await res.json()
          // newsletter returns { data: [...] }
          const rows: { is_active: boolean; email: string }[] = json.data ?? json.subscribers ?? []
          for (const s of rows) if (s.is_active) add(s.email)
        }
      }

      if (aud === 'users' || aud === 'all') {
        const res = await callFn('get-admin-users', { adminToken })
        if (res.ok) {
          const json = await res.json()
          for (const t of json.tokens ?? []) add(t.email)
          // also count emails from submission_contacts via submissions
          for (const s of json.submissions ?? []) {
            add(s.submission_contacts?.email ?? s.email)
          }
        }
      }

      setPreview({ count: emailSet.size, loading: false, error: null })
    } catch {
      setPreview({ count: 0, loading: false, error: 'Failed to count recipients' })
    }
  }

  const handleDraft = async () => {
    if (!description.trim()) {
      setAlertMessage({ type: 'warning', message: 'Describe the email you want written first.' })
      return
    }
    setDrafting(true)
    try {
      const res = await callFn('draft-email-broadcast', {
        method: 'POST',
        adminToken: sessionStorage.getItem('adminToken') ?? '',
        // The current draft goes along so a second click revises instead of starting over.
        body: { description, audience, subject, content },
      })
      const result = await res.json()
      if (res.ok) {
        setSubject(result.subject)
        setContent(result.content)
        setAlertMessage({ type: 'info', message: 'Draft written. Review and edit it before sending.' })
      } else {
        setAlertMessage({ type: 'error', message: result.error || 'Failed to write the draft.' })
      }
    } catch {
      setAlertMessage({ type: 'error', message: 'An unexpected error occurred while drafting.' })
    } finally {
      setDrafting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !content.trim()) {
      setAlertMessage({ type: 'warning', message: 'Please fill in both subject and content.' })
      return
    }
    if (preview.count === 0) {
      setAlertMessage({ type: 'warning', message: 'No recipients found for the selected audience.' })
      return
    }

    const audienceLabel = AUDIENCE_OPTIONS.find(o => o.value === audience)?.label ?? audience
    setConfirmDialog({
      title: 'Send Email Broadcast',
      message: `Send "${subject}" to ${preview.count} recipient${preview.count !== 1 ? 's' : ''} (${audienceLabel})?`,
      onConfirm: () => {
        setConfirmDialog(null)
        performSend()
      },
    })
  }

  const performSend = async () => {
    setSending(true)
    try {
      const res = await callFn('send-email-broadcast', {
        method: 'POST',
        adminToken: sessionStorage.getItem('adminToken') ?? '',
        body: { subject, content, audience },
      })
      const result = await res.json()
      if (res.ok) {
        const parts = [`Email sent to ${result.recipientCount} recipient${result.recipientCount !== 1 ? 's' : ''}!`]
        if (result.skippedCount) parts.push(`${result.skippedCount} unsendable address${result.skippedCount !== 1 ? 'es' : ''} skipped.`)
        if (result.failedCount) parts.push(`${result.failedCount} failed: ${result.error ?? 'unknown error'}`)
        setAlertMessage({ type: result.failedCount ? 'warning' : 'success', message: parts.join(' ') })
        setSubject('')
        setContent('')
        setDescription('')
      } else {
        setAlertMessage({ type: 'error', message: result.error || 'Failed to send email broadcast.' })
      }
    } catch {
      setAlertMessage({ type: 'error', message: 'An unexpected error occurred.' })
    } finally {
      setSending(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <p className="text-white/70 font-ubuntu">Loading...</p>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      <Header />

      {alertMessage && (
        <Alert
          type={alertMessage.type}
          message={alertMessage.message}
          onClose={() => setAlertMessage(null)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
          <div>
            <h1 className="text-white text-3xl sm:text-4xl font-bold font-ubuntu mb-2">
              Email Broadcast
            </h1>
            <p className="text-white/60 font-ubuntu text-base">
              Send a one-time email to your users or newsletter subscribers.
            </p>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="px-5 py-2.5 rounded-full bg-[#4a4a4a] text-white font-ubuntu font-bold hover:bg-[#555555] transition-colors text-sm w-fit"
          >
            Back to Admin
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Audience selector */}
          <div className="bg-[#3a3a3a] rounded-2xl p-6 sm:p-8">
            <h2 className="text-white text-xl font-bold font-ubuntu mb-1">Audience</h2>
            <p className="text-white/50 font-ubuntu text-sm mb-5">
              Choose who receives this email.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAudience(opt.value)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    audience === opt.value
                      ? 'border-[#4FFFE3] bg-[#4FFFE3]/10'
                      : 'border-white/10 bg-[#2e2e2e] hover:border-white/30'
                  }`}
                >
                  <p className={`font-ubuntu font-bold text-sm mb-1 ${audience === opt.value ? 'text-[#4FFFE3]' : 'text-white'}`}>
                    {opt.label}
                  </p>
                  <p className="text-white/50 font-ubuntu text-xs leading-relaxed">
                    {opt.description}
                  </p>
                </button>
              ))}
            </div>

            {/* Recipient count */}
            <div className="mt-5 flex items-center gap-2">
              {preview.loading ? (
                <span className="text-white/50 font-ubuntu text-sm">Counting recipients...</span>
              ) : preview.error ? (
                <span className="text-red-400 font-ubuntu text-sm">{preview.error}</span>
              ) : (
                <span className="text-white/70 font-ubuntu text-sm">
                  <span className="text-white font-bold">{preview.count.toLocaleString()}</span>{' '}
                  unique recipient{preview.count !== 1 ? 's' : ''} will receive this email.
                </span>
              )}
            </div>
          </div>

          {/* Compose */}
          <div className="bg-[#3a3a3a] rounded-2xl p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-white text-xl font-bold font-ubuntu mb-1">Compose</h2>
              <p className="text-white/50 font-ubuntu text-sm">Write the email you want to send.</p>
            </div>

            <div className="rounded-xl border border-[#4FFFE3]/30 bg-[#2e2e2e] p-4 sm:p-5">
              <label htmlFor="description" className="block text-white/80 font-ubuntu text-sm mb-2">
                Describe the email <span className="text-white/40">(optional, AI writes the subject and body)</span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Announce that listings now get a free screenshot and AI-written description. Thank founders, ask them to check their listing, link to saasrow.com/manage."
                disabled={sending || drafting}
                rows={4}
                maxLength={4000}
                className="w-full px-4 py-3 bg-[#1f1f1f] text-white rounded-xl outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu placeholder-white/30 disabled:opacity-50 resize-y transition text-sm"
              />
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="button"
                  onClick={handleDraft}
                  disabled={sending || drafting || !description.trim()}
                  className="px-5 py-2.5 rounded-full bg-[#4FFFE3] text-neutral-900 font-ubuntu font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm w-fit"
                >
                  {drafting ? 'Writing...' : subject || content ? 'Rewrite with AI' : 'Write with AI'}
                </button>
                <p className="text-white/40 font-ubuntu text-xs">
                  {subject || content
                    ? 'Rewrites the current subject and body to match the description.'
                    : 'Fills in the subject and body below. Edit anything before sending.'}
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="subject" className="block text-white/80 font-ubuntu text-sm mb-2">
                Subject line
              </label>
              <input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Important update from SaaSRow"
                required
                disabled={sending || drafting}
                className="w-full px-4 py-3 bg-[#2e2e2e] text-white rounded-xl outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu placeholder-white/30 disabled:opacity-50 transition"
              />
            </div>

            <div>
              <label htmlFor="content" className="block text-white/80 font-ubuntu text-sm mb-2">
                Body
              </label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={'Paste or write markdown — plain text works too.\n\n# Heading\n\nSome **bold** text with a [link](https://saasrow.com).\n\n- bullet one\n- bullet two'}
                required
                disabled={sending || drafting}
                rows={14}
                className="w-full px-4 py-3 bg-[#2e2e2e] text-white rounded-xl outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu placeholder-white/30 disabled:opacity-50 resize-y transition font-mono text-sm"
              />
              <p className="text-white/40 font-ubuntu text-xs mt-2 leading-relaxed">
                Markdown is converted to HTML for the email: headings (#), <strong className="font-bold">**bold**</strong>,{' '}
                <em>*italic*</em>, [links](url), images, `code`, &gt; quotes, bullet and numbered lists, --- rules.
                Plain text is fine as-is — line breaks are preserved. Pasted HTML is shown as text, not rendered.
                Every email goes out as multipart/alternative: this HTML plus a plain-text version of the same markdown.
              </p>
            </div>
          </div>

          {/* Preview card */}
          {(subject || content) && (
            <div className="bg-[#3a3a3a] rounded-2xl p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white text-xl font-bold font-ubuntu">Preview</h2>
                <div className="flex rounded-full bg-[#2e2e2e] p-1 text-xs font-ubuntu">
                  {(['html', 'text'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPreviewMode(mode)}
                      className={`px-3 py-1 rounded-full transition-colors ${
                        previewMode === mode ? 'bg-[#4FFFE3] text-neutral-900 font-bold' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {mode === 'html' ? 'HTML' : 'Plain text'}
                    </button>
                  ))}
                </div>
              </div>
              {previewMode === 'text' ? (
                <pre className="bg-white rounded-xl p-6 text-gray-800 text-sm leading-relaxed whitespace-pre-wrap break-words font-mono">
                  {subject && `Subject: ${subject}\n\n`}
                  {buildEmailParts({ markdown: content, heading: 'SaaSRow', footer: BROADCAST_FOOTER }).text}
                </pre>
              ) : (
              <div className="bg-white rounded-xl p-6 text-gray-800 font-sans text-sm leading-relaxed">
                <div
                  className="mb-4 p-4 rounded-lg text-center font-bold text-lg"
                  style={{ background: 'linear-gradient(to bottom, #E0FF04, #4FFFE3)', color: '#000' }}
                >
                  SaaSRow
                </div>
                {subject && (
                  <p className="font-bold text-base mb-3 text-gray-900">{subject}</p>
                )}
                {/* Same renderer the edge function uses; input is escaped, so this is not raw user HTML. */}
                <div
                  className="bg-gray-50 rounded-lg p-4 overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: markdownToEmailHtml(content) }}
                />
                <p className="mt-4 text-xs text-gray-400 text-center">
                  You&apos;re receiving this because you have an account on SaaSRow.
                </p>
              </div>
              )}
            </div>
          )}

          {/* Send button */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button
              type="submit"
              disabled={sending || preview.loading || preview.count === 0}
              className="w-full sm:w-auto px-10 py-3.5 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-base"
            >
              {sending
                ? 'Sending...'
                : preview.loading
                ? 'Loading...'
                : `Send to ${preview.count.toLocaleString()} Recipient${preview.count !== 1 ? 's' : ''}`}
            </button>
            {preview.count === 0 && !preview.loading && (
              <p className="text-white/40 font-ubuntu text-sm">
                No recipients match the selected audience.
              </p>
            )}
          </div>
        </form>
      </main>

      <Footer />
    </div>
  )
}
