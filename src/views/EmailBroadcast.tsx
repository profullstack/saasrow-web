'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { Alert } from '../components/Alert'
import { ConfirmDialog } from '../components/ConfirmDialog'

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

interface RecipientPreview {
  count: number
  loading: boolean
  error: string | null
}

export default function EmailBroadcast() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState<RecipientPreview>({ count: 0, loading: false, error: null })

  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('adminEmail')
    const storedToken = sessionStorage.getItem('adminToken')
    if (storedEmail && storedToken) {
      setAdminEmail(storedEmail)
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
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      const adminToken = sessionStorage.getItem('adminToken') ?? ''

      const emailSet = new Set<string>()

      if (aud === 'newsletter' || aud === 'all') {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/newsletter?all=true`,
          { headers: { Authorization: `Bearer ${anonKey}`, 'X-Admin-Token': adminToken } }
        )
        if (res.ok) {
          const json = await res.json()
          // newsletter returns { data: [...] }
          const rows: { is_active: boolean; email: string }[] = json.data ?? json.subscribers ?? []
          for (const s of rows) if (s.is_active) emailSet.add(s.email.toLowerCase())
        }
      }

      if (aud === 'users' || aud === 'all') {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/get-admin-users`,
          { headers: { Authorization: `Bearer ${anonKey}`, 'X-Admin-Token': adminToken } }
        )
        if (res.ok) {
          const json = await res.json()
          for (const t of json.tokens ?? []) if (t.email) emailSet.add(t.email.toLowerCase())
          // also count emails from submission_contacts via submissions
          for (const s of json.submissions ?? []) {
            const email = s.submission_contacts?.email ?? s.email
            if (email) emailSet.add(email.toLowerCase())
          }
        }
      }

      setPreview({ count: emailSet.size, loading: false, error: null })
    } catch {
      setPreview({ count: 0, loading: false, error: 'Failed to count recipients' })
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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email-broadcast`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ subject, content, adminEmail, audience }),
        }
      )
      const result = await res.json()
      if (res.ok) {
        setAlertMessage({ type: 'success', message: `Email sent to ${result.recipientCount} recipient${result.recipientCount !== 1 ? 's' : ''}!` })
        setSubject('')
        setContent('')
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
                disabled={sending}
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
                placeholder="Write your message here. Plain text is fine — each paragraph becomes a block in the email."
                required
                disabled={sending}
                rows={12}
                className="w-full px-4 py-3 bg-[#2e2e2e] text-white rounded-xl outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu placeholder-white/30 disabled:opacity-50 resize-y transition"
              />
            </div>
          </div>

          {/* Preview card */}
          {(subject || content) && (
            <div className="bg-[#3a3a3a] rounded-2xl p-6 sm:p-8">
              <h2 className="text-white text-xl font-bold font-ubuntu mb-4">Preview</h2>
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
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {content.split('\n').filter(l => l.trim()).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
                <p className="mt-4 text-xs text-gray-400 text-center">
                  You&apos;re receiving this because you have an account on SaaSRow.
                </p>
              </div>
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
