import type { ReactNode, RefObject } from 'react'

import { cx } from '../ui/cx'
import { SocialLinks } from '../ui/SocialLinks'
import { DeckModeBrand } from './DeckModeBrand'

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
    <section className="grid min-h-dvh w-full min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-x-clip max-[1100px]:min-h-screen min-[1101px]:h-dvh min-[1101px]:overflow-hidden">
      <header className="grid min-h-(--deck-mode-topbar-height) w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-border-subtle bg-card-background/70 px-5 py-2 max-[1100px]:hidden">
        <DeckModeBrand />
        {navigation}
        <SocialLinks className="justify-self-end" />
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
        {/* En mobile las redes van al pie de la página; en desktop están en la barra de arriba. */}
        <footer className="flex justify-center px-gutter pb-3 pt-4 min-[1101px]:hidden">
          <SocialLinks />
        </footer>
      </div>
      {mobileNavigation ? <div className="min-[1101px]:hidden">{mobileNavigation}</div> : null}
    </section>
  )
}
