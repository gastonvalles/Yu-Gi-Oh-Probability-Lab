import { useState } from 'react'

import { atLeastProbability, minCopiesFor } from '../../app/quick-odds'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Modal } from '../ui/Modal'
import { ProgressRing } from '../ui/ProgressRing'
import { formatPer100 } from '../ui/ring-shared'
import { Segmented } from '../ui/Segmented'
import { field } from '../ui/surfaces'
import { judgeTone } from '../ui/tone'
import { overline } from '../ui/typography'
import { formatCardCount } from './lab-copy'

interface QuickCalculatorProps {
  isOpen: boolean
  onClose: () => void
  /** Cartas del Main actual (0 sin deck): el botón "Usar mi deck". */
  deckSize: number
  /** Mano yendo primero (la de la app); yendo segundo es una más. */
  handSize: number
}

type Turn = 'first' | 'second'

const AT_LEAST = [1, 2, 3] as const
const MAX_DECK = 100
const INPUT = cx(field, 'h-11 w-full px-3 text-body tabular-nums')

/** Lo tecleado, acotado; vacío o basura vale `fallback`. */
function clampInt(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

/** Cómo arranca cada vez que se abre: el Main actual (40 sin deck), 3 copias, yendo primero y el 60 %. */
const fresh = (deckSize: number) => ({ deck: String(deckSize > 0 ? deckSize : 40), copies: '3', turn: 'first' as Turn, target: '60' })

/**
 * Cuentas sin armar el deck: con N copias en un deck de M, cuántas manos la abren, y cuántas copias hacen falta para llegar a un %.
 * Queda montada (así sale al cerrarse): arranca de cero cada vez que se abre, no al cerrarse.
 */
export function QuickCalculator({ isOpen, onClose, deckSize, handSize }: QuickCalculatorProps) {
  const [{ deck, copies, turn, target }, setForm] = useState(() => fresh(deckSize))
  const [wasOpen, setWasOpen] = useState(isOpen)
  const set = (patch: Partial<ReturnType<typeof fresh>>) => setForm((current) => ({ ...current, ...patch }))

  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (isOpen) setForm(fresh(deckSize))
  }

  const cards = clampInt(deck, 1, MAX_DECK, 40)
  const hand = turn === 'first' ? handSize : handSize + 1
  const count = clampInt(copies, 0, cards, 0)
  const wanted = clampInt(target, 1, 100, 60)
  const needed = minCopiesFor(cards, hand, wanted / 100)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" icon="sliders" kicker={t('lab.quick.kicker')} title={t('lab.quick.title')} subtitle={t('lab.quick.subtitle')}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-micro text-muted">{t('lab.quick.deckCards')}</span>
            <input type="number" inputMode="numeric" min={1} max={MAX_DECK} value={deck} className={INPUT} onChange={(event) => set({ deck: event.target.value })} />
          </label>
          <label className="grid gap-1">
            <span className="text-micro text-muted">{t('lab.quick.copies')}</span>
            <input type="number" inputMode="numeric" min={0} max={cards} value={copies} className={INPUT} onChange={(event) => set({ copies: event.target.value })} />
          </label>
        </div>

        {deckSize > 0 && cards !== deckSize ? (
          <Button variant="tertiary" size="sm" icon="cards" className="justify-self-start" onClick={() => set({ deck: String(deckSize) })}>
            {t('lab.quick.useDeck', { count: deckSize, n: formatInteger(deckSize) })}
          </Button>
        ) : null}

        <Segmented
          label={t('lab.quick.turn')}
          value={turn}
          onChange={(value) => set({ turn: value })}
          variant="track"
          size="sm"
          fullWidth
          options={[
            { value: 'first', label: t('lab.quick.goingFirst'), detail: formatCardCount(handSize) },
            { value: 'second', label: t('lab.quick.goingSecond'), detail: formatCardCount(handSize + 1) },
          ]}
        />

        {/* La unidad se dice una vez para los tres anillos: cada uno muestra su entero «de cada 100» (el decimal va en su nombre). */}
        <div className="grid gap-2">
          <p className={cx('m-0', overline)}>{t('lab.quick.per100')}</p>
          <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0" aria-label={t('lab.quick.handsList')}>
            {AT_LEAST.map((atLeast) => {
              const probability = atLeastProbability(cards, count, hand, atLeast)
  
              return (
                <li key={atLeast} className="grid justify-items-center gap-1.5 text-center">
                  <ProgressRing
                    value={probability}
                    tone={judgeTone(true)}
                    size={84}
                    strokeWidth={8}
                    format={formatPer100}
                    label={`${t('lab.quick.atLeast', { n: formatInteger(atLeast) })}: ${formatShortPercent(probability)}`}
                  />
                  <span className="text-micro text-muted">{t('lab.quick.atLeast', { n: formatInteger(atLeast) })}</span>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Al revés: cuántas copias hacen falta para abrirla en tantas manos. */}
        <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-2 border-t border-border-subtle pt-4 text-body text-muted">
          <label className="inline-flex items-center gap-1.5">
            {tRich('lab.quick.reverse', {
              field: () => (
                <input type="number" inputMode="numeric" min={1} max={100} value={target} aria-label={t('lab.quick.targetPercent')} className={cx(field, 'h-9 pointer-coarse:h-11 w-16 px-2 text-center text-body tabular-nums')} onChange={(event) => set({ target: event.target.value })} />
              ),
            })}
          </label>
          <strong className="text-foreground" data-testid="needed-copies">
            {needed === null
              ? t('lab.quick.notEnough')
              : t('lab.quick.needed', { count: needed, n: formatInteger(needed), percent: formatShortPercent(atLeastProbability(cards, needed, hand, 1)) })}
          </strong>
        </p>
      </div>
    </Modal>
  )
}
