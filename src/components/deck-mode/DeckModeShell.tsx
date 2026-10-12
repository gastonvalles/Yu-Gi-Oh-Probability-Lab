import type { ReactNode, RefObject } from 'react'

import { cx } from '../ui/cx'
import { MascotPicker } from '../mascot/MascotPicker'
import { LegalLink, SiteCredit, SocialLinks } from '../ui/SocialLinks'
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
      {/* Con siete pestañas, la barra sólo se centra en la pantalla cuando sobra lugar a los costados (2xl); antes, la marca y las redes ocupan lo que necesitan y las pestañas se centran en el resto. */}
      <header className="grid min-h-(--deck-mode-topbar-height) w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-border-subtle bg-card-background/70 px-5 py-2 max-[1100px]:hidden min-[1536px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <DeckModeBrand />
        <div className="flex min-w-0 justify-center">{navigation}</div>
        <div className="flex min-w-0 items-center gap-3 justify-self-end">
          <SiteCredit className="hidden whitespace-nowrap min-[1280px]:block" />
          <MascotPicker placement="below" />
          <div className="flex items-center gap-1">
            <SocialLinks />
            <LegalLink />
          </div>
        </div>
      </header>
      <div
        ref={contentScrollRef}
        className={cx(
          'min-h-0 w-full min-w-0 [&>*]:min-w-0 max-[1100px]:overflow-visible min-[1101px]:h-full',
          contentScrollable ? 'min-[1101px]:overflow-y-auto' : 'min-[1101px]:overflow-hidden',
        )}
      >
        {content}
      </div>
      {/* En mobile las redes van al pie de la página (en desktop están en la barra de arriba). El pie es el que
          deja lugar a la barra de pasos fija: va fuera del contenido, porque los pasos a altura completa lo empujarían
          debajo de la barra. */}
      <footer
        className={cx(
          'grid justify-items-center gap-1 px-gutter pt-4 text-center min-[1101px]:hidden',
          mobileNavigation ? 'pb-[calc(var(--deck-mobile-step-nav-height,4.3rem)+env(safe-area-inset-bottom,0px)+0.8rem)]' : 'pb-4',
        )}
      >
        <div className="flex items-center gap-1">
          <MascotPicker placement="above" />
          <SocialLinks />
          <LegalLink />
        </div>
        <SiteCredit withDisclaimer />
      </footer>
      {mobileNavigation ? <div className="min-[1101px]:hidden">{mobileNavigation}</div> : null}
    </section>
  )
}
