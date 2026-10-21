import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import type { BuildComparison } from '../../app/build-comparison'
import type { DeckCardInstance } from '../../app/model'
import type { BuildZones } from '../../app/saved-builds'
import { useEscapeKey } from '../../app/use-overlay'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { CloseButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { surface } from '../ui/surfaces'
import { BuildDeckView, sharedZones } from './BuildDeckView'
import type { Side } from './comparison-rows'
import { DeckResults } from './DeckResults'
import { SideBadge } from './SideBadge'

export interface StageBuild {
  name: string
  zones: BuildZones
  onCardClick: (card: DeckCardInstance) => void
}

/** Lo que ocupa cada cajón: pegados al VS (uno a cada lado), tan anchos como entren, y cuánto les falta para salir de la pantalla. */
interface DrawerLayout {
  width: number
  left: Record<Side, number>
  /** Distancia que hay que correrlos para que queden fuera de la pantalla (cada uno hacia su borde). */
  edge: Record<Side, number>
}

const DRAWER_MAX_WIDTH = 736
const DRAWER_GAP = 12

/**
 * El VS no está en el centro de la pantalla (el menú lateral le corre el centro a la página): los cajones se miden desde el VS, no desde los bordes,
 * para que queden pegados a él y no lo tapen. Los dos del mismo ancho (el que entre en el lado más angosto).
 */
function measureDrawers(vs: HTMLElement): DrawerLayout | null {
  const { left, right } = vs.getBoundingClientRect()
  const viewport = document.documentElement.clientWidth
  const width = Math.min(left - DRAWER_GAP, viewport - right - DRAWER_GAP, DRAWER_MAX_WIDTH)

  if (!(width > 0)) {
    return null
  }

  const leftB = right + DRAWER_GAP

  return { width, left: { A: left - DRAWER_GAP - width, B: leftB }, edge: { A: left - DRAWER_GAP - width, B: viewport - leftB - width } }
}

interface CompareStageProps {
  a: StageBuild
  b: StageBuild
  comparison: BuildComparison | null
  /** Copias de B menos A por carta del Main (sólo las que cambian). */
  deltaByCardId: ReadonlyMap<string, number>
}

/**
 * Las dos listas, una a cada lado, con un VS en el medio. El VS abre los resultados separados por mazo: en escritorio, dos cajones
 * (uno desde cada borde de la pantalla hacia el centro, casi hasta el VS); en el celular, una hoja con los dos mazos uno debajo del otro.
 */
export function CompareStage({ a, b, comparison, deltaByCardId }: CompareStageProps) {
  const [open, setOpen] = useState(false)
  const [layout, setLayout] = useState<DrawerLayout | null>(null)
  const vsRef = useRef<HTMLButtonElement>(null)
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const resultsId = useId()
  const close = () => setOpen(false)
  const remeasure = () => setLayout(vsRef.current ? measureDrawers(vsRef.current) : null)
  const toggle = () => {
    if (!open) {
      remeasure()
    }
    setOpen(!open)
  }
  const builds = { A: a, B: b } as const
  const zoneKeys = sharedZones(a.zones, b.zones)
  // En escritorio las dos listas comparten las filas de la grilla (el encabezado y una por zona), así cada zona queda a la par de la otra.
  const rows = zoneKeys.length + 1
  const results = (side: Side) => (comparison ? <DeckResults side={side} comparison={comparison} /> : null)

  useEscapeKey(close, open && isDesktop)
  useEffect(() => {
    if (!open || !isDesktop) {
      return undefined
    }

    window.addEventListener('resize', remeasure)
    return () => window.removeEventListener('resize', remeasure)
  }, [open, isDesktop])

  return (
    <>
      {/* La columna del medio es fija: el VS nunca cambia el ancho de las listas al abrir o cerrar los cajones. */}
      <div className="grid min-w-0 gap-5 min-[1101px]:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] min-[1101px]:gap-x-3 min-[1101px]:gap-y-0">
        <BuildDeckView side="A" name={a.name} zones={a.zones} deltaByCardId={deltaByCardId} onCardClick={a.onCardClick} aligned={isDesktop ? { zoneKeys, column: 1 } : undefined} />
        <VsButton
          open={open}
          controls={isDesktop ? `${resultsId}-A ${resultsId}-B` : undefined}
          onToggle={toggle}
          buttonRef={vsRef}
          style={isDesktop ? { gridColumn: 2, gridRow: `1 / span ${rows}` } : undefined}
        />
        <BuildDeckView side="B" name={b.name} zones={b.zones} deltaByCardId={deltaByCardId} onCardClick={b.onCardClick} aligned={isDesktop ? { zoneKeys, column: 3 } : undefined} />
      </div>

      {isDesktop ? (
        <>
          <Scrim open={open} onClose={close} />
          {(['A', 'B'] as const).map((side) => (
            <ResultsDrawer key={side} id={`${resultsId}-${side}`} side={side} name={builds[side].name} open={open} layout={layout} onClose={close}>
              {results(side)}
            </ResultsDrawer>
          ))}
        </>
      ) : (
        <Modal isOpen={open} onClose={close} size="md" title={t('meta.compare.resultsTitle')}>
          <div className="grid gap-8">
            {(['A', 'B'] as const).map((side) => (
              <section key={side} className="grid min-w-0 gap-4" aria-label={t('meta.compare.deckAria', { side, name: builds[side].name })}>
                <header className="flex min-w-0 items-center gap-2.5">
                  <SideBadge side={side} />
                  <strong className="truncate text-lead font-semibold text-foreground">{builds[side].name}</strong>
                </header>
                {results(side)}
              </section>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}

/**
 * El VS: un medallón grande entre las dos listas, con una línea que las separa. Sin rótulo (el texto cambiaba de ancho y movía las listas).
 * En escritorio acompaña al desplazar y queda por encima del velo de los cajones para poder cerrarlos desde ahí.
 */
function VsButton({ open, controls, onToggle, buttonRef, style }: { open: boolean; controls: string | undefined; onToggle: () => void; buttonRef: RefObject<HTMLButtonElement | null>; style: CSSProperties | undefined }) {
  return (
    <div className="grid justify-items-center max-[1101px]:py-1 min-[1101px]:self-stretch" style={style}>
      {/* El z-index va acá y no en el botón: un sticky arma su propio contexto de apilado. Queda por encima del velo (que va en el mismo contexto) para poder cerrar desde el VS. */}
      <div className="relative z-20 grid justify-items-center gap-2 min-[1101px]:sticky min-[1101px]:top-[26vh]">
        <span aria-hidden="true" className="hidden h-20 w-px bg-linear-to-b from-transparent to-primary/60 min-[1101px]:block" />
        <button
          ref={buttonRef}
          type="button"
          aria-label={t('meta.compare.vsLabel')}
          aria-expanded={open}
          aria-controls={controls}
          onClick={onToggle}
          className={cx(
            'grid size-[4.5rem] cursor-pointer place-items-center rounded-full border-0 bg-primary text-lead font-bold tracking-wide text-primary-foreground ring-4 outline-none transition-shadow duration-200 focus-visible:shadow-focus motion-reduce:transition-none',
            open ? 'scale-105 ring-primary/60' : 'ring-primary/25',
          )}
        >
          VS
        </button>
        <span aria-hidden="true" className="hidden h-20 w-px bg-linear-to-t from-transparent to-primary/60 min-[1101px]:block" />
      </div>
    </div>
  )
}

/**
 * Un velo suave sobre la página (por debajo de los cajones y del VS): los cajones se despegan del fondo. Tocarlo los cierra.
 * No va en <body>: tiene que estar en el mismo contexto de apilado que el VS (la pantalla tiene una animación de entrada que arma uno) para quedar por debajo de él.
 */
function Scrim({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      aria-hidden="true"
      data-results-scrim=""
      className={cx('fixed inset-0 z-10 bg-background/60 transition-opacity duration-300 motion-reduce:transition-none', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
      onClick={onClose}
    />
  )
}

/**
 * Un cajón fijo pegado al VS que entra desde el borde de la pantalla; el del otro lado entra a la vez. Proyectan sombra hacia adentro. Cerrado queda
 * fuera de pantalla, invisible y fuera del foco. Sin medidas (todavía no se abrió) usa la mitad de la pantalla menos lo que ocupa el VS.
 */
function ResultsDrawer({ id, side, name, open, layout, onClose, children }: { id: string; side: Side; name: string; open: boolean; layout: DrawerLayout | null; onClose: () => void; children: ReactNode }) {
  if (typeof document === 'undefined') {
    return null
  }

  const titleId = `${id}-title`

  return createPortal(
    <aside
      id={id}
      aria-labelledby={titleId}
      aria-hidden={!open}
      inert={!open}
      style={layout ? ({ left: layout.left[side], right: 'auto', width: layout.width, '--edge': `${layout.edge[side]}px` } as CSSProperties) : undefined}
      className={cx(
        'fixed inset-y-0 z-170 flex w-[min(46rem,calc(50vw-4.5rem))] min-w-[22rem] flex-col overflow-hidden transition-[transform,visibility] duration-300 ease-out motion-reduce:transition-none',
        surface.panel,
        side === 'A' ? 'left-0 rounded-l-none border-l-0' : 'right-0 rounded-r-none border-r-0',
        open ? cx('visible translate-x-0', side === 'A' ? 'shadow-[16px_0_48px_rgba(0,0,0,0.65)]!' : 'shadow-[-16px_0_48px_rgba(0,0,0,0.65)]!') : cx('invisible', side === 'A' ? '-translate-x-[calc(100%+var(--edge,0px))]' : 'translate-x-[calc(100%+var(--edge,0px))]'),
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <span className="flex min-w-0 items-center gap-2.5">
          <SideBadge side={side} />
          <Heading level="card" id={titleId} className="truncate">
            {name}
          </Heading>
        </span>
        <CloseButton size="sm" aria-label={t('common.close')} onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
    </aside>,
    document.body,
  )
}
