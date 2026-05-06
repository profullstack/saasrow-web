import { useState, useEffect } from 'react'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { Alert } from '../components/Alert'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabase'

interface Submission {
  id: string
  title: string
  url: string
  description: string
  email: string
  category: string
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  logo?: string
  image?: string
  tags?: string[]
  submission_contacts?: {
    email: string
  }
}

interface NewsPost {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  published: boolean
  created_at: string
  banner_image?: string
}

interface Subscriber {
  id: string
  email: string
  subscribed_at: string
  is_active: boolean
}

interface NewsletterHistoryItem {
  id: string
  subject: string
  content: string
  recipient_count: number
  sent_by: string
  mailgun_id: string
  sent_at: string
}

interface Comment {
  id: string
  submission_id: string
  author_name: string
  author_email: string
  content: string
  rating?: number
  created_at: string
  is_verified: boolean
  submission?: {
    title: string
  }
}

interface User {
  email: string
  tier: 'free' | 'featured' | 'premium'
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  last_submission_at: string | null
  submission_count: number
  subscription_status: string | null
  subscription_end: number | null
  cancel_at_period_end: boolean
}

interface AnalyticsData {
  totalSubmissions: number
  approvedSubmissions: number
  pendingSubmissions: number
  rejectedSubmissions: number
  totalViews: number
  totalClicks: number
  topPerformers: Array<{
    id: string
    title: string
    url: string
    view_count: number
    total_clicks: number
    tier: string
    submitted_at: string
  }>
  tierBreakdown: {
    free: number
    featured: number
    premium: number
  }
  recentActivity: Array<{
    date: string
    views: number
    clicks: number
  }>
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [email, setEmail] = useState('')
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [activeTab, setActiveTab] = useState<'submissions' | 'news' | 'newsletter' | 'users' | 'analytics' | 'comments'>('submissions')
  const [newsTopic, setNewsTopic] = useState('')
  const [newsTone, setNewsTone] = useState<'casual' | 'professional' | 'technical'>('casual')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPost, setGeneratedPost] = useState<NewsPost | null>(null)
  const [newsPosts, setNewsPosts] = useState<NewsPost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null)
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loadingSubscribers, setLoadingSubscribers] = useState(false)
  const [newsletterSubject, setNewsletterSubject] = useState('')
  const [newsletterContent, setNewsletterContent] = useState('')
  const [sendingNewsletter, setSendingNewsletter] = useState(false)
  const [newsletterHistory, setNewsletterHistory] = useState<NewsletterHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; confirmColor?: 'primary' | 'danger' } | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [userSubmissions, setUserSubmissions] = useState<{ [email: string]: Submission[] }>({})
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentFilter, setCommentFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const [generatedBanners, setGeneratedBanners] = useState<string[]>([])
  const [isGeneratingBanners, setIsGeneratingBanners] = useState(false)
  const [selectedBanner, setSelectedBanner] = useState<string | null>(null)

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')

    if (token) {
      verifyAdminToken(token)
    } else {
      const storedEmail = sessionStorage.getItem('adminEmail')
      const storedToken = sessionStorage.getItem('adminToken')
      if (storedEmail && storedToken) {
        setAdminEmail(storedEmail)
        setIsAuthenticated(true)
        fetchSubmissions()
      } else {
        sessionStorage.removeItem('adminEmail')
        sessionStorage.removeItem('adminToken')
        setLoading(false)
      }
    }
  }, [])

  const verifyAdminToken = async (token: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-admin-token`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        }
      )

      const result = await response.json()

      if (response.ok && result.valid) {
        sessionStorage.setItem('adminEmail', result.email)
        sessionStorage.setItem('adminToken', token)
        setAdminEmail(result.email)
        setIsAuthenticated(true)
        fetchSubmissions()
        window.history.replaceState({}, document.title, '/admin')
      } else {
        setAuthError(result.error || 'Invalid or expired admin token')
        setLoading(false)
      }
    } catch (error) {
      console.error('Token verification error:', error)
      setAuthError('Failed to verify admin token')
      setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    setAuthMessage('')

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-admin-link`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: email.trim() }),
        }
      )

      const result = await response.json()

      if (response.ok) {
        setAuthMessage('Check your email for the admin login link!')
        setEmail('')
      } else {
        setAuthError(result.error || 'Failed to send admin login link')
      }
    } catch (error) {
      setAuthError('Failed to send admin login link')
    }
  }

  const handleLogout = async () => {
    sessionStorage.removeItem('adminEmail')
    setAdminEmail(null)
    setIsAuthenticated(false)
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchSubmissions()
    }
  }, [isAuthenticated])

  const fetchSubmissions = async () => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submissions?all=true`
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })

      if (response.ok) {
        const result = await response.json()
        const transformedData = (result.data || []).map((sub: any) => ({
          ...sub,
          email: sub.submission_contacts?.email || ''
        }))
        setSubmissions(transformedData)
      } else {
        console.error('Failed to fetch submissions:', await response.text())
      }
    } catch (error) {
      console.error('Failed to fetch submissions:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateSubmissionStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const token = sessionStorage.getItem('adminToken')
      if (!token) {
        setAlertMessage({ type: 'error', message: 'Admin authentication required' })
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-submissions`
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'X-Admin-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, status }),
      })

      if (response.ok) {
        setSubmissions((prev) =>
          prev.map((sub) => (sub.id === id ? { ...sub, status } : sub))
        )
        fetchAnalytics()
        setAlertMessage({ type: 'success', message: `Submission ${status} successfully` })
      } else {
        const error = await response.json()
        console.error('Failed to update submission:', error)
        setAlertMessage({ type: 'error', message: error.error || 'Failed to update submission status' })
      }
    } catch (error) {
      console.error('Failed to update submission:', error)
      setAlertMessage({ type: 'error', message: 'Failed to update submission status' })
    }
  }

  const deleteSubmission = async (id: string, title: string) => {
    setConfirmDialog({
      title: 'Delete Submission',
      message: `Are you sure you want to delete "${title}"? This will permanently remove the submission and all associated data (logo, image, social links).`,
      confirmColor: 'danger',
      onConfirm: () => {
        setConfirmDialog(null)
        performDelete(id, title)
      }
    })
  }

  const performDelete = async (id: string, title: string) => {
    try {
      const token = sessionStorage.getItem('adminToken')
      if (!token) {
        setAlertMessage({ type: 'error', message: 'Admin authentication required' })
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-submissions`
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'X-Admin-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      })

      if (response.ok) {
        setSubmissions((prev) => prev.filter((sub) => sub.id !== id))
        setAlertMessage({ type: 'success', message: 'Submission deleted successfully' })
      } else {
        const error = await response.json()
        console.error('Failed to delete submission:', error)
        setAlertMessage({ type: 'error', message: error.error || 'Failed to delete submission' })
      }
    } catch (error) {
      console.error('Failed to delete submission:', error)
      setAlertMessage({ type: 'error', message: 'Failed to delete submission' })
    }
  }

  const filteredSubmissions = submissions.filter((sub) => {
    if (filter === 'all') return true
    return sub.status === filter
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'text-[#4FFFE3] bg-[#4FFFE3]/10 border-[#4FFFE3]'
      case 'rejected':
        return 'text-red-400 bg-red-400/10 border-red-400'
      default:
        return 'text-[#E0FF04] bg-[#E0FF04]/10 border-[#E0FF04]'
    }
  }

  const fetchNewsPosts = async () => {
    setLoadingPosts(true)
    try {
      if (!adminEmail) {
        setLoadingPosts(false)
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-news-posts?email=${encodeURIComponent(adminEmail)}`
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setNewsPosts(data || [])
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to load news posts')
      }
    } catch (error) {
      console.error('Failed to fetch news posts:', error)
      setAlertMessage({ type: 'error', message: 'Failed to load news posts' })
    } finally {
      setLoadingPosts(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated && activeTab === 'news') {
      fetchNewsPosts()
    }
    if (isAuthenticated && activeTab === 'newsletter') {
      fetchSubscribers()
      fetchNewsletterHistory()
    }
    if (isAuthenticated && activeTab === 'users') {
      fetchUsers()
    }
    if (isAuthenticated && activeTab === 'analytics') {
      fetchAnalytics()
    }
    if (isAuthenticated && activeTab === 'comments') {
      fetchComments()
    }
  }, [isAuthenticated, activeTab])

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-admin-users`
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch users')
      }

      const result = await response.json()
      const submissions = result.submissions
      const tokens = result.tokens
      const subscriptions = result.subscriptions

      const emailMap = new Map<string, User>()

      submissions?.forEach((sub: any) => {
        const email = sub.submission_contacts?.email?.toLowerCase()
        if (!email) return

        if (!emailMap.has(email)) {
          emailMap.set(email, {
            email: sub.submission_contacts.email,
            tier: (sub.tier as 'free' | 'featured' | 'premium') || 'free',
            created_at: sub.created_at,
            expires_at: null,
            last_used_at: null,
            last_submission_at: sub.submitted_at || sub.created_at,
            submission_count: 1,
            subscription_status: null,
            subscription_end: null,
            cancel_at_period_end: false
          })
        } else {
          const existing = emailMap.get(email)!
          existing.submission_count++
          if (sub.tier && sub.tier !== 'free' && (!existing.tier || existing.tier === 'free')) {
            existing.tier = sub.tier as 'free' | 'featured' | 'premium'
          }
          const subDate = new Date(sub.submitted_at || sub.created_at)
          const existingDate = new Date(existing.last_submission_at!)
          if (subDate > existingDate) {
            existing.last_submission_at = sub.submitted_at || sub.created_at
          }
        }
      })

      tokens?.forEach(token => {
        const email = token.email.toLowerCase()
        const existing = emailMap.get(email)
        if (existing) {
          existing.tier = token.tier as 'free' | 'featured' | 'premium'
          existing.expires_at = token.expires_at
          existing.last_used_at = token.last_used_at
        } else {
          emailMap.set(email, {
            email: token.email,
            tier: token.tier as 'free' | 'featured' | 'premium',
            created_at: token.created_at,
            expires_at: token.expires_at,
            last_used_at: token.last_used_at,
            last_submission_at: null,
            submission_count: 0,
            subscription_status: null,
            subscription_end: null,
            cancel_at_period_end: false
          })
        }
      })

      const usersData = Array.from(emailMap.values()).sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      setUsers(usersData)
    } catch (error) {
      console.error('Failed to fetch users:', error)
      setAlertMessage({ type: 'error', message: 'Failed to load users' })
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleUpgradeUser = async (email: string, newTier: 'featured' | 'premium') => {
    setConfirmDialog({
      title: 'Upgrade User',
      message: `Upgrade ${email} to ${newTier} tier? This will grant them access to ${newTier} features.`,
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          const { data: existingToken } = await supabase
            .from('user_tokens')
            .select('id')
            .eq('email', email)
            .maybeSingle()

          if (existingToken) {
            const { error } = await supabase
              .from('user_tokens')
              .update({ tier: newTier })
              .eq('email', email)

            if (error) throw error
          } else {
            const { error } = await supabase
              .from('user_tokens')
              .insert({
                email,
                tier: newTier,
                expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
              })

            if (error) throw error
          }

          const { data: contacts } = await supabase
            .from('submission_contacts')
            .select('submission_id')
            .eq('email', email)

          if (contacts && contacts.length > 0) {
            const submissionIds = contacts.map(c => c.submission_id)
            const { error: updateSubmissionsError } = await supabase
              .from('software_submissions')
              .update({ tier: newTier })
              .in('id', submissionIds)

            if (updateSubmissionsError) throw updateSubmissionsError
          }

          setAlertMessage({ type: 'success', message: `User upgraded to ${newTier} successfully!` })
          fetchUsers()
        } catch (error) {
          console.error('Failed to upgrade user:', error)
          setAlertMessage({ type: 'error', message: 'Failed to upgrade user' })
        }
      }
    })
  }

  const handleDowngradeUser = async (email: string) => {
    setConfirmDialog({
      title: 'Downgrade User',
      message: `Downgrade ${email} to free tier? This will remove their paid features.`,
      confirmColor: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          const { error: deleteTokenError } = await supabase
            .from('user_tokens')
            .delete()
            .eq('email', email)

          if (deleteTokenError) throw deleteTokenError

          const { data: contacts } = await supabase
            .from('submission_contacts')
            .select('submission_id')
            .eq('email', email)

          if (contacts && contacts.length > 0) {
            const submissionIds = contacts.map(c => c.submission_id)
            const { error: updateSubmissionsError } = await supabase
              .from('software_submissions')
              .update({ tier: 'free' })
              .in('id', submissionIds)

            if (updateSubmissionsError) throw updateSubmissionsError
          }

          setAlertMessage({ type: 'success', message: 'User downgraded to free tier successfully!' })
          fetchUsers()
        } catch (error) {
          console.error('Failed to downgrade user:', error)
          setAlertMessage({ type: 'error', message: 'Failed to downgrade user' })
        }
      }
    })
  }

  const handleDeleteUser = async (email: string) => {
    setConfirmDialog({
      title: 'Delete User Account',
      message: `Are you sure you want to permanently delete all data for ${email}? This will remove:\n\n• All submissions\n• User tokens\n• Social links\n• Analytics data\n• Screenshots\n\nThis action cannot be undone!`,
      confirmColor: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          const { data: contacts } = await supabase
            .from('submission_contacts')
            .select('submission_id')
            .eq('email', email)

          if (contacts && contacts.length > 0) {
            const submissionIds = contacts.map(c => c.submission_id)

            await supabase
              .from('social_links')
              .delete()
              .in('submission_id', submissionIds)

            await supabase
              .from('submission_clicks')
              .delete()
              .in('submission_id', submissionIds)

            await supabase
              .from('submission_analytics_daily')
              .delete()
              .in('submission_id', submissionIds)

            await supabase
              .from('submission_screenshots')
              .delete()
              .in('submission_id', submissionIds)

            await supabase
              .from('submission_contacts')
              .delete()
              .in('submission_id', submissionIds)

            await supabase
              .from('software_submissions')
              .delete()
              .in('id', submissionIds)
          }

          await supabase
            .from('user_tokens')
            .delete()
            .eq('email', email)

          setAlertMessage({ type: 'success', message: 'User account and all data deleted successfully!' })
          fetchUsers()
        } catch (error) {
          console.error('Failed to delete user:', error)
          setAlertMessage({ type: 'error', message: 'Failed to delete user account' })
        }
      }
    })
  }

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true)
    try {
      const token = sessionStorage.getItem('adminToken')

      if (!token) {
        console.error('No admin token available')
        throw new Error('No admin token available')
      }

      console.log('Fetching analytics with token:', token.substring(0, 10) + '...')

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-admin-analytics`
      const response = await fetch(`${apiUrl}?token=${encodeURIComponent(token)}`, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })

      const data = await response.json()
      console.log('Analytics response:', response.status, data)

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch analytics')
      }

      setAnalyticsData(data)
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
      setAlertMessage({ type: 'error', message: error.message || 'Failed to load analytics data' })
    } finally {
      setLoadingAnalytics(false)
    }
  }

  const toggleUserSubmissions = async (email: string) => {
    if (expandedUserId === email) {
      setExpandedUserId(null)
      return
    }

    setExpandedUserId(email)

    if (!userSubmissions[email]) {
      try {
        const { data: contacts } = await supabase
          .from('submission_contacts')
          .select('submission_id')
          .eq('email', email)

        if (!contacts || contacts.length === 0) {
          setUserSubmissions(prev => ({
            ...prev,
            [email]: []
          }))
          return
        }

        const submissionIds = contacts.map(c => c.submission_id)

        const { data, error } = await supabase
          .from('software_submissions')
          .select('*')
          .in('id', submissionIds)
          .order('created_at', { ascending: false })

        if (error) throw error

        setUserSubmissions(prev => ({
          ...prev,
          [email]: data as Submission[]
        }))
      } catch (error) {
        console.error('Failed to fetch user submissions:', error)
        setAlertMessage({ type: 'error', message: 'Failed to load user submissions' })
      }
    }
  }

  const fetchSubscribers = async () => {
    setLoadingSubscribers(true)
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter?all=true`
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })

      if (response.ok) {
        const result = await response.json()
        setSubscribers(result.data || [])
      } else {
        console.error('Failed to fetch subscribers:', await response.text())
      }
    } catch (error) {
      console.error('Failed to fetch subscribers:', error)
    } finally {
      setLoadingSubscribers(false)
    }
  }

  const exportSubscribers = () => {
    const csv = [
      ['Email', 'Subscribed At', 'Active'],
      ...subscribers.map(sub => [
        sub.email,
        new Date(sub.subscribed_at).toISOString(),
        sub.is_active ? 'Yes' : 'No'
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `newsletter-subscribers-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const importSubscribers = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const lines = text.split('\n').slice(1)
    const emails = lines
      .map(line => line.split(',')[0].trim())
      .filter(email => email && email.includes('@'))

    if (emails.length === 0) {
      setAlertMessage({ type: 'warning', message: 'No valid emails found in CSV file' })
      return
    }

    let successCount = 0
    let errorCount = 0

    for (const email of emails) {
      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter`
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        })

        if (response.ok) {
          successCount++
        } else {
          errorCount++
        }
      } catch (error) {
        errorCount++
      }
    }

    setAlertMessage({ type: 'success', message: `Import complete! ${successCount} subscribers added, ${errorCount} failed.` })
    fetchSubscribers()
    e.target.value = ''
  }

  const fetchNewsletterHistory = async () => {
    setLoadingHistory(true)
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-history`
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })

      if (response.ok) {
        const result = await response.json()
        setNewsletterHistory(result.data || [])
      } else {
        console.error('Failed to fetch newsletter history:', await response.text())
      }
    } catch (error) {
      console.error('Failed to fetch newsletter history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  const sendNewsletter = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newsletterSubject.trim() || !newsletterContent.trim()) {
      setAlertMessage({ type: 'warning', message: 'Please provide both subject and content' })
      return
    }

    const activeSubscribers = subscribers.filter(sub => sub.is_active)

    if (activeSubscribers.length === 0) {
      setAlertMessage({ type: 'warning', message: 'No active subscribers to send to' })
      return
    }

    setConfirmDialog({
      title: 'Send Newsletter',
      message: `Send newsletter to ${activeSubscribers.length} active subscribers?`,
      onConfirm: () => {
        setConfirmDialog(null)
        performSendNewsletter(newsletterSubject, newsletterContent, activeSubscribers.length)
      }
    })
  }

  const fetchComments = async () => {
    setLoadingComments(true)
    try {
      const token = sessionStorage.getItem('adminToken')
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/moderate-comments`
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'X-Admin-Token': token || '',
        },
      })

      if (response.ok) {
        const result = await response.json()
        setComments(result.comments || [])
      } else {
        const result = await response.json()
        setAlertMessage({ type: 'error', message: result.error || 'Failed to load comments' })
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error)
      setAlertMessage({ type: 'error', message: 'Failed to load comments' })
    } finally {
      setLoadingComments(false)
    }
  }

  const moderateComment = async (commentId: string, action: 'approve' | 'reject') => {
    try {
      const token = sessionStorage.getItem('adminToken')
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/moderate-comments`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'X-Admin-Token': token || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ commentId, action }),
      })

      if (response.ok) {
        setAlertMessage({ type: 'success', message: `Comment ${action === 'approve' ? 'approved' : 'deleted'} successfully` })
        fetchComments()
      } else {
        const result = await response.json()
        setAlertMessage({ type: 'error', message: result.error || `Failed to ${action} comment` })
      }
    } catch (error) {
      console.error(`Failed to ${action} comment:`, error)
      setAlertMessage({ type: 'error', message: `Failed to ${action} comment` })
    }
  }

  const performSendNewsletter = async (subject: string, content: string, subscriberCount: number) => {
    setSendingNewsletter(true)
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: subject,
          content: content,
          adminEmail: adminEmail
        }),
      })

      const result = await response.json()

      if (response.ok) {
        setAlertMessage({ type: 'success', message: `Newsletter sent successfully to ${result.recipientCount} subscribers!` })
        setNewsletterSubject('')
        setNewsletterContent('')
        fetchNewsletterHistory()
      } else {
        setAlertMessage({ type: 'error', message: `Failed to send newsletter: ${result.error}` })
      }
    } catch (error) {
      console.error('Failed to send newsletter:', error)
      setAlertMessage({ type: 'error', message: 'Failed to send newsletter' })
    } finally {
      setSendingNewsletter(false)
    }
  }

  const handleGeneratePost = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsGenerating(true)
    setGeneratedPost(null)

    try {
      if (!adminEmail) {
        setAlertMessage({ type: 'error', message: 'You must be logged in to perform this action' })
        setIsGenerating(false)
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-news-post`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic: newsTopic, tone: newsTone, email: adminEmail }),
      })

      if (response.ok) {
        const post = await response.json()
        setGeneratedPost(post)
        setNewsTopic('')
        setAlertMessage({ type: 'success', message: 'Post generated successfully! Review and publish below.' })
        await fetchNewsPosts()
      } else {
        const error = await response.json()
        setAlertMessage({ type: 'error', message: error.error || 'Failed to generate post' })
      }
    } catch (error) {
      console.error('Failed to generate post:', error)
      setAlertMessage({ type: 'error', message: 'Failed to generate post' })
    } finally {
      setIsGenerating(false)
    }
  }

  const togglePublishStatus = async (id: string, currentStatus: boolean) => {
    try {
      if (!adminEmail) {
        setAlertMessage({ type: 'error', message: 'You must be logged in to perform this action' })
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-news-posts`
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, published: !currentStatus, email: adminEmail }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update post')
      }

      setNewsPosts(prev =>
        prev.map(post => post.id === id ? { ...post, published: !currentStatus } : post)
      )
      setAlertMessage({ type: 'success', message: `Post ${!currentStatus ? 'published' : 'unpublished'} successfully` })
    } catch (error) {
      console.error('Failed to update post:', error)
      setAlertMessage({ type: 'error', message: 'Failed to update post status' })
    }
  }

  const deleteNewsPost = async (id: string, title: string) => {
    setConfirmDialog({
      title: 'Delete Post',
      message: `Are you sure you want to delete "${title}"?`,
      confirmColor: 'danger',
      onConfirm: () => {
        setConfirmDialog(null)
        performDeletePost(id, title)
      }
    })
  }

  const performDeletePost = async (id: string, title: string) => {
    try {
      if (!adminEmail) {
        setAlertMessage({ type: 'error', message: 'You must be logged in to perform this action' })
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-news-posts`
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, email: adminEmail }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete post')
      }

      setNewsPosts(prev => prev.filter(post => post.id !== id))
      if (generatedPost?.id === id) {
        setGeneratedPost(null)
      }
      setAlertMessage({ type: 'success', message: 'Post deleted successfully' })
    } catch (error) {
      console.error('Failed to delete post:', error)
      setAlertMessage({ type: 'error', message: 'Failed to delete post' })
    }
  }

  const handleGenerateBanners = async (postTitle: string) => {
    setIsGeneratingBanners(true)
    setGeneratedBanners([])
    setSelectedBanner(null)

    try {
      if (!adminEmail) {
        setAlertMessage({ type: 'error', message: 'You must be logged in to perform this action' })
        setIsGeneratingBanners(false)
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-banner-images`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: postTitle, email: adminEmail }),
      })

      if (response.ok) {
        const result = await response.json()
        setGeneratedBanners(result.images)
        setAlertMessage({ type: 'success', message: `Generated ${result.images.length} banner options! Select one to add to your post.` })
      } else {
        const error = await response.json()
        setAlertMessage({ type: 'error', message: error.error || 'Failed to generate banner images' })
      }
    } catch (error) {
      console.error('Failed to generate banners:', error)
      setAlertMessage({ type: 'error', message: 'Failed to generate banner images' })
    } finally {
      setIsGeneratingBanners(false)
    }
  }

  const handleUpdateBanner = async (postId: string, bannerUrl: string) => {
    try {
      if (!adminEmail) {
        setAlertMessage({ type: 'error', message: 'You must be logged in to perform this action' })
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-news-posts`
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: postId, banner_image: bannerUrl, email: adminEmail }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update banner')
      }

      setNewsPosts(prev =>
        prev.map(post => post.id === postId ? { ...post, banner_image: bannerUrl } : post)
      )
      if (generatedPost?.id === postId) {
        setGeneratedPost({ ...generatedPost, banner_image: bannerUrl })
      }
      setGeneratedBanners([])
      setSelectedBanner(null)
      setAlertMessage({ type: 'success', message: 'Banner image updated successfully!' })
    } catch (error) {
      console.error('Failed to update banner:', error)
      setAlertMessage({ type: 'error', message: 'Failed to update banner image' })
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-800 relative flex items-center justify-center">
        <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
          <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
          <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        </div>

        <div className="relative z-10 w-full max-w-md px-4">
          <div className="bg-[#3a3a3a] rounded-2xl p-8">
            <h1 className="text-white text-3xl font-bold font-ubuntu mb-6 text-center">
              Admin Login
            </h1>

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-white font-ubuntu text-sm mb-2">
                  Admin Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@example.com"
                  className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu"
                />
              </div>

              {authError && (
                <div className="rounded-lg p-3 bg-red-400/10 border border-red-400">
                  <p className="text-red-400 font-ubuntu text-sm text-center">{authError}</p>
                </div>
              )}

              {authMessage && (
                <div className="rounded-lg p-3 bg-[#4FFFE3]/10 border border-[#4FFFE3]">
                  <p className="text-[#4FFFE3] font-ubuntu text-sm text-center">{authMessage}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold text-lg hover:opacity-90 transition-opacity"
              >
                Send Magic Link
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-white text-3xl sm:text-4xl lg:text-5xl font-bold font-ubuntu mb-2">Admin Dashboard</h1>
              <p className="text-white/70 text-base sm:text-lg lg:text-xl font-ubuntu">
                Manage software submissions and news posts
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-6 py-3 rounded-full bg-[#4a4a4a] text-white font-ubuntu font-bold hover:bg-[#555555] transition-colors w-full sm:w-auto"
            >
              Logout
            </button>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-4 mb-6 sm:mb-8">
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-4 sm:px-6 lg:px-8 py-2 sm:py-3 rounded-full font-ubuntu font-bold transition-all text-sm sm:text-base ${
                activeTab === 'submissions'
                  ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                  : 'bg-[#4a4a4a] text-white hover:bg-[#555555]'
              }`}
            >
              Submissions
            </button>
            <button
              onClick={() => setActiveTab('news')}
              className={`px-4 sm:px-6 lg:px-8 py-2 sm:py-3 rounded-full font-ubuntu font-bold transition-all text-sm sm:text-base ${
                activeTab === 'news'
                  ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                  : 'bg-[#4a4a4a] text-white hover:bg-[#555555]'
              }`}
            >
              News
            </button>
            <button
              onClick={() => setActiveTab('newsletter')}
              className={`px-4 sm:px-6 lg:px-8 py-2 sm:py-3 rounded-full font-ubuntu font-bold transition-all text-sm sm:text-base ${
                activeTab === 'newsletter'
                  ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                  : 'bg-[#4a4a4a] text-white hover:bg-[#555555]'
              }`}
            >
              Newsletter
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 sm:px-6 lg:px-8 py-2 sm:py-3 rounded-full font-ubuntu font-bold transition-all text-sm sm:text-base ${
                activeTab === 'users'
                  ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                  : 'bg-[#4a4a4a] text-white hover:bg-[#555555]'
              }`}
            >
              Users
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 sm:px-6 lg:px-8 py-2 sm:py-3 rounded-full font-ubuntu font-bold transition-all text-sm sm:text-base ${
                activeTab === 'analytics'
                  ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                  : 'bg-[#4a4a4a] text-white hover:bg-[#555555]'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              className={`px-4 sm:px-6 lg:px-8 py-2 sm:py-3 rounded-full font-ubuntu font-bold transition-all text-sm sm:text-base ${
                activeTab === 'comments'
                  ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                  : 'bg-[#4a4a4a] text-white hover:bg-[#555555]'
              }`}
            >
              Comments
            </button>
          </div>

          {activeTab === 'submissions' && (
            <>
              <div className="flex flex-wrap gap-2 sm:gap-4 mb-6 sm:mb-8">
            {['all', 'pending', 'approved', 'rejected'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status as typeof filter)}
                className={`px-3 sm:px-4 lg:px-6 py-2 sm:py-3 rounded-full font-ubuntu font-bold transition-all capitalize text-xs sm:text-sm lg:text-base ${
                  filter === status
                    ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                    : 'bg-[#4a4a4a] text-white hover:bg-[#555555]'
                }`}
              >
                {status} ({submissions.filter((s) => status === 'all' || s.status === status).length})
              </button>
            ))}
          </div>

          {loading ? (
            <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
              <p className="text-white/70 font-ubuntu text-xl">Loading submissions...</p>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
              <p className="text-white/70 font-ubuntu text-xl">No submissions found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSubmissions.map((submission) => (
                <div
                  key={submission.id}
                  className="bg-[#3a3a3a] rounded-2xl p-4 sm:p-6 hover:bg-[#404040] transition-colors"
                >
                  <div className="flex flex-col sm:flex-row items-start gap-4 mb-4">
                    {submission.logo && (
                      <div className="flex-shrink-0">
                        <img
                          src={submission.logo}
                          alt={`${submission.title} logo`}
                          className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-white p-2 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-white text-lg sm:text-xl lg:text-2xl font-bold font-ubuntu break-words">
                          {submission.title}
                        </h3>
                        <span
                          className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-ubuntu border capitalize ${getStatusColor(
                            submission.status
                          )}`}
                        >
                          {submission.status}
                        </span>
                        <span className="px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-ubuntu bg-[#4a4a4a] text-white/70">
                          {submission.category}
                        </span>
                      </div>
                      <a
                        href={submission.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#4FFFE3] font-ubuntu hover:underline block mb-2"
                      >
                        {submission.url}
                      </a>
                      <p className="text-white/70 font-ubuntu mb-2">{submission.description}</p>
                      {submission.tags && submission.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {submission.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-[#4FFFE3]/20 text-[#4FFFE3] rounded-full text-xs font-ubuntu"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-white/50 font-ubuntu text-xs sm:text-sm">
                        <span className="break-all">Contact: {submission.email}</span>
                        <span>
                          Submitted: {new Date(submission.submitted_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 mt-4">
                    <div className="flex gap-2 flex-wrap">
                      {submission.status !== 'approved' && (
                        <button
                          onClick={() => updateSubmissionStatus(submission.id, 'approved')}
                          className="flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold hover:bg-[#4FFFE3]/30 transition-colors text-sm"
                        >
                          Approve
                        </button>
                      )}
                      {submission.status !== 'rejected' && (
                        <button
                          onClick={() => updateSubmissionStatus(submission.id, 'rejected')}
                          className="flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg bg-red-400/20 text-red-400 border border-red-400 font-ubuntu font-bold hover:bg-red-400/30 transition-colors text-sm"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => deleteSubmission(submission.id, submission.title)}
                      className="px-3 sm:px-4 py-2 rounded-lg bg-red-600/20 text-red-500 border border-red-600 font-ubuntu font-bold hover:bg-red-600/30 transition-colors text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
            </>
          )}

          {activeTab === 'newsletter' && (
            <div className="space-y-8">
              <div className="bg-[#3a3a3a] rounded-2xl p-4 sm:p-6 lg:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-white text-xl sm:text-2xl lg:text-3xl font-bold font-ubuntu mb-2">
                      Newsletter Subscribers ({subscribers.filter(s => s.is_active).length} active)
                    </h2>
                    <p className="text-white/70 font-ubuntu text-sm sm:text-base">
                      Manage your newsletter subscriber list
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    <button
                      onClick={exportSubscribers}
                      disabled={subscribers.length === 0}
                      className="px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold hover:bg-[#4FFFE3]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                    >
                      Export CSV
                    </button>
                    <label className="px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-[#E0FF04]/20 text-[#E0FF04] border border-[#E0FF04] font-ubuntu font-bold hover:bg-[#E0FF04]/30 transition-colors cursor-pointer text-sm sm:text-base">
                      Import CSV
                      <input
                        type="file"
                        accept=".csv"
                        onChange={importSubscribers}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {loadingSubscribers ? (
                  <div className="text-center py-8">
                    <p className="text-white/70 font-ubuntu text-lg">Loading subscribers...</p>
                  </div>
                ) : subscribers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-white/70 font-ubuntu text-lg">No subscribers yet</p>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-auto">
                    <table className="w-full min-w-[600px]">
                      <thead className="sticky top-0 bg-[#3a3a3a] border-b border-white/10">
                        <tr className="text-left">
                          <th className="py-2 sm:py-3 px-2 sm:px-4 text-white font-ubuntu font-bold text-sm sm:text-base">Email</th>
                          <th className="py-2 sm:py-3 px-2 sm:px-4 text-white font-ubuntu font-bold text-sm sm:text-base">Subscribed At</th>
                          <th className="py-2 sm:py-3 px-2 sm:px-4 text-white font-ubuntu font-bold text-sm sm:text-base">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subscribers.map((subscriber) => (
                          <tr key={subscriber.id} className="border-b border-white/5 hover:bg-white/5">
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-white/90 font-ubuntu text-xs sm:text-sm break-all">{subscriber.email}</td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-white/70 font-ubuntu text-xs sm:text-sm whitespace-nowrap">
                              {new Date(subscriber.subscribed_at).toLocaleDateString()}
                            </td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4">
                              <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-ubuntu border ${
                                subscriber.is_active
                                  ? 'text-[#4FFFE3] bg-[#4FFFE3]/10 border-[#4FFFE3]'
                                  : 'text-red-400 bg-red-400/10 border-red-400'
                              }`}>
                                {subscriber.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-[#3a3a3a] rounded-2xl p-4 sm:p-6 lg:p-8">
                <h2 className="text-white text-xl sm:text-2xl lg:text-3xl font-bold font-ubuntu mb-3 sm:mb-4">
                  Send Newsletter
                </h2>
                <p className="text-white/70 font-ubuntu mb-4 sm:mb-6 text-sm sm:text-base">
                  Compose and send a newsletter to all active subscribers
                </p>

                <form onSubmit={sendNewsletter} className="space-y-4">
                  <div>
                    <label htmlFor="subject" className="block text-white font-ubuntu mb-2">
                      Subject
                    </label>
                    <input
                      id="subject"
                      type="text"
                      value={newsletterSubject}
                      onChange={(e) => setNewsletterSubject(e.target.value)}
                      placeholder="Your newsletter subject..."
                      required
                      disabled={sendingNewsletter}
                      className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label htmlFor="content" className="block text-white font-ubuntu mb-2">
                      Content
                    </label>
                    <textarea
                      id="content"
                      value={newsletterContent}
                      onChange={(e) => setNewsletterContent(e.target.value)}
                      placeholder="Write your newsletter content here..."
                      required
                      disabled={sendingNewsletter}
                      rows={10}
                      className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu disabled:opacity-50 resize-y"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sendingNewsletter || subscribers.filter(s => s.is_active).length === 0}
                    className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingNewsletter ? 'Sending...' : `Send to ${subscribers.filter(s => s.is_active).length} Subscribers`}
                  </button>
                </form>
              </div>

              <div className="bg-[#3a3a3a] rounded-2xl p-4 sm:p-6 lg:p-8">
                <h2 className="text-white text-xl sm:text-2xl lg:text-3xl font-bold font-ubuntu mb-3 sm:mb-4">
                  Newsletter History ({newsletterHistory.length})
                </h2>
                <p className="text-white/70 font-ubuntu mb-4 sm:mb-6 text-sm sm:text-base">
                  View all previously sent newsletters
                </p>

                {loadingHistory ? (
                  <div className="text-center py-8">
                    <p className="text-white/70 font-ubuntu text-lg">Loading history...</p>
                  </div>
                ) : newsletterHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-white/70 font-ubuntu text-lg">No newsletters sent yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {newsletterHistory.map((item) => (
                      <div
                        key={item.id}
                        className="bg-[#404040] rounded-xl p-6 hover:bg-[#454545] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-white text-xl font-bold font-ubuntu mb-2">
                              {item.subject}
                            </h3>
                            <div className="flex items-center gap-4 text-white/50 font-ubuntu text-sm mb-3">
                              <span>Sent to: {item.recipient_count} subscribers</span>
                              <span>By: {item.sent_by}</span>
                              <span>
                                {new Date(item.sent_at).toLocaleDateString()} at{' '}
                                {new Date(item.sent_at).toLocaleTimeString()}
                              </span>
                            </div>
                            {expandedHistoryId === item.id && (
                              <div className="mt-4 pt-4 border-t border-white/10">
                                <p className="text-white/80 font-ubuntu whitespace-pre-wrap">
                                  {item.content}
                                </p>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                            className="px-4 py-2 rounded-lg bg-[#4a4a4a] text-white border border-white/20 font-ubuntu font-bold hover:bg-[#505050] transition-colors"
                          >
                            {expandedHistoryId === item.id ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'news' && (
            <div className="space-y-8">
              <div className="bg-[#3a3a3a] rounded-2xl p-8">
                <h2 className="text-white text-3xl font-bold font-ubuntu mb-4">
                  Generate News Post with AI
                </h2>
                <p className="text-white/70 font-ubuntu mb-6">
                  Enter a topic and AI will generate a complete blog post
                </p>

                <form onSubmit={handleGeneratePost} className="space-y-4">
                  <div>
                    <label htmlFor="topic" className="block text-white font-ubuntu mb-2">
                      Topic
                    </label>
                    <input
                      id="topic"
                      type="text"
                      value={newsTopic}
                      onChange={(e) => setNewsTopic(e.target.value)}
                      placeholder="e.g., The Future of AI in Software Development"
                      required
                      disabled={isGenerating}
                      className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label htmlFor="tone" className="block text-white font-ubuntu mb-2">
                      Writing Tone
                    </label>
                    <select
                      id="tone"
                      value={newsTone}
                      onChange={(e) => setNewsTone(e.target.value as 'casual' | 'professional' | 'technical')}
                      disabled={isGenerating}
                      className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu disabled:opacity-50"
                    >
                      <option value="casual">Casual - Conversational and friendly</option>
                      <option value="professional">Professional - Balanced and polished</option>
                      <option value="technical">Technical - Deep and detailed</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isGenerating || !newsTopic.trim()}
                    className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? 'Generating...' : 'Generate Post'}
                  </button>
                </form>
              </div>

              <div>
                <h2 className="text-white text-3xl font-bold font-ubuntu mb-4">
                  All News Posts ({newsPosts.length})
                </h2>

                {loadingPosts ? (
                  <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
                    <p className="text-white/70 font-ubuntu text-xl">Loading posts...</p>
                  </div>
                ) : newsPosts.length === 0 ? (
                  <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
                    <p className="text-white/70 font-ubuntu text-xl">No news posts yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {newsPosts.map((post) => (
                      <div
                        key={post.id}
                        className="bg-[#3a3a3a] rounded-2xl p-6 hover:bg-[#404040] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-white text-2xl font-bold font-ubuntu">
                                {post.title}
                              </h3>
                              <span
                                className={`px-3 py-1 rounded-full text-sm font-ubuntu border ${
                                  post.published
                                    ? 'text-[#4FFFE3] bg-[#4FFFE3]/10 border-[#4FFFE3]'
                                    : 'text-[#E0FF04] bg-[#E0FF04]/10 border-[#E0FF04]'
                                }`}
                              >
                                {post.published ? 'Published' : 'Draft'}
                              </span>
                            </div>
                            <p className="text-white/70 font-ubuntu mb-3">{post.excerpt}</p>
                            {post.banner_image && (
                              <div className="mb-3">
                                <img
                                  src={post.banner_image}
                                  alt="Banner"
                                  className="w-full max-w-md h-32 object-cover rounded-lg"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-4 text-white/50 font-ubuntu text-sm">
                              <span>Slug: {post.slug}</span>
                              <span>
                                Created: {new Date(post.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => setExpandedPostId(expandedPostId === post.id ? null : post.id)}
                              className="px-4 py-2 rounded-lg bg-[#4a4a4a] text-white border border-white/20 font-ubuntu font-bold hover:bg-[#505050] transition-colors"
                            >
                              {expandedPostId === post.id ? 'Hide' : 'Preview'}
                            </button>
                            <button
                              onClick={() => {
                                setGeneratedPost(post)
                                handleGenerateBanners(post.title)
                              }}
                              disabled={isGeneratingBanners}
                              className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500 font-ubuntu font-bold hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                            >
                              {isGeneratingBanners && generatedPost?.id === post.id ? 'Generating...' : 'Add Banner'}
                            </button>
                            <button
                              onClick={() => togglePublishStatus(post.id, post.published)}
                              className={`px-4 py-2 rounded-lg font-ubuntu font-bold border transition-colors ${
                                post.published
                                  ? 'bg-[#E0FF04]/20 text-[#E0FF04] border-[#E0FF04] hover:bg-[#E0FF04]/30'
                                  : 'bg-[#4FFFE3]/20 text-[#4FFFE3] border-[#4FFFE3] hover:bg-[#4FFFE3]/30'
                              }`}
                            >
                              {post.published ? 'Unpublish' : 'Publish'}
                            </button>
                            <button
                              onClick={() => deleteNewsPost(post.id, post.title)}
                              className="px-4 py-2 rounded-lg bg-red-600/20 text-red-500 border border-red-600 font-ubuntu font-bold hover:bg-red-600/30 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {expandedPostId === post.id && (
                          <div className="mt-6 pt-6 border-t border-white/10">
                            <h4 className="text-white text-lg font-bold font-ubuntu mb-4">Full Content Preview:</h4>
                            <div
                              className="text-white/80 font-ubuntu max-w-none [&_h2]:text-white [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-4 [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:mb-4 [&_ul]:ml-6 [&_ul]:list-disc [&_li]:mb-2 [&_strong]:text-white [&_strong]:font-bold"
                              dangerouslySetInnerHTML={{ __html: post.content }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {generatedBanners.length > 0 && generatedPost && (
                <div className="bg-[#3a3a3a] rounded-2xl p-8">
                  <h2 className="text-white text-3xl font-bold font-ubuntu mb-4">
                    Select Banner for "{generatedPost.title}"
                  </h2>
                  <p className="text-white/70 font-ubuntu mb-6">
                    Choose one of the AI-generated banners below to add to your post
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    {generatedBanners.map((imageUrl, index) => (
                      <div key={index} className="relative group">
                        <div
                          className={`relative overflow-hidden rounded-lg cursor-pointer transition-all ${
                            selectedBanner === imageUrl
                              ? 'ring-4 ring-[#4FFFE3]'
                              : 'ring-2 ring-white/20 hover:ring-white/40'
                          }`}
                          onClick={() => setSelectedBanner(imageUrl)}
                        >
                          <img
                            src={imageUrl}
                            alt={`Banner option ${index + 1}`}
                            className="w-full h-48 object-cover"
                          />
                          {selectedBanner === imageUrl && (
                            <div className="absolute inset-0 bg-[#4FFFE3]/20 flex items-center justify-center">
                              <div className="bg-[#4FFFE3] text-neutral-800 px-4 py-2 rounded-full font-ubuntu font-bold">
                                Selected
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        if (selectedBanner) {
                          handleUpdateBanner(generatedPost.id, selectedBanner)
                        }
                      }}
                      disabled={!selectedBanner}
                      className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Apply Selected Banner
                    </button>
                    <button
                      onClick={() => {
                        setGeneratedBanners([])
                        setSelectedBanner(null)
                        setGeneratedPost(null)
                      }}
                      className="px-8 py-3 rounded-full bg-[#4a4a4a] text-white font-ubuntu font-bold hover:bg-[#505050] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-8">
              {loadingAnalytics ? (
                <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
                  <p className="text-white/70 font-ubuntu text-xl">Loading analytics...</p>
                </div>
              ) : analyticsData ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#3a3a3a] rounded-2xl p-6">
                      <h3 className="text-white/70 font-ubuntu text-sm mb-2">Total Submissions</h3>
                      <p className="text-white text-4xl font-bold font-ubuntu">{analyticsData.totalSubmissions}</p>
                      <div className="mt-3 flex gap-3 text-xs font-ubuntu">
                        <span className="text-[#4FFFE3]">✓ {analyticsData.approvedSubmissions}</span>
                        <span className="text-[#E0FF04]">⏳ {analyticsData.pendingSubmissions}</span>
                        <span className="text-red-400">✗ {analyticsData.rejectedSubmissions}</span>
                      </div>
                    </div>

                    <div className="bg-[#3a3a3a] rounded-2xl p-6">
                      <h3 className="text-white/70 font-ubuntu text-sm mb-2">Total Views</h3>
                      <p className="text-white text-4xl font-bold font-ubuntu">{analyticsData.totalViews.toLocaleString()}</p>
                      <p className="mt-3 text-xs text-white/50 font-ubuntu">
                        Across all approved listings
                      </p>
                    </div>

                    <div className="bg-[#3a3a3a] rounded-2xl p-6">
                      <h3 className="text-white/70 font-ubuntu text-sm mb-2">Total Clicks</h3>
                      <p className="text-white text-4xl font-bold font-ubuntu">{analyticsData.totalClicks.toLocaleString()}</p>
                      <p className="mt-3 text-xs text-white/50 font-ubuntu">
                        {analyticsData.totalViews > 0
                          ? `${((analyticsData.totalClicks / analyticsData.totalViews) * 100).toFixed(1)}% CTR`
                          : 'N/A CTR'
                        }
                      </p>
                    </div>

                    <div className="bg-[#3a3a3a] rounded-2xl p-6">
                      <h3 className="text-white/70 font-ubuntu text-sm mb-2">Tier Distribution</h3>
                      <div className="space-y-2 mt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-white/70 text-xs font-ubuntu">Premium</span>
                          <span className="text-[#E0FF04] text-lg font-bold font-ubuntu">{analyticsData.tierBreakdown.premium}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-white/70 text-xs font-ubuntu">Featured</span>
                          <span className="text-[#4FFFE3] text-lg font-bold font-ubuntu">{analyticsData.tierBreakdown.featured}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-white/70 text-xs font-ubuntu">Free</span>
                          <span className="text-white text-lg font-bold font-ubuntu">{analyticsData.tierBreakdown.free}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#3a3a3a] rounded-2xl p-4 sm:p-6 lg:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                      <div>
                        <h2 className="text-white text-xl sm:text-2xl lg:text-3xl font-bold font-ubuntu mb-2">
                          Top Performing Software
                        </h2>
                        <p className="text-white/70 font-ubuntu text-sm sm:text-base">
                          Ranked by total views and engagement
                        </p>
                      </div>
                      <button
                        onClick={fetchAnalytics}
                        className="px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold hover:bg-[#4FFFE3]/30 transition-colors text-sm sm:text-base whitespace-nowrap"
                      >
                        Refresh
                      </button>
                    </div>

                    {analyticsData.topPerformers.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-white/70 font-ubuntu text-lg">No approved submissions yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {analyticsData.topPerformers.map((software, index) => (
                          <div
                            key={software.id}
                            className="bg-[#404040] rounded-xl p-4 sm:p-6 hover:bg-[#454545] transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                              <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] flex items-center justify-center">
                                <span className="text-neutral-800 text-lg sm:text-xl font-bold font-ubuntu">#{index + 1}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <h3 className="text-white text-base sm:text-lg lg:text-xl font-bold font-ubuntu break-words">
                                    {software.title}
                                  </h3>
                                  <span
                                    className={`px-2 sm:px-3 py-1 rounded-full text-xs font-ubuntu border ${
                                      software.tier === 'premium'
                                        ? 'text-[#E0FF04] bg-[#E0FF04]/10 border-[#E0FF04]'
                                        : software.tier === 'featured'
                                        ? 'text-[#4FFFE3] bg-[#4FFFE3]/10 border-[#4FFFE3]'
                                        : 'text-white/70 bg-white/10 border-white/30'
                                    }`}
                                  >
                                    {software.tier}
                                  </span>
                                </div>
                                <a
                                  href={software.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#4FFFE3] text-xs sm:text-sm font-ubuntu hover:underline block mb-2 break-all"
                                >
                                  {software.url}
                                </a>
                                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4 lg:gap-6 text-xs sm:text-sm">
                                  <div>
                                    <span className="text-white/50 font-ubuntu">Views: </span>
                                    <span className="text-white font-bold font-ubuntu">{software.view_count.toLocaleString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-white/50 font-ubuntu">Clicks: </span>
                                    <span className="text-white font-bold font-ubuntu">{software.total_clicks.toLocaleString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-white/50 font-ubuntu">CTR: </span>
                                    <span className="text-white font-bold font-ubuntu">
                                      {software.view_count > 0
                                        ? `${((software.total_clicks / software.view_count) * 100).toFixed(1)}%`
                                        : 'N/A'
                                      }
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-white/50 font-ubuntu">Listed: </span>
                                    <span className="text-white/90 font-ubuntu">
                                      {new Date(software.submitted_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
                  <p className="text-white/70 font-ubuntu text-xl">Failed to load analytics</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-8">
              <div className="bg-[#3a3a3a] rounded-2xl p-4 sm:p-6 lg:p-8">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                  <div className="flex-1">
                    <h2 className="text-white text-xl sm:text-2xl lg:text-3xl font-bold font-ubuntu mb-2">
                      All Users ({users.length})
                    </h2>
                    <p className="text-white/70 font-ubuntu text-sm sm:text-base mb-3">
                      Manage all users across Free, Featured, and Premium tiers
                    </p>
                    <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
                      <span className="text-white/60 font-ubuntu">
                        Free: {users.filter(u => u.tier === 'free').length}
                      </span>
                      <span className="text-white/60 font-ubuntu">
                        Featured: {users.filter(u => u.tier === 'featured').length}
                      </span>
                      <span className="text-white/60 font-ubuntu">
                        Premium: {users.filter(u => u.tier === 'premium').length}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={fetchUsers}
                    className="px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold hover:bg-[#4FFFE3]/30 transition-colors text-sm sm:text-base whitespace-nowrap"
                  >
                    Refresh
                  </button>
                </div>

                {loadingUsers ? (
                  <div className="text-center py-8">
                    <p className="text-white/70 font-ubuntu text-lg">Loading users...</p>
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-white/70 font-ubuntu text-lg">No users yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {users.map((user, index) => (
                      <div
                        key={index}
                        className="bg-[#404040] rounded-xl p-4 sm:p-6 hover:bg-[#454545] transition-colors"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <h3 className="text-white text-base sm:text-lg lg:text-xl font-bold font-ubuntu break-all">
                                {user.email}
                              </h3>
                              <span
                                className={`px-3 py-1 rounded-full text-sm font-ubuntu border ${
                                  user.tier === 'premium'
                                    ? 'text-[#E0FF04] bg-[#E0FF04]/10 border-[#E0FF04]'
                                    : user.tier === 'featured'
                                    ? 'text-[#4FFFE3] bg-[#4FFFE3]/10 border-[#4FFFE3]'
                                    : 'text-white/70 bg-white/10 border-white/30'
                                }`}
                              >
                                {user.tier.charAt(0).toUpperCase() + user.tier.slice(1)}
                              </span>
                              <button
                                onClick={() => toggleUserSubmissions(user.email)}
                                className="px-3 py-1 rounded-full text-xs font-ubuntu bg-white/5 text-white/60 border border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
                              >
                                {user.submission_count} {user.submission_count === 1 ? 'submission' : 'submissions'}
                              </button>
                              {user.subscription_status && (
                                <span
                                  className={`px-3 py-1 rounded-full text-xs font-ubuntu border ${
                                    user.subscription_status === 'active'
                                      ? 'text-green-400 bg-green-400/10 border-green-400'
                                      : user.subscription_status === 'canceled'
                                      ? 'text-red-400 bg-red-400/10 border-red-400'
                                      : 'text-yellow-400 bg-yellow-400/10 border-yellow-400'
                                  }`}
                                >
                                  {user.subscription_status}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                              <div>
                                <span className="text-white/50 font-ubuntu">Joined:</span>
                                <span className="text-white/90 font-ubuntu ml-2">
                                  {new Date(user.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              {user.expires_at && (
                                <div>
                                  <span className="text-white/50 font-ubuntu">Token Expires:</span>
                                  <span className="text-white/90 font-ubuntu ml-2">
                                    {new Date(user.expires_at).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className="text-white/50 font-ubuntu">Last Activity:</span>
                                <span className="text-white/90 font-ubuntu ml-2">
                                  {user.last_submission_at
                                    ? new Date(user.last_submission_at).toLocaleDateString()
                                    : user.last_used_at
                                    ? new Date(user.last_used_at).toLocaleDateString()
                                    : 'Never'}
                                </span>
                              </div>
                              {user.subscription_end && (
                                <div>
                                  <span className="text-white/50 font-ubuntu">Subscription End:</span>
                                  <span className="text-white/90 font-ubuntu ml-2">
                                    {new Date(user.subscription_end * 1000).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                            </div>
                            {user.cancel_at_period_end && (
                              <div className="mt-3 px-3 py-2 bg-yellow-400/10 border border-yellow-400/30 rounded-lg">
                                <p className="text-yellow-400 text-sm font-ubuntu">
                                  ⚠ Subscription will cancel at period end
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
                            {user.submission_count > 0 && (
                              <button
                                onClick={() => toggleUserSubmissions(user.email)}
                                className="px-3 sm:px-4 py-2 rounded-lg bg-white/10 text-white border border-white/20 font-ubuntu font-bold hover:bg-white/20 transition-colors text-xs sm:text-sm"
                              >
                                {expandedUserId === user.email ? 'Hide' : 'View'} Submissions
                              </button>
                            )}
                            <a
                              href={`mailto:${user.email}`}
                              className="px-3 sm:px-4 py-2 rounded-lg bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold hover:bg-[#4FFFE3]/30 transition-colors text-center text-xs sm:text-sm"
                            >
                              Email
                            </a>
                            {user.tier === 'free' && (
                              <>
                                <button
                                  onClick={() => handleUpgradeUser(user.email, 'featured')}
                                  className="px-3 sm:px-4 py-2 rounded-lg bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold hover:bg-[#4FFFE3]/30 transition-colors text-xs sm:text-sm"
                                >
                                  → Featured
                                </button>
                                <button
                                  onClick={() => handleUpgradeUser(user.email, 'premium')}
                                  className="px-3 sm:px-4 py-2 rounded-lg bg-[#E0FF04]/20 text-[#E0FF04] border border-[#E0FF04] font-ubuntu font-bold hover:bg-[#E0FF04]/30 transition-colors text-xs sm:text-sm"
                                >
                                  → Premium
                                </button>
                              </>
                            )}
                            {user.tier === 'featured' && (
                              <>
                                <button
                                  onClick={() => handleUpgradeUser(user.email, 'premium')}
                                  className="px-3 sm:px-4 py-2 rounded-lg bg-[#E0FF04]/20 text-[#E0FF04] border border-[#E0FF04] font-ubuntu font-bold hover:bg-[#E0FF04]/30 transition-colors text-xs sm:text-sm"
                                >
                                  → Premium
                                </button>
                                <button
                                  onClick={() => handleDowngradeUser(user.email)}
                                  className="px-3 sm:px-4 py-2 rounded-lg bg-white/10 text-white/70 border border-white/30 font-ubuntu font-bold hover:bg-white/20 transition-colors text-xs sm:text-sm"
                                >
                                  → Free
                                </button>
                              </>
                            )}
                            {user.tier === 'premium' && (
                              <button
                                onClick={() => handleDowngradeUser(user.email)}
                                className="px-3 sm:px-4 py-2 rounded-lg bg-white/10 text-white/70 border border-white/30 font-ubuntu font-bold hover:bg-white/20 transition-colors text-xs sm:text-sm"
                              >
                                → Free
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteUser(user.email)}
                              className="px-3 sm:px-4 py-2 rounded-lg bg-red-600/20 text-red-500 border border-red-600 font-ubuntu font-bold hover:bg-red-600/30 transition-colors text-xs sm:text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {expandedUserId === user.email && userSubmissions[user.email] && (
                          <div className="mt-6 pt-6 border-t border-white/10">
                            <h4 className="text-white text-lg font-bold font-ubuntu mb-4">
                              Submissions for {user.email}
                            </h4>
                            <div className="space-y-3">
                              {userSubmissions[user.email].map((submission) => (
                                <div
                                  key={submission.id}
                                  className="bg-[#3a3a3a] rounded-lg p-4 hover:bg-[#404040] transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3 mb-2">
                                        {submission.logo && (
                                          <img
                                            src={submission.logo}
                                            alt={`${submission.title} logo`}
                                            className="w-10 h-10 rounded-lg bg-white p-1 object-contain"
                                            onError={(e) => {
                                              e.currentTarget.style.display = 'none'
                                            }}
                                          />
                                        )}
                                        <div className="flex-1">
                                          <h5 className="text-white text-base font-bold font-ubuntu">
                                            {submission.title}
                                          </h5>
                                          <a
                                            href={submission.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[#4FFFE3] text-sm font-ubuntu hover:underline"
                                          >
                                            {submission.url}
                                          </a>
                                        </div>
                                        <span
                                          className={`px-3 py-1 rounded-full text-xs font-ubuntu border ${getStatusColor(
                                            submission.status
                                          )}`}
                                        >
                                          {submission.status}
                                        </span>
                                        <span
                                          className={`px-3 py-1 rounded-full text-xs font-ubuntu border ${
                                            submission.tier === 'premium'
                                              ? 'text-[#E0FF04] bg-[#E0FF04]/10 border-[#E0FF04]'
                                              : submission.tier === 'featured'
                                              ? 'text-[#4FFFE3] bg-[#4FFFE3]/10 border-[#4FFFE3]'
                                              : 'text-white/70 bg-white/10 border-white/30'
                                          }`}
                                        >
                                          {submission.tier}
                                        </span>
                                      </div>
                                      <p className="text-white/70 text-sm font-ubuntu mb-2">
                                        {submission.description}
                                      </p>
                                      <div className="flex gap-4 text-xs text-white/50 font-ubuntu">
                                        <span>Category: {submission.category}</span>
                                        <span>
                                          Submitted: {new Date(submission.submitted_at).toLocaleDateString()}
                                        </span>
                                        {submission.tags && submission.tags.length > 0 && (
                                          <span>Tags: {submission.tags.join(', ')}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      {submission.status !== 'approved' && (
                                        <button
                                          onClick={() => updateSubmissionStatus(submission.id, 'approved')}
                                          className="px-3 py-1 rounded-lg bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu text-xs font-bold hover:bg-[#4FFFE3]/30 transition-colors"
                                        >
                                          Approve
                                        </button>
                                      )}
                                      {submission.status !== 'rejected' && (
                                        <button
                                          onClick={() => updateSubmissionStatus(submission.id, 'rejected')}
                                          className="px-3 py-1 rounded-lg bg-red-400/20 text-red-400 border border-red-400 font-ubuntu text-xs font-bold hover:bg-red-400/30 transition-colors"
                                        >
                                          Reject
                                        </button>
                                      )}
                                      <button
                                        onClick={() => deleteSubmission(submission.id, submission.title)}
                                        className="px-3 py-1 rounded-lg bg-red-600/20 text-red-500 border border-red-600 font-ubuntu text-xs font-bold hover:bg-red-600/30 transition-colors"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-8">
              <div className="bg-[#3a3a3a] rounded-2xl p-4 sm:p-6 lg:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-white text-xl sm:text-2xl lg:text-3xl font-bold font-ubuntu mb-2">
                      Comment Moderation
                    </h2>
                    <p className="text-white/70 font-ubuntu text-sm sm:text-base">
                      Review and approve pending comments
                    </p>
                  </div>
                  <button
                    onClick={fetchComments}
                    className="px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold hover:bg-[#4FFFE3]/30 transition-colors text-sm sm:text-base whitespace-nowrap"
                  >
                    Refresh
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 sm:gap-3 mb-6">
                  <button
                    onClick={() => setCommentFilter('all')}
                    className={`px-3 sm:px-4 py-2 rounded-full font-ubuntu font-bold transition-all text-xs sm:text-sm ${
                      commentFilter === 'all'
                        ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                        : 'bg-[#4a4a4a] text-white hover:bg-[#555555]'
                    }`}
                  >
                    All ({comments.length})
                  </button>
                  <button
                    onClick={() => setCommentFilter('pending')}
                    className={`px-3 sm:px-4 py-2 rounded-full font-ubuntu font-bold transition-all text-xs sm:text-sm ${
                      commentFilter === 'pending'
                        ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                        : 'bg-[#4a4a4a] text-white hover:bg-[#555555]'
                    }`}
                  >
                    Pending ({comments.filter(c => !c.is_verified).length})
                  </button>
                  <button
                    onClick={() => setCommentFilter('approved')}
                    className={`px-3 sm:px-4 py-2 rounded-full font-ubuntu font-bold transition-all text-xs sm:text-sm ${
                      commentFilter === 'approved'
                        ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                        : 'bg-[#4a4a4a] text-white hover:bg-[#555555]'
                    }`}
                  >
                    Approved ({comments.filter(c => c.is_verified).length})
                  </button>
                </div>

                {loadingComments ? (
                  <div className="text-center py-8">
                    <p className="text-white/70 font-ubuntu text-lg">Loading comments...</p>
                  </div>
                ) : comments.filter(c => commentFilter === 'all' || (commentFilter === 'pending' && !c.is_verified) || (commentFilter === 'approved' && c.is_verified)).length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-white/70 font-ubuntu text-lg">No {commentFilter === 'all' ? '' : commentFilter} comments</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments
                      .filter(c => commentFilter === 'all' || (commentFilter === 'pending' && !c.is_verified) || (commentFilter === 'approved' && c.is_verified))
                      .map((comment) => (
                        <div
                          key={comment.id}
                          className="bg-[#404040] rounded-xl p-4 sm:p-6 hover:bg-[#454545] transition-colors"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-start gap-4 mb-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <h3 className="text-white text-base sm:text-lg font-bold font-ubuntu break-words">
                                  {comment.author_name}
                                </h3>
                                <span className="text-white/50 font-ubuntu text-xs sm:text-sm break-all">
                                  {comment.author_email}
                                </span>
                                {comment.is_verified ? (
                                  <span className="px-2 py-1 rounded-full text-xs font-ubuntu bg-green-500/20 text-green-400 border border-green-500/30">
                                    Approved
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 rounded-full text-xs font-ubuntu bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                    Pending
                                  </span>
                                )}
                                {comment.rating && (
                                  <div className="flex items-center gap-1">
                                    {[...Array(comment.rating)].map((_, i) => (
                                      <svg key={i} className="w-4 h-4 text-[#E0FF04]" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                      </svg>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {comment.submission && (
                                <p className="text-white/50 font-ubuntu text-sm mb-2">
                                  On: <span className="text-[#4FFFE3]">{comment.submission.title}</span>
                                </p>
                              )}
                              <p className="text-white/70 font-ubuntu text-xs sm:text-sm mb-2">
                                {new Date(comment.created_at).toLocaleString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                              <p className="text-white font-ubuntu leading-relaxed text-sm sm:text-base break-words">
                                {comment.content}
                              </p>
                            </div>
                            <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
                              {!comment.is_verified && (
                                <button
                                  onClick={() => moderateComment(comment.id, 'approve')}
                                  className="px-3 sm:px-4 py-2 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-ubuntu font-bold hover:bg-green-500/30 transition-colors text-xs sm:text-sm whitespace-nowrap"
                                >
                                  Approve
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setConfirmDialog({
                                    title: 'Delete Comment',
                                    message: 'Are you sure you want to delete this comment? This action cannot be undone.',
                                    confirmColor: 'danger',
                                    onConfirm: () => {
                                      setConfirmDialog(null)
                                      moderateComment(comment.id, 'reject')
                                    }
                                  })
                                }}
                                className="px-3 sm:px-4 py-2 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-ubuntu font-bold hover:bg-red-500/30 transition-colors text-xs sm:text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <Footer />
      </div>

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
          confirmText="Confirm"
          cancelText="Cancel"
          confirmColor={confirmDialog.confirmColor || 'primary'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}
