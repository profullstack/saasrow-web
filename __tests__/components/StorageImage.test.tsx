import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    storage: { from: (b: string) => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/${b}/${p}` } }) }) },
  },
}))

import StorageImage, { monogram } from '../../src/components/StorageImage'

describe('StorageImage', () => {
  it('renders the object, then a letter tile when it fails to load', () => {
    render(<StorageImage bucket="software-logos" path="a.png" title="Acme" />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('https://x/software-logos/a.png')
    fireEvent.error(img)
    expect(screen.getByRole('img').textContent).toBe('A')
    expect(document.querySelector('img')).toBeNull()
  })
  it('monogram handles empty and non-latin titles', () => {
    expect(monogram('')).toBe('?')
    expect(monogram('  zed')).toBe('Z')
  })
})
