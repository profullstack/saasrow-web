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
  recentClicks: Array<{
    clicked_at: string
    referrer: string | null
  }>
}

interface PremiumAnalyticsProps {
  submissionId: string
  token: string
}

export function PremiumAnalytics({ submissionId, token }: PremiumAnalyticsProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTab, setSelectedTab] = useState<'overview' | 'traffic' | 'performance'>('overview')

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
  const last30Days = analytics.dailyStats
  const last30DaysViews = last30Days.reduce((sum, day) => sum + day.views, 0)
  const last30DaysClicks = last30Days.reduce((sum, day) => sum + day.clicks, 0)

  const maxViews = Math.max(...last30Days.map(d => d.views), 1)
  const maxClicks = Math.max(...last30Days.map(d => d.clicks), 1)

  const referrerCounts = analytics.recentClicks.reduce((acc, click) => {
    const referrer = click.referrer || 'Direct'
    acc[referrer] = (acc[referrer] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const topReferrers = Object.entries(referrerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const avgDailyViews = last30Days.length > 0 ? Math.round(last30DaysViews / last30Days.length) : 0
  const avgDailyClicks = last30Days.length > 0 ? Math.round(last30DaysClicks / last30Days.length) : 0

  return (
    <div className="space-y-6">
      <div className="bg-[#3a3a3a] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white text-xl font-bold font-ubuntu flex items-center gap-2">
            <svg className="w-6 h-6 text-[#4FFFE3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Advanced Analytics Dashboard
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedTab('overview')}
              className={`px-4 py-2 rounded-lg font-ubuntu text-sm font-bold transition-colors ${
                selectedTab === 'overview'
                  ? 'bg-gradient-to-r from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                  : 'bg-[#2a2a2a] text-white/60 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setSelectedTab('traffic')}
              className={`px-4 py-2 rounded-lg font-ubuntu text-sm font-bold transition-colors ${
                selectedTab === 'traffic'
                  ? 'bg-gradient-to-r from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                  : 'bg-[#2a2a2a] text-white/60 hover:text-white'
              }`}
            >
              Traffic
            </button>
            <button
              onClick={() => setSelectedTab('performance')}
              className={`px-4 py-2 rounded-lg font-ubuntu text-sm font-bold transition-colors ${
                selectedTab === 'performance'
                  ? 'bg-gradient-to-r from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                  : 'bg-[#2a2a2a] text-white/60 hover:text-white'
              }`}
            >
              Performance
            </button>
          </div>
        </div>

        {selectedTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-[#2a2a2a] rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/60 text-sm font-ubuntu mb-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Total Views (30d)
                </div>
                <div className="text-white text-2xl font-bold font-ubuntu">
                  {last30DaysViews.toLocaleString()}
                </div>
                <div className="text-[#4FFFE3] text-xs font-ubuntu mt-1">
                  {avgDailyViews}/day avg
                </div>
              </div>

              <div className="bg-[#2a2a2a] rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/60 text-sm font-ubuntu mb-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  Total Clicks (30d)
                </div>
                <div className="text-white text-2xl font-bold font-ubuntu">
                  {last30DaysClicks.toLocaleString()}
                </div>
                <div className="text-[#E0FF04] text-xs font-ubuntu mt-1">
                  {avgDailyClicks}/day avg
                </div>
              </div>

              <div className="bg-[#2a2a2a] rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/60 text-sm font-ubuntu mb-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  Click-Through Rate
                </div>
                <div className="text-white text-2xl font-bold font-ubuntu">
                  {analytics.clickThroughRate}%
                </div>
              </div>

              <div className="bg-[#2a2a2a] rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/60 text-sm font-ubuntu mb-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Traffic Sources
                </div>
                <div className="text-white text-2xl font-bold font-ubuntu">
                  {topReferrers.length}
                </div>
              </div>

              <div className="bg-[#2a2a2a] rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/60 text-sm font-ubuntu mb-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  Community Votes
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[#4FFFE3] text-xl font-bold font-ubuntu">{analytics.upvotes}</span>
                    <svg className="w-3 h-3 text-[#4FFFE3]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-red-400 text-xl font-bold font-ubuntu">{analytics.downvotes}</span>
                    <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-white font-ubuntu font-bold mb-4">30-Day Trend</h4>
              <div className="bg-[#2a2a2a] rounded-xl p-4">
                <div className="flex items-end gap-1 h-32">
                  {last30Days.map((day, index) => (
                    <div key={day.date} className="flex-1 flex flex-col justify-end gap-1">
                      <div
                        className="bg-[#4FFFE3] rounded-t transition-all hover:opacity-80"
                        style={{ height: `${(day.views / maxViews) * 100}%` }}
                        title={`${day.views} views`}
                      />
                      <div
                        className="bg-[#E0FF04] rounded-t transition-all hover:opacity-80"
                        style={{ height: `${(day.clicks / maxClicks) * 50}%` }}
                        title={`${day.clicks} clicks`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-4 text-xs font-ubuntu">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-[#4FFFE3] rounded" />
                    <span className="text-white/60">Views</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-[#E0FF04] rounded" />
                    <span className="text-white/60">Clicks</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'traffic' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-white font-ubuntu font-bold mb-4">Top Traffic Sources</h4>
              <div className="space-y-3">
                {topReferrers.map(([referrer, count]) => {
                  const percentage = (count / analytics.recentClicks.length) * 100
                  return (
                    <div key={referrer} className="bg-[#2a2a2a] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-ubuntu">{referrer}</span>
                        <span className="text-[#4FFFE3] font-ubuntu font-bold">{count} clicks</span>
                      </div>
                      <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-[#E0FF04] to-[#4FFFE3] h-2 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                {topReferrers.length === 0 && (
                  <p className="text-white/40 text-center py-8 font-ubuntu">No traffic data yet</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-white font-ubuntu font-bold mb-4">Recent Activity</h4>
              <div className="bg-[#2a2a2a] rounded-xl p-4 max-h-64 overflow-y-auto">
                {analytics.recentClicks.slice(0, 20).map((click, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <span className="text-white/60 text-sm font-ubuntu">
                      {click.referrer || 'Direct'}
                    </span>
                    <span className="text-white/40 text-xs font-ubuntu">
                      {new Date(click.clicked_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'performance' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-white font-ubuntu font-bold mb-4">Daily Performance</h4>
              <div className="space-y-2">
                {last7Days.reverse().map((day) => {
                  const ctr = day.views > 0 ? ((day.clicks / day.views) * 100).toFixed(2) : '0.00'
                  return (
                    <div key={day.date} className="bg-[#2a2a2a] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-ubuntu font-bold">
                          {new Date(day.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        <span className="text-[#4FFFE3] text-sm font-ubuntu">{ctr}% CTR</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-white/60 font-ubuntu">Views: </span>
                          <span className="text-white font-bold">{day.views}</span>
                        </div>
                        <div>
                          <span className="text-white/60 font-ubuntu">Clicks: </span>
                          <span className="text-white font-bold">{day.clicks}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {last7Days.length === 0 && (
                  <p className="text-white/40 text-center py-8 font-ubuntu">No performance data yet</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
