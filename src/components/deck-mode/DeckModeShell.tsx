import type { ReactNode, RefObject } from 'react'

import { cx } from '../ui/cx'

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
    <section className="grid min-h-dvh w-full min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-x-clip [background:radial-gradient(circle_at_top,rgb(var(--primary-rgb)/0.16),transparent_28%),linear-gradient(180deg,rgb(var(--background-rgb)/1),rgb(var(--secondary-rgb)/1))] max-[1100px]:min-h-screen min-[1101px]:h-dvh min-[1101px]:overflow-hidden">
      <header className="flex min-h-(--deck-mode-topbar-height) w-full min-w-0 items-center justify-center overflow-hidden border-b border-border/94 bg-linear-to-b from-secondary/96 to-background/99 px-4 py-2 max-[1100px]:hidden">
        {navigation}
      </header>
      <div
        ref={contentScrollRef}
        className={cx(
          'min-h-0 w-full min-w-0 [&>*]:min-w-0 max-[1100px]:overflow-visible min-[1101px]:h-full',
          contentScrollable ? 'min-[1101px]:overflow-y-auto' : 'min-[1101px]:overflow-hidden',
          Boolean(mobileNavigation) && 'max-[1100px]:pb-[calc(var(--deck-mobile-step-nav-height,4.3rem)+env(safe-area-inset-bottom,0px)+0.55rem)]',
        )}
      >
        {content}
      </div>
      {mobileNavigation ? <div className="min-[1101px]:hidden">{mobileNavigation}</div> : null}
    </section>
  )
}
