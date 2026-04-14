import type { ReactNode, RefObject } from 'react'

interface DeckModeShellProps {
  navigation: ReactNode
  mobileNavigation?: ReactNode
  content: ReactNode
  contentScrollRef?: RefObject<HTMLDivElement | null>
  contentScrollable?: boolean
}

export function DeckModeShell({
  navigation,
  mobileNavigation = null,
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
          mobileNavigation ? 'deck-mode-shell-mobile-nav-offset' : '',
          contentScrollable ? 'deck-mode-content-shell-scrollable' : '',
        ].join(' ').trim()}
      >
        {content}
      </div>
      {mobileNavigation ? <div className="min-[1101px]:hidden">{mobileNavigation}</div> : null}
    </section>
  )
}
