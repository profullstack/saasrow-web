import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Screenshot {
  id: string
  screenshot_url: string
  page_url: string
  page_title: string
  captured_at: string
}

interface ScreenshotGalleryProps {
  submissionId: string
}

export function ScreenshotGallery({ submissionId }: ScreenshotGalleryProps) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<Screenshot | null>(null)

  useEffect(() => {
    fetchScreenshots()
  }, [submissionId])

  const fetchScreenshots = async () => {
    try {
      const { data, error } = await supabase
        .from('submission_screenshots')
        .select('*')
        .eq('submission_id', submissionId)
        .order('captured_at', { ascending: true })

      if (error) throw error

      setScreenshots(data || [])
    } catch (error) {
      console.error('Error fetching screenshots:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-[#3a3a3a] rounded-2xl p-8">
        <h2 className="text-white text-2xl font-bold font-ubuntu mb-4">Screenshot Gallery</h2>
        <div className="text-center py-8">
          <p className="text-white/70 font-ubuntu">Loading screenshots...</p>
        </div>
      </div>
    )
  }

  if (screenshots.length === 0) {
    return null
  }

  return (
    <>
      <div className="bg-[#3a3a3a] rounded-2xl p-8">
        <h2 className="text-white text-2xl font-bold font-ubuntu mb-6">Screenshot Gallery</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {screenshots.map((screenshot) => (
            <button
              key={screenshot.id}
              onClick={() => setSelectedImage(screenshot)}
              className="group relative aspect-video rounded-lg overflow-hidden bg-[#2a2a2a] hover:ring-2 hover:ring-[#4FFFE3] transition-all"
            >
              <img
                src={screenshot.screenshot_url}
                alt={screenshot.page_title}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white font-ubuntu text-sm font-semibold truncate">
                    {screenshot.page_title}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-6xl w-full max-h-[90vh] flex flex-col">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 text-white/80 hover:text-white text-4xl font-light leading-none"
              aria-label="Close"
            >
              ×
            </button>
            <div className="flex-1 flex items-center justify-center">
              <img
                src={selectedImage.screenshot_url}
                alt={selectedImage.page_title}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>
            <div className="mt-4 text-center">
              <p className="text-white font-ubuntu text-lg font-semibold mb-2">
                {selectedImage.page_title}
              </p>
              <a
                href={selectedImage.page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#4FFFE3] font-ubuntu text-sm hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {selectedImage.page_url}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
