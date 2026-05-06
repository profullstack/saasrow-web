import { useEffect, useState } from 'react'

interface DiscountPopupProps {
  onClose: () => void
  onApplyDiscount: (billingPeriod: 'yearly' | 'monthly') => void
  currentBillingPeriod: 'yearly' | 'monthly'
}

export function DiscountPopup({ onClose, onApplyDiscount, currentBillingPeriod }: DiscountPopupProps) {
  const [copied, setCopied] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<'yearly' | 'monthly'>(currentBillingPeriod)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [])

  const handleCopyCode = () => {
    navigator.clipboard.writeText('50OFF')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded-3xl p-8 max-w-md w-full border border-[#4FFFE3]/20 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#E0FF04] to-[#4FFFE3] mb-4">
            <svg className="w-8 h-8 text-neutral-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </div>
          <h2 className="text-white text-3xl font-bold font-ubuntu mb-2">
            Wait! Don't Go Yet
          </h2>
          <p className="text-white/70 font-ubuntu text-lg">
            Get 50% off your subscription today
          </p>
        </div>

        <div className="mb-6">
          <p className="text-white/60 font-ubuntu text-sm mb-3 text-center">
            Choose your billing period:
          </p>
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`flex-1 py-3 px-4 rounded-xl font-ubuntu font-medium transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-[#4FFFE3] text-neutral-800'
                  : 'bg-[#3a3a3a] text-white/70 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`flex-1 py-3 px-4 rounded-xl font-ubuntu font-medium transition-all ${
                billingPeriod === 'yearly'
                  ? 'bg-[#4FFFE3] text-neutral-800'
                  : 'bg-[#3a3a3a] text-white/70 hover:text-white'
              }`}
            >
              <div>
                Yearly
                <span className="block text-xs opacity-70">Save 20%</span>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-black/30 rounded-2xl p-6 mb-6 border border-[#4FFFE3]/30">
          <p className="text-white/60 font-ubuntu text-sm mb-3 text-center">
            Use this exclusive discount code:
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="flex-1 bg-[#3a3a3a] rounded-lg px-4 py-3 border-2 border-dashed border-[#4FFFE3]">
              <p className="text-[#4FFFE3] font-ubuntu font-bold text-2xl text-center tracking-wider">
                50OFF
              </p>
            </div>
            <button
              onClick={handleCopyCode}
              className="px-4 py-3 bg-[#4a4a4a] hover:bg-[#555555] text-white rounded-lg transition-colors font-ubuntu text-sm"
            >
              {copied ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => onApplyDiscount(billingPeriod)}
            className="w-full py-4 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold text-lg hover:opacity-90 transition-opacity"
          >
            Apply Discount & Continue
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 text-white/50 hover:text-white font-ubuntu transition-colors"
          >
            No thanks, I'll pay full price
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-white/40 text-xs font-ubuntu">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Limited time offer</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>One-time use</span>
          </div>
        </div>
      </div>
    </div>
  )
}
