'use client'

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'

/** Shows "+1 karma" for a moment after a vote, comment or share pays. */
export function KarmaToast() {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = (e: Event) => {
      setText((e as CustomEvent<string>).detail)
      clearTimeout(timer)
      timer = setTimeout(() => setText(null), 2500)
    }
    window.addEventListener('saasrow-karma-toast', show)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('saasrow-karma-toast', show)
    }
  }, [])

  if (!text) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold shadow-lg flex items-center gap-2"
    >
      <Zap className="w-4 h-4" />
      {text}
    </div>
  )
}
