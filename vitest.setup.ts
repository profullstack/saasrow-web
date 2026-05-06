import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

function makeMemoryStorage() {
  const memory = new Map<string, string>()
  return {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
    key: (i: number) => Array.from(memory.keys())[i] ?? null,
    get length() {
      return memory.size
    },
  }
}

// Ensure window.localStorage / sessionStorage have working methods.
// vitest 4's jsdom environment may register them as objects without methods.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: makeMemoryStorage(),
    configurable: true,
    writable: false,
  })
  Object.defineProperty(window, 'sessionStorage', {
    value: makeMemoryStorage(),
    configurable: true,
    writable: false,
  })
}

afterEach(() => {
  cleanup()
})
