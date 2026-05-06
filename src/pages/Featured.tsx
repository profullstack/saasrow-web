import { useState, useEffect } from 'react'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { DiscountPopup } from '../components/DiscountPopup'
import { Alert } from '../components/Alert'
import { supabase } from '../lib/supabase'
import { trackEvent, analyticsEvents } from '../lib/analytics'

export default function FeaturedPage() {
  const [billingPeriod, setBillingPeriod] = useState<'yearly' | 'monthly'>('yearly')
  const [showDiscountPopup, setShowDiscountPopup] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [processingPlan, setProcessingPlan] = useState<string | null>(null)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [email, setEmail] = useState('')
  const [pendingPlan, setPendingPlan] = useState<typeof pricingPlans[0] | null>(null)
  const [pendingDiscount, setPendingDiscount] = useState<string | undefined>(undefined)
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null)
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [isSubmittingNewsletter, setIsSubmittingNewsletter] = useState(false)

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('userEmail')
    if (storedEmail) {
      setEmail(storedEmail)
    }

    const urlParams = new URLSearchParams(window.location.search)
    const success = urlParams.get('success')
    const cancelled = urlParams.get('cancelled')
    const plan = urlParams.get('plan')
    const tier = urlParams.get('tier')
    const userEmail = urlParams.get('email')

    if (success === 'true') {
      if (tier && userEmail) {
        localStorage.setItem('pendingTier', tier)
        sessionStorage.setItem('userEmail', userEmail)
      }
      window.location.href = '/submit'
      return
    }

    if (cancelled === 'true' && plan) {
      setSelectedPlan(plan)
      setShowDiscountPopup(true)
      window.history.replaceState({}, '', '/featured')
    }
  }, [])

  const pricingPlans = [
    {
      name: 'Free',
      description: 'Perfect for trying us out',
      monthlyPrice: 0,
      yearlyPrice: 0,
      monthlyPriceId: null,
      yearlyPriceId: null,
      features: [
        'Dofollow backlink',
        'Submit 1 software listing',
        'Basic listing page',
        'Community visibility',
        'Standard review time (7-10 days)',
        '⚠️ Expires after 90 days (renewable)',
      ],
    },
    {
      name: 'Featured',
      description: 'For growing companies',
      monthlyPrice: 2,
      yearlyPrice: 19.2,
      monthlyPriceId: 'price_1SLuVoEfmU4X8cUlYucpStOt',
      yearlyPriceId: 'price_1SLuWrEfmU4X8cUlwxalZJsT',
      features: [
        '✅ No expiration - Permanent listings',
        'Dofollow backlink',
        'Up to 5 software listings',
        'Featured badge on listings',
        'Priority review (2-3 days)',
        'Monthly performance analytics',
        'Logo in category pages',
        'Social media mentions',
      ],
    },
    {
      name: 'Premium',
      description: 'For established brands',
      monthlyPrice: 4,
      yearlyPrice: 38.4,
      monthlyPriceId: 'price_1SLuXuEfmU4X8cUllzHZ8zt8',
      yearlyPriceId: 'price_1SLuYiEfmU4X8cUlttdoOo8j',
      features: [
        '✅ No expiration - Permanent listings',
        'Dofollow backlink',
        'Unlimited software listings',
        'Homepage featured spot',
        'Same-day review',
        'Advanced analytics dashboard',
        'Newsletter feature (200K+ subscribers)',
        'Dedicated account manager',
        'SEO optimization support',
      ],
      isPopular: true,
    },
  ]

  const faqs = [
    {
      question: 'What is SaaSRow?',
      answer: 'SaaSRow is a growing software marketplace with 856,000+ monthly page views where users discover and compare software solutions.',
    },
    {
      question: 'How does pricing work?',
      answer: 'Choose from our flexible plans based on your needs. Annual plans save you 2 months compared to monthly billing. All paid plans include priority support.',
    },
    {
      question: 'Can I cancel anytime?',
      answer: 'Yes, you can cancel your subscription at any time. Your listings will remain active until the end of your billing period.',
    },
    {
      question: 'What happens to my listings if I downgrade?',
      answer: 'Your listings stay active, but premium features like featured badges and priority placement will be removed. You can always upgrade again.',
    },
  ]

  const getDisplayPrice = (plan: typeof pricingPlans[0]) => {
    if (plan.monthlyPrice === 0) return '$0'
    const price = billingPeriod === 'yearly' ? plan.yearlyPrice / 12 : plan.monthlyPrice
    return `$${price.toFixed(2).replace(/\.00$/, '')}`
  }

  const getSavings = (plan: typeof pricingPlans[0]) => {
    if (plan.monthlyPrice === 0) return null
    const yearlySavings = (plan.monthlyPrice * 12) - plan.yearlyPrice
    return yearlySavings > 0 ? `Save $${yearlySavings.toFixed(2)}/year` : null
  }

  const handleCheckout = async (plan: typeof pricingPlans[0], discountCode?: string) => {
    if (plan.name === 'Free') {
      window.location.href = '/submit'
      return
    }

    trackEvent(analyticsEvents.LISTING_UPGRADE_INITIATED, {
      plan: plan.name,
      billing_period: billingPeriod,
      has_discount: !!discountCode,
    });

    setPendingPlan(plan)
    setPendingDiscount(discountCode)
    setShowEmailModal(true)
  }

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newsletterEmail || isSubmittingNewsletter) return

    setIsSubmittingNewsletter(true)

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email: newsletterEmail }),
      })

      const data = await response.json()

      if (response.ok) {
        setAlertMessage({
          type: 'success',
          message: 'Success! Check your email for your 50% discount code.'
        })
        setNewsletterEmail('')
      } else {
        setAlertMessage({
          type: 'error',
          message: data.error || 'Failed to subscribe. Please try again.'
        })
      }
    } catch (error) {
      console.error('Newsletter subscription error:', error)
      setAlertMessage({
        type: 'error',
        message: 'Something went wrong. Please try again.'
      })
    } finally {
      setIsSubmittingNewsletter(false)
    }
  }

  const proceedToCheckout = async () => {
    if (!pendingPlan || !email) return

    sessionStorage.setItem('userEmail', email)
    setProcessingPlan(pendingPlan.name)
    setShowEmailModal(false)

    try {
      const priceId = billingPeriod === 'yearly' ? pendingPlan.yearlyPriceId : pendingPlan.monthlyPriceId
      const tier = pendingPlan.name.toLowerCase()
      const currentUrl = window.location.origin + '/featured'
      const successUrl = `${currentUrl}?success=true&tier=${tier}&email=${encodeURIComponent(email)}`
      const cancelUrl = `${currentUrl}?cancelled=true&plan=${tier}&period=${billingPeriod}`

      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`
        const parts = value.split(`; ${name}=`)
        if (parts.length === 2) return parts.pop()?.split(';').shift()
        return undefined
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          price_id: priceId,
          success_url: successUrl,
          cancel_url: cancelUrl,
          mode: 'subscription',
          discount_code: pendingDiscount,
          customer_email: email,
          datafast_visitor_id: getCookie('datafast_visitor_id'),
          datafast_session_id: getCookie('datafast_session_id'),
        }),
      })

      const data = await response.json()

      if (response.ok && data.url) {
        trackEvent(analyticsEvents.LISTING_UPGRADE_COMPLETED, {
          plan: pendingPlan.name,
          email: email,
          billing_period: billingPeriod,
          has_discount: !!pendingDiscount,
        });
        window.location.href = data.url
      } else {
        setAlertMessage({ type: 'error', message: `Failed to create checkout session: ${data.error || 'Unknown error'}` })
      }
    } catch (error) {
      console.error('Checkout error:', error)
      setAlertMessage({ type: 'error', message: 'Something went wrong. Please try again.' })
    } finally {
      setProcessingPlan(null)
      setPendingPlan(null)
      setPendingDiscount(undefined)
      setEmail('')
    }
  }

  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/2 left-[3.22%] bg-[#e0ff044c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 bottom-0 left-[-3.60%] bg-[#e0ff044c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <div className="w-full bg-gradient-to-r from-[#E0FF04] to-[#4FFFE3] py-4 px-4">
          <div className="max-w-[1200px] mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
                <div className="bg-neutral-800 rounded-full px-4 py-1 text-white font-ubuntu font-bold text-sm whitespace-nowrap">
                  LIMITED OFFER
                </div>
                <p className="text-neutral-800 font-ubuntu font-bold text-lg">
                  Subscribe to our newsletter and get 50% OFF all plans - applies to all recurring payments!
                </p>
              </div>
              <form onSubmit={handleNewsletterSubmit} className="flex gap-2 w-full md:w-auto">
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="px-4 py-2 rounded-full bg-neutral-800 text-white font-ubuntu outline-none focus:ring-2 focus:ring-white placeholder:text-neutral-400 min-w-[280px]"
                  disabled={isSubmittingNewsletter}
                />
                <button
                  type="submit"
                  disabled={isSubmittingNewsletter || !newsletterEmail}
                  className="px-6 py-2 rounded-full bg-neutral-800 text-white font-ubuntu font-bold hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap border-2 border-white"
                >
                  {isSubmittingNewsletter ? 'Subscribing...' : 'Get 50% OFF'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <section className="w-full max-w-[1200px] mx-auto px-4 py-12 text-center">
          <h1 className="text-white text-5xl font-bold font-ubuntu mb-4">
            Get Your Software Featured
          </h1>
          <p className="text-white text-xl max-w-3xl mx-auto mb-12 font-ubuntu">
            SaaSRow is a growing software marketplace with 856,000+ monthly page views.
            <br />
            People visit our platform when looking for alternatives or when comparing products.
          </p>

          <div className="mb-8">
            <div className="inline-flex bg-[#4a4a4a] rounded-full p-1 gap-1">
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-6 py-2 rounded-full font-ubuntu font-bold transition-all ${
                  billingPeriod === 'yearly'
                    ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                    : 'text-white'
                }`}
              >
                Yearly <span className="text-sm opacity-70">(Save 20%)</span>
              </button>
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-6 py-2 rounded-full font-ubuntu font-bold transition-all ${
                  billingPeriod === 'monthly'
                    ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                    : 'text-white'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`relative bg-[#3a3a3a] rounded-3xl p-8 ${
                  plan.isPopular ? 'ring-2 ring-[#4FFFE3]' : ''
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#E0FF04] to-[#4FFFE3] text-neutral-800 px-6 py-1 rounded-full text-sm font-bold">
                    Most Popular
                  </div>
                )}
                <h3 className="text-white text-3xl font-bold font-ubuntu mb-2">{plan.name}</h3>
                <p className="text-white/70 mb-6 font-ubuntu">{plan.description}</p>
                <div className="mb-2">
                  <span className="text-white text-5xl font-bold font-ubuntu">
                    {getDisplayPrice(plan)}
                  </span>
                  <span className="text-white/70 font-ubuntu">/month</span>
                </div>
                {billingPeriod === 'yearly' && getSavings(plan) && (
                  <p className="text-[#4FFFE3] text-sm font-ubuntu mb-4">{getSavings(plan)}</p>
                )}
                {billingPeriod === 'yearly' && plan.yearlyPrice > 0 && (
                  <p className="text-white/50 text-sm font-ubuntu mb-4">
                    Billed ${plan.yearlyPrice.toFixed(2)} annually
                  </p>
                )}
                <button
                  onClick={() => handleCheckout(plan)}
                  disabled={processingPlan !== null}
                  className="w-full py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingPlan === plan.name ? 'Processing...' : plan.name === 'Free' ? 'Submit Now' : 'Get Started'}
                </button>
                <ul className="space-y-3 text-left">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-white font-ubuntu">
                      <svg
                        className="w-5 h-5 text-[#4FFFE3] flex-shrink-0 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mb-12">
            <h2 className="text-white text-4xl font-bold font-ubuntu mb-8">
              Frequently Asked Questions
            </h2>
            <p className="text-white text-xl max-w-3xl mx-auto mb-8 font-ubuntu">
              Quick answers to questions you may have. If you don't see what's on your mind, reach
              out to us anytime on social media
            </p>
            <div className="space-y-4 max-w-3xl mx-auto">
              {faqs.map((faq, idx) => (
                <div key={idx} className="bg-[#3a3a3a] rounded-2xl p-6 text-left">
                  <h3 className="text-white text-xl font-bold font-ubuntu mb-2">
                    {faq.question}
                  </h3>
                  <p className="text-white/70 font-ubuntu">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Footer />
      </div>

      {showDiscountPopup && (
        <DiscountPopup
          onClose={() => setShowDiscountPopup(false)}
          currentBillingPeriod={billingPeriod}
          onApplyDiscount={(selectedBillingPeriod) => {
            setBillingPeriod(selectedBillingPeriod)
            setShowDiscountPopup(false)
            const plan = pricingPlans.find(p => p.name.toLowerCase() === selectedPlan)
            if (plan) {
              handleCheckout(plan, '50OFF')
            }
          }}
        />
      )}

      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#3a3a3a] rounded-3xl p-8 max-w-md w-full">
            <h3 className="text-white text-2xl font-bold font-ubuntu mb-4">
              Enter Your Email
            </h3>
            <p className="text-white/70 font-ubuntu mb-6">
              We'll send your management link to this email so you can track and edit your listings.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-neutral-800 text-white font-ubuntu px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-[#4FFFE3] mb-6"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && email) {
                  proceedToCheckout()
                }
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEmailModal(false)
                  setPendingPlan(null)
                  setPendingDiscount(undefined)
                  setEmail('')
                }}
                className="flex-1 py-3 rounded-full bg-neutral-700 text-white font-ubuntu font-bold hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={proceedToCheckout}
                disabled={!email || processingPlan !== null}
                className="flex-1 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingPlan ? 'Processing...' : 'Continue'}
              </button>
            </div>
          </div>
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
