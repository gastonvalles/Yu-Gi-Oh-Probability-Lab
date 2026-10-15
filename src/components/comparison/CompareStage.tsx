import { useId, useState, type ReactNode } from 'react'
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
import { BuildDeckView } from './BuildDeckView'
import type { Side } from './comparison-rows'
import { DeckResults } from './DeckResults'
import { SideBadge } from './SideBadge'

export interface StageBuild {
  name: string
  zones: BuildZones
  onCardClick: (card: DeckCardInstance) => void
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
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const resultsId = useId()
  const close = () => setOpen(false)
  const builds = { A: a, B: b } as const
  const results = (side: Side) => (comparison ? <DeckResults side={side} comparison={comparison} /> : null)

  useEscapeKey(close, open && isDesktop)

  return (
    <>
      <div className="grid min-w-0 gap-5 min-[1101px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[1101px]:items-start">
        <BuildDeckView side="A" name={a.name} zones={a.zones} deltaByCardId={deltaByCardId} onCardClick={a.onCardClick} />
        <VsButton open={open} controls={isDesktop ? `${resultsId}-A ${resultsId}-B` : undefined} onToggle={() => setOpen((current) => !current)} />
        <BuildDeckView side="B" name={b.name} zones={b.zones} deltaByCardId={deltaByCardId} onCardClick={b.onCardClick} />
      </div>

      {isDesktop ? (
        <>
          <Scrim open={open} onClose={close} />
          {(['A', 'B'] as const).map((side) => (
            <ResultsDrawer key={side} id={`${resultsId}-${side}`} side={side} name={builds[side].name} open={open} onClose={close}>
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
 * El VS: un medallón grande entre las dos listas, con una línea que las separa y un rótulo que dice para qué sirve ("Resultados" / "Cerrar").
 * En escritorio acompaña al desplazar y queda por encima del velo de los cajones para poder cerrarlos desde ahí.
 */
function VsButton({ open, controls, onToggle }: { open: boolean; controls: string | undefined; onToggle: () => void }) {
  return (
    <div className="grid justify-items-center max-[1100px]:py-1 min-[1101px]:self-stretch">
      {/* El z-index va acá y no en el botón: un sticky arma su propio contexto de apilado. Queda por encima del velo (que va en el mismo contexto) para poder cerrar desde el VS. */}
      <div className="relative z-20 grid justify-items-center gap-2 min-[1101px]:sticky min-[1101px]:top-[26vh]">
        <span aria-hidden="true" className="hidden h-20 w-px bg-linear-to-b from-transparent to-primary/60 min-[1101px]:block" />
        <button
          type="button"
          aria-label={t('meta.compare.vsLabel')}
          aria-expanded={open}
          aria-controls={controls}
          onClick={onToggle}
          className={cx(
            'grid size-[4.5rem] cursor-pointer place-items-center rounded-full border-0 bg-primary text-lead font-bold tracking-wide text-primary-foreground shadow-brand ring-4 outline-none transition-[transform,box-shadow] duration-200 hover:scale-105 focus-visible:shadow-focus motion-reduce:transition-none',
            open ? 'scale-105 ring-primary/60' : 'ring-primary/25',
          )}
        >
          VS
        </button>
        <span aria-hidden="true" className="text-micro font-semibold uppercase tracking-wider text-primary-soft">
          {t(open ? 'meta.compare.vsClose' : 'meta.compare.vsResults')}
        </span>
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
 * Un cajón fijo contra un borde de la pantalla que entra hacia el centro; el del otro borde entra a la vez. Llegan casi hasta el VS y proyectan
 * sombra hacia adentro. Cerrado queda fuera de pantalla, invisible y fuera del foco.
 */
function ResultsDrawer({ id, side, name, open, onClose, children }: { id: string; side: Side; name: string; open: boolean; onClose: () => void; children: ReactNode }) {
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
      className={cx(
        'fixed inset-y-0 z-170 flex w-[min(46rem,calc(50vw-4.5rem))] min-w-[22rem] flex-col overflow-hidden transition-[transform,visibility] duration-300 ease-out motion-reduce:transition-none',
        surface.panel,
        side === 'A' ? 'left-0 rounded-l-none border-l-0' : 'right-0 rounded-r-none border-r-0',
        open ? cx('visible translate-x-0', side === 'A' ? 'shadow-[16px_0_48px_rgba(0,0,0,0.65)]!' : 'shadow-[-16px_0_48px_rgba(0,0,0,0.65)]!') : cx('invisible', side === 'A' ? '-translate-x-full' : 'translate-x-full'),
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
