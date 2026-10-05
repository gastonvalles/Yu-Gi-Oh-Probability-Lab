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
          mobileNavigation
            ? 'max-[1100px]:pb-[calc(var(--deck-mobile-step-nav-height,4.3rem)+env(safe-area-inset-bottom,0px)+0.55rem)]'
            : '',
          contentScrollable ? 'deck-mode-content-shell-scrollable' : '',
        ].join(' ').trim()}
      >
        {content}
      </div>
      {mobileNavigation ? <div className="min-[1101px]:hidden">{mobileNavigation}</div> : null}
    </section>
  )
}
