'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EarnKarmaNudge } from './EarnKarmaNudge'

interface Row {
  rank: number
  player: string
  name: string
  karma: number
}

/** Top five this week (all time when the week is empty), for the Community page. */
export function TopKarma() {
  const [rows, setRows] = useState<Row[]>([])
  const [period, setPeriod] = useState<'week' | 'all'>('week')

  useEffect(() => {
    const load = async (p: 'week' | 'all') => {
      const res = await fetch(`/api/v1/karma/leaderboard?period=${p}&limit=5`)
      return res.ok ? ((await res.json()).rows as Row[]) : []
    }
    load('week')
      .then(async (week) => {
        if (week.length) return setRows(week)
        setPeriod('all')
        setRows(await load('all'))
      })
      .catch(() => undefined)
  }, [])

  return (
    <section className="bg-[#3a3a3a] rounded-2xl p-6 mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white text-xl font-bold font-ubuntu">
          Top karma {period === 'week' ? 'this week' : 'all time'}
        </h2>
        <Link href="/leaderboard" className="text-[#4FFFE3] font-ubuntu text-sm hover:underline">
          Full leaderboard
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-white/60 font-ubuntu">No karma earned yet. The first upvote takes the top spot.</p>
      ) : (
        <ol className="divide-y divide-white/10">
          {rows.map((r) => (
            <li key={r.player} className="flex gap-4 py-2 font-ubuntu">
              <span className="w-8 text-white/60">#{r.rank}</span>
              <span className="flex-1 text-white truncate">{r.name}</span>
              <span className="text-[#4FFFE3] font-bold">{r.karma.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
      <EarnKarmaNudge />
    </section>
  )
}
