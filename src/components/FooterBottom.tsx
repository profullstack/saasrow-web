'use client'

import { createContext, useContext, type ReactNode } from 'react'

// The footer's bottom bar (copyright + Profullstack webring) is @profullstack/footer,
// an async server component. app/layout.tsx renders it and hands it down here so the
// client <Footer> used by every view can place it, still in the server-rendered HTML.
const FooterBottomContext = createContext<ReactNode>(null)

export function FooterBottomProvider({ bottom, children }: { bottom: ReactNode; children: ReactNode }) {
  return <FooterBottomContext.Provider value={bottom}>{children}</FooterBottomContext.Provider>
}

export function useFooterBottom(): ReactNode {
  return useContext(FooterBottomContext)
}
