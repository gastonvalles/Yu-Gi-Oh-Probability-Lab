import type { ReactNode, RefObject } from 'react'

interface DeckModeShellProps {
  sidebar: ReactNode
  mobileBottomNav?: ReactNode
  main: ReactNode
  rail?: ReactNode
  mainScrollable?: boolean
  mainScrollRef?: RefObject<HTMLDivElement | null>
}

export function DeckModeShell({
  sidebar,
  mobileBottomNav,
  main,
  rail,
  mainScrollable = false,
  mainScrollRef,
}: DeckModeShellProps) {
  const mainAreaClassName = mainScrollable
    ? 'min-w-0 overflow-x-hidden min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:overflow-y-auto min-[1101px]:pr-1'
    : 'min-w-0 overflow-x-hidden min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:overflow-hidden'

  return (
    <section
      className={[
        'grid gap-3 min-[1101px]:h-[calc(100dvh-1rem)] min-[1101px]:min-h-0 min-[1101px]:grid-cols-[280px_minmax(0,1fr)] min-[1101px]:items-stretch min-[1101px]:overflow-hidden',
        mobileBottomNav ? 'deck-mode-shell-mobile-nav-offset' : '',
      ].join(' ').trim()}
    >
      <div className="max-[1100px]:hidden min-[1101px]:h-full min-[1101px]:min-h-0">
        {sidebar}
      </div>

      <section className="min-w-0 min-[1101px]:h-full min-[1101px]:min-h-0">
        <div
          className={[
            'grid gap-3 min-[1101px]:h-full min-[1101px]:min-h-0',
            rail ? 'min-[1101px]:grid-cols-[minmax(0,1fr)_360px]' : '',
          ].join(' ').trim()}
        >
          <div ref={mainScrollRef} className={mainAreaClassName}>
            {main}
          </div>

          {rail ? (
            <aside className="max-[1100px]:hidden min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:overflow-hidden">
              {rail}
            </aside>
          ) : null}
        </div>
      </section>

      {mobileBottomNav ? <div className="min-[1101px]:hidden">{mobileBottomNav}</div> : null}
    </section>
  )
}
