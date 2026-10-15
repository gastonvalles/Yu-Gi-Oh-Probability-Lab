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
 * (uno desde cada borde de la pantalla hacia el centro); en el celular, una hoja con los dos mazos uno debajo del otro.
 */
export function CompareStage({ a, b, comparison, deltaByCardId }: CompareStageProps) {
  const [open, setOpen] = useState(false)
  const [onlyDiffs, setOnlyDiffs] = useState(true)
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const resultsId = useId()
  const close = () => setOpen(false)
  const builds = { A: a, B: b } as const
  const results = (side: Side) => (comparison ? <DeckResults side={side} comparison={comparison} onlyDiffs={onlyDiffs} onOnlyDiffsChange={setOnlyDiffs} /> : null)

  useEscapeKey(close, open && isDesktop)

  return (
    <>
      <div className="grid min-w-0 gap-5 min-[1101px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[1101px]:items-start">
        <BuildDeckView side="A" name={a.name} zones={a.zones} deltaByCardId={deltaByCardId} onCardClick={a.onCardClick} />
        <div className="grid justify-items-center min-[1101px]:self-stretch">
          <button
            type="button"
            aria-label={t('meta.compare.vsLabel')}
            aria-expanded={open}
            aria-controls={isDesktop ? `${resultsId}-A ${resultsId}-B` : undefined}
            onClick={() => setOpen((current) => !current)}
            className={cx(
              'grid size-14 cursor-pointer place-items-center rounded-full border-0 bg-primary text-body font-bold text-primary-foreground shadow-brand outline-none transition-transform duration-150 hover:scale-105 focus-visible:shadow-focus motion-reduce:transition-none min-[1101px]:sticky min-[1101px]:top-[38vh]',
              open && 'ring-2 ring-primary/50',
            )}
          >
            VS
          </button>
        </div>
        <BuildDeckView side="B" name={b.name} zones={b.zones} deltaByCardId={deltaByCardId} onCardClick={b.onCardClick} />
      </div>

      {isDesktop ? (
        (['A', 'B'] as const).map((side) => (
          <ResultsDrawer key={side} id={`${resultsId}-${side}`} side={side} name={builds[side].name} open={open} onClose={close}>
            {results(side)}
          </ResultsDrawer>
        ))
      ) : (
        <Modal isOpen={open} onClose={close} size="md" title={t('meta.compare.resultsTitle')}>
          <div className="grid gap-6">
            {(['A', 'B'] as const).map((side) => (
              <section key={side} className="grid min-w-0 gap-3" aria-label={t('meta.compare.deckAria', { side, name: builds[side].name })}>
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
 * Un cajón fijo contra un borde de la pantalla que entra hacia el centro; el del otro borde entra a la vez. No hay velo: las listas y el VS
 * siguen a la vista y a mano (el VS lo cierra). Cerrado queda fuera de pantalla y fuera del foco.
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
        'fixed inset-y-0 z-170 flex w-[min(28rem,34vw)] min-w-[20rem] flex-col overflow-hidden transition-transform duration-300 ease-out motion-reduce:transition-none',
        surface.panel,
        side === 'A' ? 'left-0 rounded-l-none border-l-0' : 'right-0 rounded-r-none border-r-0',
        open ? 'translate-x-0' : side === 'A' ? '-translate-x-full' : 'translate-x-full',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <SideBadge side={side} />
          <Heading level="card" id={titleId} className="truncate">
            {name}
          </Heading>
        </span>
        <CloseButton size="sm" aria-label={t('common.close')} onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>,
    document.body,
  )
}
