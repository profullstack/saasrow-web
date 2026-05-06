import { useState, useEffect } from 'react'
import { Alert } from './Alert'
import { supabase } from '../lib/supabase'
import { trackEvent, analyticsEvents } from '../lib/analytics'

interface Comment {
  id: string
  submission_id: string
  author_name: string
  content: string
  rating?: number
  created_at: string
  is_verified: boolean
}

interface CommentsProps {
  submissionId: string
}

export function Comments({ submissionId }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [averageRating, setAverageRating] = useState<number | null>(null)
  const [commentCount, setCommentCount] = useState(0)
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const [formData, setFormData] = useState({
    authorName: '',
    authorEmail: '',
    content: '',
    rating: 0,
  })

  useEffect(() => {
    fetchComments()
    checkAuth()
  }, [submissionId])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setIsAuthenticated(!!session)
  }

  const fetchComments = async () => {
    setLoading(true)
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comments?submissionId=${submissionId}`
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })

      if (response.ok) {
        const result = await response.json()
        setComments(result.comments || [])
        setCommentCount(result.count || 0)
        setAverageRating(result.averageRating)
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.content) {
      setAlertMessage({ type: 'error', message: 'Please write a comment' })
      return
    }

    if (formData.content.length < 10) {
      setAlertMessage({ type: 'error', message: 'Comment must be at least 10 characters' })
      return
    }

    if (!isAuthenticated) {
      if (!formData.authorName || !formData.authorEmail) {
        setAlertMessage({ type: 'error', message: 'Please fill in all required fields' })
        return
      }
    } else {
      if (!formData.authorName || !formData.authorName.trim()) {
        setAlertMessage({ type: 'error', message: 'Please enter your name' })
        return
      }
    }

    setSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comments`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': session
          ? `Bearer ${session.access_token}`
          : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          submissionId,
          authorName: formData.authorName,
          authorEmail: formData.authorEmail,
          content: formData.content,
          rating: formData.rating > 0 ? formData.rating : null,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        trackEvent(analyticsEvents.COMMENT_POSTED, {
          submission_id: submissionId,
          has_rating: formData.rating > 0,
          is_authenticated: !!session,
        });
        setAlertMessage({ type: 'success', message: result.message || 'Comment posted!' })
        setFormData({ authorName: '', authorEmail: '', content: '', rating: 0 })
        if (session) {
          setTimeout(() => {
            fetchComments()
          }, 500)
        }
      } else {
        setAlertMessage({ type: 'error', message: result.error || 'Failed to submit comment' })
      }
    } catch (error) {
      console.error('Failed to submit comment:', error)
      setAlertMessage({ type: 'error', message: 'Failed to submit comment' })
    } finally {
      setSubmitting(false)
    }
  }

  const renderStars = (rating: number, interactive: boolean = false) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && setFormData({ ...formData, rating: star })}
            className={`${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
          >
            <svg
              className={`w-5 h-5 ${
                star <= rating ? 'text-[#E0FF04]' : 'text-white/20'
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        ))}
      </div>
    )
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`

    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <div className="bg-[#3a3a3a] rounded-2xl p-8 mt-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white text-2xl font-bold font-ubuntu">
          Reviews {commentCount > 0 && `(${commentCount})`}
        </h2>
        {averageRating && (
          <div className="flex items-center gap-2">
            <span className="text-[#E0FF04] text-2xl font-bold font-ubuntu">
              {averageRating}
            </span>
            {renderStars(Math.round(averageRating))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mb-8 pb-8 border-b border-white/10">
        <h3 className="text-white text-lg font-ubuntu font-bold mb-4">Write a Review</h3>

        <div className="mb-4">
          <label className="block text-white/70 font-ubuntu text-sm mb-2">
            Rating (optional)
          </label>
          {renderStars(formData.rating, true)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-white/70 font-ubuntu text-sm mb-2">
              Name {!isAuthenticated && '*'}
            </label>
            <input
              type="text"
              value={formData.authorName}
              onChange={(e) => setFormData({ ...formData, authorName: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-[#4a4a4a] text-white font-ubuntu border border-white/10 focus:border-[#4FFFE3] focus:outline-none"
              placeholder="Your name"
              disabled={submitting}
            />
          </div>
          {!isAuthenticated && (
            <div>
              <label className="block text-white/70 font-ubuntu text-sm mb-2">
                Email *
              </label>
              <input
                type="email"
                value={formData.authorEmail}
                onChange={(e) => setFormData({ ...formData, authorEmail: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-[#4a4a4a] text-white font-ubuntu border border-white/10 focus:border-[#4FFFE3] focus:outline-none"
                placeholder="your@email.com"
                disabled={submitting}
              />
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-white/70 font-ubuntu text-sm mb-2">
            Review * (min 10 characters)
          </label>
          <textarea
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            className="w-full px-4 py-3 rounded-lg bg-[#4a4a4a] text-white font-ubuntu border border-white/10 focus:border-[#4FFFE3] focus:outline-none resize-none"
            rows={4}
            placeholder="Share your experience with this software..."
            disabled={submitting}
            maxLength={2000}
          />
          <div className="text-white/40 text-sm font-ubuntu mt-1">
            {formData.content.length}/2000
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting...' : 'Submit Review'}
        </button>
      </form>

      {loading ? (
        <div className="text-center py-8">
          <p className="text-white/50 font-ubuntu">Loading reviews...</p>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-white/50 font-ubuntu">No reviews yet. Be the first to review!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {comments.map((comment) => (
            <div key={comment.id} className="border-b border-white/10 pb-6 last:border-0 last:pb-0">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-white font-ubuntu font-bold">{comment.author_name}</h4>
                  <p className="text-white/40 font-ubuntu text-sm">{formatDate(comment.created_at)}</p>
                </div>
                {comment.rating && renderStars(comment.rating)}
              </div>
              <p className="text-white/80 font-ubuntu leading-relaxed">{comment.content}</p>
            </div>
          ))}
        </div>
      )}

      {alertMessage && (
        <Alert
          type={alertMessage.type}
          message={alertMessage.message}
          onClose={() => setAlertMessage(null)}
        />
      )}
    </div>
  )
}
