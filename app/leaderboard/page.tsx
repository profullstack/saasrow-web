import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { EarnKarmaNudge } from '@/components/EarnKarmaNudge'
import { karmaRules, leaderboard } from '@/lib/karma'
import { KARMA_PER_CREDIT, PERIODS, parsePeriod, type Period } from '@/lib/karmaRules'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Karma leaderboard',
  description:
    'The most helpful SaaSRow members this week: karma for upvotes, reviews, comments and shares. Every 500 karma is a free Featured week.',
  alternates: { canonical: '/leaderboard' },
}

const PERIOD_LABEL: Record<Period, string> = { week: 'This week', month: 'This month', all: 'All time' }
const MEDAL = ['🥇', '🥈', '🥉']

type Props = { searchParams: Promise<{ period?: string }> }

export default async function LeaderboardPage({ searchParams }: Props) {
  const period = parsePeriod((await searchParams).period)
  const [rows, rules] = await Promise.all([
    leaderboard(period, 50).catch(() => []),
    karmaRules().catch(() => []),
  ])

  return (
    <div className="min-h-screen bg-neutral-800">
      <div className="absolute w-full h-1/2 top-0 left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1000px] mx-auto px-4 py-12">
          <div className="text-center mb-10">
            <h1 className="text-white text-4xl md:text-5xl font-bold font-ubuntu mb-4">Karma leaderboard</h1>
            <p className="text-white/70 text-lg font-ubuntu max-w-2xl mx-auto">
              Upvote, review, comment on and share the products you use. Every {KARMA_PER_CREDIT} karma is a free
              Featured week for your own product. Same points as{' '}
              <a href="https://built.indie.pit.world/leaderboard" className="text-[#4FFFE3] hover:underline">built.indie</a> and{' '}
              <a href="https://pwamart.com/leaderboard" className="text-[#4FFFE3] hover:underline">pwamart</a>.
            </p>
          </div>

          <nav className="flex justify-center gap-2 mb-8" aria-label="Period">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={p === 'week' ? '/leaderboard' : `/leaderboard?period=${p}`}
                aria-current={p === period ? 'page' : undefined}
                className={`px-5 py-2 rounded-full font-ubuntu transition-colors ${
                  p === period
                    ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-bold'
                    : 'bg-[#3a3a3a] text-white hover:bg-[#4a4a4a]'
                }`}
              >
                {PERIOD_LABEL[p]}
              </Link>
            ))}
          </nav>

          <section className="bg-[#3a3a3a] rounded-2xl p-4 md:p-8 mb-10">
            {rows.length === 0 ? (
              <p className="text-center text-white/70 font-ubuntu py-8">
                Nobody has earned karma {period === 'all' ? 'yet' : PERIOD_LABEL[period].toLowerCase()}. The top spot is
                one upvote away.
              </p>
            ) : (
              <ol className="divide-y divide-white/10">
                {rows.map((r) => (
                  <li key={r.player} className="flex items-center gap-4 py-3">
                    <span className="w-10 text-center font-ubuntu font-bold text-white/70">
                      {MEDAL[r.rank - 1] ?? `#${r.rank}`}
                    </span>
                    <span className="flex-1 text-white font-ubuntu truncate">{r.name}</span>
                    <span className="font-ubuntu font-bold text-[#4FFFE3]">{r.karma.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="text-center">
              <EarnKarmaNudge />
            </div>
          </section>

          <section className="bg-[#3a3a3a] rounded-2xl p-4 md:p-8">
            <h2 className="text-white text-2xl font-bold font-ubuntu mb-4">How to earn karma</h2>
            <table className="w-full text-left font-ubuntu">
              <tbody className="divide-y divide-white/10">
                {rules.map((r: { action: string; points: number; label: string; rule: string }) => (
                  <tr key={r.action}>
                    <td className="py-3 pr-4 text-[#E0FF04] font-bold whitespace-nowrap">+{r.points}</td>
                    <td className="py-3">
                      <span className="text-white">{r.label}</span>
                      <span className="block text-white/50 text-sm">{r.rule}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-white/50 text-sm font-ubuntu mt-4">
              Staff accounts earn nothing and are never ranked. Agents and scripts can read this board at{' '}
              <code className="text-white/70">/api/v1/karma/leaderboard</code>.
            </p>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  )
}
