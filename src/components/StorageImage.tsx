'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  bucket: 'software-logos' | 'software-images'
  path: string
  /** Listing title: used for alt text and the letter shown when the object is missing. */
  title: string
  alt?: string
  className?: string
  /** Classes for the fallback tile (size/shape); defaults to className. */
  fallbackClassName?: string
}

export function monogram(title: string): string {
  const ch = Array.from((title || '').trim())[0]
  return ch ? ch.toUpperCase() : '?'
}

/**
 * Renders a storage object, and a letter tile instead when it is missing
 * (the row can point at an object that was never uploaded or was deleted).
 */
export default function StorageImage({ bucket, path, title, alt, className, fallbackClassName }: Props) {
  const [failedPath, setFailedPath] = useState<string | null>(null)
  if (failedPath === path) {
    return (
      <div
        role="img"
        aria-label={alt ?? title}
        className={`${fallbackClassName ?? className ?? ''} flex items-center justify-center bg-[#4FFFE3]/10 text-[#4FFFE3] font-bold font-ubuntu select-none`}
      >
        {monogram(title)}
      </div>
    )
  }
  // A few rows hold a full URL rather than a storage path.
  const src = /^https?:\/\//i.test(path) ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  return (
    <img
      src={src}
      loading="lazy"
      decoding="async"
      alt={alt ?? title}
      className={className}
      onError={() => setFailedPath(path)}
    />
  )
}
