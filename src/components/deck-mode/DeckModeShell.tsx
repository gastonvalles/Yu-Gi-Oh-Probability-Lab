import type { ReactNode, RefObject } from 'react'

interface DeckModeShellProps {
  navigation: ReactNode
  content: ReactNode
  contentScrollRef?: RefObject<HTMLDivElement | null>
  contentScrollable?: boolean
}

export function DeckModeShell({
  navigation,
  content,
  contentScrollRef,
  contentScrollable = false,
}: DeckModeShellProps) {
  return (
    <section className="deck-mode-app-shell">
      <header className="deck-mode-topbar">{navigation}</header>
      <div
        ref={contentScrollRef}
        className={[
          'deck-mode-content-shell',
          contentScrollable ? 'deck-mode-content-shell-scrollable' : '',
        ].join(' ').trim()}
      >
        {content}
      </div>
    </section>
  )
}
