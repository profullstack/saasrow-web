import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { supabase } from '../lib/supabase'
import { trackEvent, analyticsEvents } from '../lib/analytics'

interface FetchedData {
  url: string
  title: string
  description: string
  category: string
  tags: string[]
  image: string | null
  logo: string | null
}

export default function SubmitPage() {
  const [step, setStep] = useState<'url' | 'review' | 'edit'>('url')
  const [urls, setUrls] = useState('')
  const [url, setUrl] = useState('')
  const [submissions, setSubmissions] = useState<FetchedData[]>([])
  const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    description: '',
    email: '',
    category: '',
    tags: [] as string[],
  })
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [fetchedLogoPath, setFetchedLogoPath] = useState<string | null>(null)
  const [fetchedImagePath, setFetchedImagePath] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userTier, setUserTier] = useState<'free' | 'featured' | 'premium'>('free')
  const [subscribeToNewsletter, setSubscribeToNewsletter] = useState(false)

  const checkUserTier = async (email: string) => {
    try {
      const { data } = await supabase
        .from('user_tokens')
        .select('tier')
        .eq('email', email)
        .maybeSingle()

      return data?.tier || 'free'
    } catch {
      return 'free'
    }
  }

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('userEmail')
    const pendingTier = localStorage.getItem('pendingTier')

    if (pendingTier) {
      setUserTier(pendingTier as 'free' | 'featured' | 'premium')
      setUserEmail(storedEmail)
      localStorage.removeItem('pendingTier')
    } else if (storedEmail) {
      checkUserTier(storedEmail).then(tier => {
        setUserTier(tier as 'free' | 'featured' | 'premium')
        setUserEmail(storedEmail)
      })
    }
  }, [])

  const handleFetchMetadata = async (e: FormEvent) => {
    e.preventDefault()
    setIsFetching(true)
    setMessage(null)

    trackEvent(analyticsEvents.SOFTWARE_SUBMISSION_STARTED, {
      tier: userTier,
      hasEmail: !!userEmail,
    });

    try {
      const urlList = userTier === 'free'
        ? [url.trim()].filter(u => u.length > 0)
        : urls.split('\n').map(u => u.trim()).filter(u => u.length > 0)

      if (urlList.length === 0) {
        setMessage({ type: 'error', text: 'Please enter at least one URL' })
        setIsFetching(false)
        return
      }

      if (userTier === 'free' && urlList.length > 1) {
        setMessage({ type: 'error', text: 'Free tier allows 1 URL. Please upgrade to Featured (5 URLs) or Premium (unlimited).' })
        setIsFetching(false)
        return
      }

      if (userTier === 'featured' && urlList.length > 5) {
        setMessage({ type: 'error', text: 'Featured tier allows up to 5 URLs. Please upgrade to Premium for unlimited submissions.' })
        setIsFetching(false)
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-metadata`
      const fetchedData: FetchedData[] = []

      for (const url of urlList) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ url }),
          })

          const data = await response.json()

          if (response.ok) {
            fetchedData.push({
              url: data.url,
              title: data.title,
              description: data.description,
              category: data.category,
              tags: data.tags || [],
              image: data.image,
              logo: data.logo,
            })
          } else if (data.duplicate) {
            setMessage({ type: 'error', text: data.error })
            setIsFetching(false)
            return
          }
        } catch (error) {
          console.error('Error fetching', url, error)
        }
      }

      if (fetchedData.length === 0) {
        setMessage({ type: 'error', text: 'Failed to fetch metadata for any URLs' })
      } else {
        setSubmissions(fetchedData)
        setStep('review')
      }
    } catch (error) {
      console.error('Fetch error:', error)
      setMessage({
        type: 'error',
        text: `Something went wrong: ${error instanceof Error ? error.message : 'Please try again.'}`
      })
    } finally {
      setIsFetching(false)
    }
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'Logo file must be less than 5MB' })
        return
      }
      setLogoFile(file)
      setLogoUrl(URL.createObjectURL(file))
    }
  }

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'Image file must be less than 10MB' })
        return
      }
      setImageFile(file)
      setPreviewImage(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      let uploadedLogoPath: string | null = null
      let uploadedImagePath: string | null = null

      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const { error: logoError } = await supabase.storage
          .from('software-logos')
          .upload(fileName, logoFile, {
            cacheControl: '3600',
            upsert: false,
          })

        if (logoError) {
          setMessage({ type: 'error', text: 'Failed to upload logo' })
          setIsSubmitting(false)
          return
        }
        uploadedLogoPath = fileName
      } else if (fetchedLogoPath) {
        uploadedLogoPath = fetchedLogoPath
      }

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const { error: imageError } = await supabase.storage
          .from('software-images')
          .upload(fileName, imageFile, {
            cacheControl: '3600',
            upsert: false,
          })

        if (imageError) {
          setMessage({ type: 'error', text: 'Failed to upload image' })
          setIsSubmitting(false)
          return
        }
        uploadedImagePath = fileName
      } else if (fetchedImagePath) {
        uploadedImagePath = fetchedImagePath
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submissions`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          logo: uploadedLogoPath,
          image: uploadedImagePath,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        if (currentEditIndex !== null) {
          const updatedSubmissions = [...submissions]
          updatedSubmissions[currentEditIndex] = {
            ...updatedSubmissions[currentEditIndex],
            ...formData,
            logo: uploadedLogoPath,
            image: uploadedImagePath,
          }
          setSubmissions(updatedSubmissions)
          setCurrentEditIndex(null)
          setStep('review')
          setMessage({ type: 'success', text: 'Changes saved!' })
        } else {
          if (data.managementToken) {
            setManagementToken(data.managementToken)
          }
          setMessage({ type: 'success', text: 'Software submitted successfully!' })
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to submit' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Something went wrong. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStartOver = () => {
    setStep('url')
    setUrls('')
    setUrl('')
    setSubmissions([])
    setCurrentEditIndex(null)
    setFormData({ title: '', url: '', description: '', email: '', category: '', tags: [] })
    setPreviewImage(null)
    setLogoUrl(null)
    setLogoFile(null)
    setImageFile(null)
    setFetchedLogoPath(null)
    setFetchedImagePath(null)
    setMessage(null)
  }

  const handleEditSubmission = (index: number) => {
    const submission = submissions[index]
    setCurrentEditIndex(index)
    setFormData({
      title: submission.title,
      url: submission.url,
      description: submission.description,
      email: '',
      category: submission.category,
      tags: submission.tags,
    })

    if (submission.image) {
      setFetchedImagePath(submission.image)
      const { data: imageData } = supabase.storage.from('software-images').getPublicUrl(submission.image)
      setPreviewImage(imageData.publicUrl)
    }

    if (submission.logo) {
      setFetchedLogoPath(submission.logo)
      const { data: logoData } = supabase.storage.from('software-logos').getPublicUrl(submission.logo)
      setLogoUrl(logoData.publicUrl)
    }

    setStep('edit')
  }

  const handleRemoveSubmission = (index: number) => {
    setSubmissions(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmitAll = () => {
    setShowEmailDialog(true)
  }

  const handleEmailSubmit = async () => {
    if (!emailInput || !emailInput.includes('@')) {
      setMessage({ type: 'error', text: 'Please enter a valid email address' })
      return
    }

    setShowEmailDialog(false)
    setIsSubmitting(true)
    setMessage(null)

    try {
      if (subscribeToNewsletter) {
        try {
          const newsletterUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter`
          const response = await fetch(newsletterUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: emailInput }),
          })

          if (response.ok) {
            trackEvent(analyticsEvents.NEWSLETTER_SUBSCRIBED, {
              email: emailInput,
              source: 'submit_page',
            });
          }
        } catch (error) {
          console.error('Error subscribing to newsletter:', error)
        }
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submissions`
      let successCount = 0

      for (const submission of submissions) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: submission.title,
              url: submission.url,
              description: submission.description,
              email: emailInput,
              category: submission.category,
              tags: submission.tags,
              logo: submission.logo,
              image: submission.image,
            }),
          })

          if (response.ok) {
            successCount++
          }
        } catch (error) {
          console.error('Error submitting', submission.url, error)
        }
      }

      if (successCount > 0) {
        trackEvent(analyticsEvents.SOFTWARE_SUBMISSION_COMPLETED, {
          email: emailInput,
          count: successCount,
          tier: userTier,
          subscribedToNewsletter: subscribeToNewsletter,
        });

        try {
          const sendLinkResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-management-link`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: emailInput }),
          })

          if (sendLinkResponse.ok) {
            setMessage({
              type: 'success',
              text: `Successfully submitted ${successCount} of ${submissions.length} software ${successCount === 1 ? 'entry' : 'entries'}! Check your email (${emailInput}) for your management link.`
            })
          } else {
            setMessage({
              type: 'success',
              text: `Successfully submitted ${successCount} of ${submissions.length} software ${successCount === 1 ? 'entry' : 'entries'}! We'll send you a management link shortly.`
            })
          }
        } catch (emailError) {
          console.error('Error sending management link:', emailError)
          setMessage({
            type: 'success',
            text: `Successfully submitted ${successCount} of ${submissions.length} software ${successCount === 1 ? 'entry' : 'entries'}! We'll send you a management link shortly.`
          })
        }

        setTimeout(() => {
          handleStartOver()
        }, 5000)
      } else {
        trackEvent(analyticsEvents.SOFTWARE_SUBMISSION_FAILED, {
          email: emailInput,
          tier: userTier,
        });
        setMessage({ type: 'error', text: 'Failed to submit any entries' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Something went wrong. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBackToReview = () => {
    setCurrentEditIndex(null)
    setFormData({ title: '', url: '', description: '', email: '', category: '', tags: [] })
    setPreviewImage(null)
    setLogoUrl(null)
    setLogoFile(null)
    setImageFile(null)
    setFetchedLogoPath(null)
    setFetchedImagePath(null)
    setStep('review')
  }

  const handleRemoveTag = (indexToRemove: number) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((_, index) => index !== indexToRemove),
    }))
  }

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const input = e.currentTarget
      const newTag = input.value.trim().toLowerCase()
      if (newTag && !formData.tags.includes(newTag)) {
        setFormData((prev) => ({ ...prev, tags: [...prev.tags, newTag] }))
        input.value = ''
      }
    }
  }

  return (
    <div className="min-h-screen bg-neutral-800">
      {showEmailDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-[#2a2a2a] rounded-2xl p-8 max-w-md w-full">
            <h2 className="text-white text-2xl font-bold font-ubuntu mb-4">
              Enter Your Email
            </h2>
            <p className="text-white/70 font-ubuntu mb-4">
              We'll send you a management link so you can edit your listings later.
            </p>
            <p className="text-white/50 font-ubuntu text-sm mb-6">
              Your email is only used to send you the management link and optional updates. We never sell or share your data with third parties.
            </p>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="your@email.com"
              className={`w-full px-4 py-3 bg-[#3a3a3a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu ${userTier === 'free' ? 'mb-4' : 'mb-6'}`}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (userTier !== 'free' || !subscribeToNewsletter)) {
                  handleEmailSubmit()
                }
              }}
            />
            {userTier === 'free' && (
              <label className="flex items-start gap-3 mb-6 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={subscribeToNewsletter}
                  onChange={(e) => setSubscribeToNewsletter(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-2 border-[#4FFFE3]/30 bg-[#3a3a3a] checked:bg-[#4FFFE3] checked:border-[#4FFFE3] focus:ring-2 focus:ring-[#4FFFE3] cursor-pointer transition-colors"
                />
                <span className="flex-1 text-white/90 font-ubuntu text-sm group-hover:text-white transition-colors">
                  Subscribe to our newsletter and get a <strong className="text-[#4FFFE3]">50% discount code</strong> for Featured/Premium listings!
                </span>
              </label>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowEmailDialog(false)
                  setIsSubmitting(false)
                }}
                className="flex-1 py-3 rounded-lg bg-[#4a4a4a] text-white font-ubuntu font-bold hover:bg-[#555555] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmailSubmit}
                className="flex-1 py-3 rounded-lg bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute w-full h-1/2 top-0 left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[800px] mx-auto px-4 py-12">
          <h1 className="text-white text-4xl font-bold font-ubuntu mb-4 text-center">
            Submit Your Software
          </h1>
          <p className="text-white/70 text-center font-ubuntu mb-8">
            {step === 'url'
              ? userTier === 'free'
                ? 'Enter your software URL and we\'ll automatically fetch the details'
                : `Enter your software URLs and we'll automatically fetch the details`
              : step === 'review'
              ? 'Review your submissions and edit if needed'
              : 'Review and edit the information before submitting'}
          </p>

          {step === 'url' && userTier === 'free' && (
            <div className="mb-8 bg-gradient-to-br from-[#3a3a3a] to-[#2a2a2a] rounded-2xl p-6 border border-[#4FFFE3]/20">
              <h2 className="text-white text-xl font-bold font-ubuntu mb-4 text-center">
                🚀 Upgrade for More Visibility & Features
              </h2>
              <div className="max-w-md mx-auto">
                <div className="bg-[#4a4a4a]/50 rounded-xl p-4 border-2 border-[#4FFFE3]/30">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[#4FFFE3] font-bold font-ubuntu text-lg">Featured Tier</h3>
                    <div className="text-right">
                      <div className="text-white font-ubuntu text-sm">$1.60/mo</div>
                      <div className="text-white/60 font-ubuntu text-xs">billed annually</div>
                    </div>
                  </div>
                  <ul className="text-white/70 text-sm font-ubuntu space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-[#4FFFE3] mt-0.5">✓</span>
                      <span><strong>No expiration</strong> - Permanent listings</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#4FFFE3] mt-0.5">✓</span>
                      <span>Dofollow backlink</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#4FFFE3] mt-0.5">✓</span>
                      <span>Up to 5 listings</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#4FFFE3] mt-0.5">✓</span>
                      <span>Featured badge</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#4FFFE3] mt-0.5">✓</span>
                      <span>Priority review (2-3 days)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#4FFFE3] mt-0.5">✓</span>
                      <span>Monthly analytics</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#4FFFE3] mt-0.5">✓</span>
                      <span>Logo in category pages</span>
                    </li>
                  </ul>
                  <a
                    href="/featured"
                    className="block mt-4 w-full py-2 text-center rounded-lg bg-[#4FFFE3]/20 text-[#4FFFE3] font-ubuntu font-semibold hover:bg-[#4FFFE3]/30 transition-colors"
                  >
                    Learn More
                  </a>
                </div>
              </div>
              <p className="text-center text-white/60 text-sm font-ubuntu mt-4">
                💰 Have a discount code? You'll be able to apply it at checkout.
              </p>
            </div>
          )}

          {step === 'url' ? (
            <form onSubmit={handleFetchMetadata} className="space-y-6">
              <div className="bg-[#3a3a3a] rounded-2xl p-8">
                <label htmlFor={userTier === 'free' ? 'url' : 'urls'} className="block text-white font-ubuntu text-lg mb-4">
                  {userTier === 'free' && 'Software URL (Free Tier - 1 URL)'}
                  {userTier === 'featured' && 'Software URLs (Featured Tier - Up to 5 URLs)'}
                </label>
                {userTier === 'free' ? (
                  <input
                    id="url"
                    name="url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    required
                    className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu text-lg"
                  />
                ) : (
                  <textarea
                    id="urls"
                    name="urls"
                    value={urls}
                    onChange={(e) => setUrls(e.target.value)}
                    placeholder="https://example.com&#10;https://another-site.com&#10;https://third-site.com"
                    required
                    rows={5}
                    className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu text-lg resize-none"
                  />
                )}
                <p className="text-white/50 text-sm font-ubuntu mt-3">
                  {userTier === 'free' && "Enter 1 URL. We'll fetch the title, description, and other details automatically using AI. Upgrade to Featured for 5 URLs!"}
                  {userTier === 'featured' && "Enter up to 5 URLs (one per line). We'll fetch the title, description, and other details automatically using AI."}
                </p>
                <div className="mt-4 bg-gradient-to-r from-[#4FFFE3]/10 to-[#E0FF04]/10 rounded-lg p-4 border border-[#4FFFE3]/30">
                  <p className="text-white font-ubuntu text-sm mb-2">
                    <strong className="text-[#4FFFE3]">{userTier === 'featured' ? 'Featured' : 'Free'} Tier Includes:</strong>
                  </p>
                  <ul className="text-white/70 text-sm font-ubuntu space-y-1 ml-4">
                    {userTier === 'free' && (
                      <>
                        <li>• Dofollow backlink</li>
                        <li>• 1 software listing</li>
                        <li>• Basic listing page</li>
                        <li>• Community visibility</li>
                        <li>• Standard review time (7-10 days)</li>
                        <li className="text-yellow-400">⚠️ Expires after 90 days (renewable)</li>
                      </>
                    )}
                    {userTier === 'featured' && (
                      <>
                        <li className="text-[#4FFFE3] font-semibold">• No expiration - Permanent listings</li>
                        <li>• Dofollow backlink</li>
                        <li>• Up to 5 software listings</li>
                        <li>• Featured badge on listings</li>
                        <li>• Priority review (2-3 days)</li>
                        <li>• Monthly performance analytics</li>
                        <li>• Logo in category pages</li>
                        <li>• Social media mentions</li>
                      </>
                    )}
                  </ul>
                </div>
                {userTier === 'free' && (
                  <div className="mt-4 bg-[#4a4a4a] rounded-lg p-4 border border-[#E0FF04]/20">
                    <p className="text-white/70 text-sm font-ubuntu flex items-start gap-2">
                      <span className="text-[#E0FF04] text-lg">⭐</span>
                      <span>
                        <strong className="text-white">Need more?</strong>
                        <br />
                        Upgrade to <span className="text-[#E0FF04]">Featured</span> for permanent listings (no expiration), 5 URLs, priority review, featured badge, and analytics!
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {message && (
                <div
                  className={`rounded-2xl p-6 ${
                    message.type === 'success'
                      ? 'bg-[#1a4d45] border-2 border-[#4FFFE3]'
                      : 'bg-[#4d1a1a] border-2 border-red-400'
                  }`}
                >
                  <p
                    className={`text-center font-ubuntu text-lg ${
                      message.type === 'success' ? 'text-[#4FFFE3]' : 'text-red-400'
                    }`}
                  >
                    {message.text}
                  </p>
                  {message.type === 'success' && (
                    <div className="mt-4 text-center">
                      <p className="text-white/70 font-ubuntu text-sm">
                        Please check your spam folder if you don't see the email within a few minutes.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isFetching || (userTier === 'free' ? !url : !urls)}
                className="w-full py-4 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold text-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFetching ? 'Fetching details...' : 'Continue'}
              </button>
            </form>
          ) : step === 'review' ? (
            <div className="space-y-6">
              <div className="space-y-4">
                {submissions.map((submission, index) => (
                  <div key={index} className="bg-[#3a3a3a] rounded-2xl p-6">
                    <div className="flex items-start gap-4 mb-4">
                      {submission.logo && (
                        <div className="w-16 h-16 rounded-lg bg-white p-2 flex-shrink-0">
                          <img
                            src={supabase.storage.from('software-logos').getPublicUrl(submission.logo).data.publicUrl}
                            alt={submission.title}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-ubuntu text-xl font-bold mb-2">{submission.title}</h3>
                        <p className="text-white/70 font-ubuntu text-sm mb-2">{submission.url}</p>
                        <p className="text-white/60 font-ubuntu text-sm line-clamp-2">{submission.description}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <span className="px-3 py-1 bg-[#4FFFE3]/20 text-[#4FFFE3] rounded-full text-xs font-ubuntu">
                            {submission.category}
                          </span>
                          {submission.tags.slice(0, 3).map((tag, tagIndex) => (
                            <span key={tagIndex} className="px-3 py-1 bg-white/10 text-white/70 rounded-full text-xs font-ubuntu">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditSubmission(index)}
                          className="px-4 py-2 bg-[#4a4a4a] text-white rounded-lg hover:bg-[#555555] transition-colors font-ubuntu text-sm"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubmission(index)}
                          className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors font-ubuntu text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {submission.image && (
                      <div className="rounded-lg overflow-hidden">
                        <img
                          src={supabase.storage.from('software-images').getPublicUrl(submission.image).data.publicUrl}
                          alt={`${submission.title} preview`}
                          className="w-full h-48 object-cover"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {message && (
                <div
                  className={`rounded-2xl p-4 ${
                    message.type === 'success'
                      ? 'bg-[#1a4d45] border-2 border-[#4FFFE3]'
                      : 'bg-[#4d1a1a] border-2 border-red-400'
                  }`}
                >
                  <p
                    className={`text-center font-ubuntu ${
                      message.type === 'success' ? 'text-[#4FFFE3]' : 'text-red-400'
                    }`}
                  >
                    {message.text}
                  </p>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="flex-1 py-4 rounded-full bg-[#4a4a4a] text-white font-ubuntu font-bold text-xl hover:bg-[#555555] transition-colors"
                >
                  Start Over
                </button>
                <button
                  type="button"
                  onClick={handleSubmitAll}
                  disabled={isSubmitting || submissions.length === 0}
                  className="flex-1 py-4 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold text-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : `Submit All (${submissions.length})`}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-[#3a3a3a] rounded-2xl p-8">
                <h3 className="text-white font-ubuntu text-lg mb-4">Images</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-white font-ubuntu text-sm mb-2">Logo</label>
                    {logoUrl ? (
                      <div className="relative">
                        <div className="w-32 h-32 rounded-lg bg-white p-4 flex items-center justify-center mx-auto">
                          <img
                            src={logoUrl}
                            alt="Logo"
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setLogoUrl(null)
                            setLogoFile(null)
                            setFetchedLogoPath(null)
                          }}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#4a4a4a] rounded-lg cursor-pointer hover:border-[#4FFFE3] transition-colors">
                        <svg className="w-8 h-8 text-white/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-white/50 font-ubuntu text-sm">Upload Logo</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/x-icon"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                    <p className="text-white/50 text-xs font-ubuntu mt-2">Max 5MB. PNG, JPG, SVG, ICO</p>
                  </div>

                  <div>
                    <label className="block text-white font-ubuntu text-sm mb-2">Preview Image</label>
                    {previewImage ? (
                      <div className="relative">
                        <img
                          src={previewImage}
                          alt="Preview"
                          className="w-full h-32 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewImage(null)
                            setImageFile(null)
                            setFetchedImagePath(null)
                          }}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#4a4a4a] rounded-lg cursor-pointer hover:border-[#4FFFE3] transition-colors">
                        <svg className="w-8 h-8 text-white/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-white/50 font-ubuntu text-sm">Upload Image</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                    <p className="text-white/50 text-xs font-ubuntu mt-2">Max 10MB. PNG, JPG, WEBP</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#3a3a3a] rounded-2xl p-8 space-y-6">
                <div>
                  <label htmlFor="title" className="block text-white font-ubuntu text-lg mb-2">
                    Title
                  </label>
                  <input
                    id="title"
                    name="title"
                    type="text"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="Software title"
                    required
                    className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu"
                  />
                </div>

                <div>
                  <label htmlFor="url" className="block text-white font-ubuntu text-lg mb-2">
                    URL
                  </label>
                  <input
                    id="url"
                    name="url"
                    type="url"
                    value={formData.url}
                    onChange={handleInputChange}
                    placeholder="https://example.com"
                    required
                    className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu"
                  />
                </div>

                <div>
                  <label htmlFor="category" className="block text-white font-ubuntu text-lg mb-2">
                    Category
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu"
                  >
                    <option value="">Select a category</option>
                    <option value="Software">Software</option>
                    <option value="Security">Security</option>
                    <option value="Productivity">Productivity</option>
                    <option value="Development">Development</option>
                    <option value="Design">Design</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Analytics">Analytics</option>
                    <option value="Communication">Communication</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="description" className="block text-white font-ubuntu text-lg mb-2">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Brief description of the software"
                    required
                    rows={4}
                    className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu resize-none"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-white font-ubuntu text-lg mb-2">
                    Your Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="your.email@example.com"
                    required
                    className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu"
                  />
                </div>

                <div>
                  <label className="block text-white font-ubuntu text-lg mb-2">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {formData.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-[#4FFFE3]/20 text-[#4FFFE3] rounded-full text-sm font-ubuntu"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(index)}
                          className="hover:text-white transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    onKeyDown={handleAddTag}
                    placeholder="Type a tag and press Enter"
                    className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu"
                  />
                  <p className="text-white/50 text-sm font-ubuntu mt-2">
                    Press Enter to add tags. AI suggested: {formData.tags.join(', ')}
                  </p>
                </div>
              </div>

              {message && (
                <div
                  className={`rounded-2xl p-4 ${
                    message.type === 'success'
                      ? 'bg-[#1a4d45] border-2 border-[#4FFFE3]'
                      : 'bg-[#4d1a1a] border-2 border-red-400'
                  }`}
                >
                  <p
                    className={`text-center font-ubuntu ${
                      message.type === 'success' ? 'text-[#4FFFE3]' : 'text-red-400'
                    }`}
                  >
                    {message.text}
                  </p>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={currentEditIndex !== null ? handleBackToReview : handleStartOver}
                  className="flex-1 py-4 rounded-full bg-[#4a4a4a] text-white font-ubuntu font-bold text-xl hover:bg-[#555555] transition-colors"
                >
                  {currentEditIndex !== null ? 'Back to Review' : 'Start Over'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-4 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold text-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : currentEditIndex !== null ? 'Save Changes' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </main>

        <Footer />
      </div>
    </div>
  )
}
