import { useState, useEffect } from 'react'

interface AnalyticsData {
  tier: string
  totalViews: number
  totalClicks: number
  clickThroughRate: number
  upvotes: number
  downvotes: number
  dailyStats: Array<{
    date: string
    views: number
    clicks: number
    unique_visitors: number
  }>
}

interface BasicAnalyticsProps {
  submissionId: string
  token: string
}

export function BasicAnalytics({ submissionId, token }: BasicAnalyticsProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAnalytics()
  }, [submissionId, token])

  const fetchAnalytics = async () => {
    setLoading(true)
    setError(null)
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-analytics`
      const response = await fetch(
        `${apiUrl}?token=${encodeURIComponent(token)}&submissionId=${submissionId}`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      )

      if (response.ok) {
        const data = await response.json()
        setAnalytics(data)
      } else {
        setError('Failed to load analytics')
      }
    } catch (err) {
      console.error('Error fetching analytics:', err)
      setError('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-[#3a3a3a] rounded-2xl p-6">
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4FFFE3]" />
        </div>
      </div>
    )
  }

  if (error || !analytics) {
    return (
      <div className="bg-[#3a3a3a] rounded-2xl p-6">
        <p className="text-white/60 text-center">{error || 'No analytics available'}</p>
      </div>
    )
  }

  const last7Days = analytics.dailyStats.slice(-7)
  const last30DaysViews = analytics.dailyStats.reduce((sum, day) => sum + day.views, 0)
  const last30DaysClicks = analytics.dailyStats.reduce((sum, day) => sum + day.clicks, 0)

  return (
    <div className="space-y-6">
      <div className="bg-[#3a3a3a] rounded-2xl p-6">
        <h3 className="text-white text-xl font-bold font-ubuntu mb-6 flex items-center gap-2">
          <svg className="w-6 h-6 text-[#4FFFE3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Monthly Performance
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#2a2a2a] rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/60 text-sm font-ubuntu mb-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Total Views (30d)
            </div>
            <div className="text-white text-3xl font-bold font-ubuntu">
              {last30DaysViews.toLocaleString()}
            </div>
          </div>

          <div className="bg-[#2a2a2a] rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/60 text-sm font-ubuntu mb-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              Total Clicks (30d)
            </div>
            <div className="text-white text-3xl font-bold font-ubuntu">
              {last30DaysClicks.toLocaleString()}
            </div>
          </div>

          <div className="bg-[#2a2a2a] rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/60 text-sm font-ubuntu mb-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Click-Through Rate
            </div>
            <div className="text-white text-3xl font-bold font-ubuntu">
              {analytics.clickThroughRate}%
            </div>
          </div>

          <div className="bg-[#2a2a2a] rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/60 text-sm font-ubuntu mb-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Community Votes
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-[#4FFFE3] text-2xl font-bold font-ubuntu">{analytics.upvotes}</span>
                <svg className="w-4 h-4 text-[#4FFFE3]" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-red-400 text-2xl font-bold font-ubuntu">{analytics.downvotes}</span>
                <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-white font-ubuntu font-bold mb-4">Last 7 Days Activity</h4>
          <div className="space-y-2">
            {last7Days.map((day) => (
              <div key={day.date} className="flex items-center justify-between bg-[#2a2a2a] rounded-lg p-3">
                <span className="text-white/70 font-ubuntu text-sm">
                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <div className="flex gap-4">
                  <span className="text-white/60 text-sm font-ubuntu">
                    <span className="text-[#4FFFE3]">{day.views}</span> views
                  </span>
                  <span className="text-white/60 text-sm font-ubuntu">
                    <span className="text-[#E0FF04]">{day.clicks}</span> clicks
                  </span>
                </div>
              </div>
            ))}
            {last7Days.length === 0 && (
              <p className="text-white/40 text-center py-4 font-ubuntu">No activity in the last 7 days</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-[#E0FF04]/10 to-[#4FFFE3]/10 border-2 border-[#4FFFE3] rounded-2xl p-6">
        <h4 className="text-white text-lg font-bold font-ubuntu mb-2">Upgrade to Premium</h4>
        <p className="text-white/70 font-ubuntu mb-4">
          Get advanced analytics with hourly breakdowns, traffic sources, geographic data, and more.
        </p>
        <a
          href="/featured"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#E0FF04] to-[#4FFFE3] text-neutral-800 rounded-full font-ubuntu font-bold hover:opacity-90 transition-opacity"
        >
          Upgrade Now
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </a>
      </div>
    </div>
  )
}
