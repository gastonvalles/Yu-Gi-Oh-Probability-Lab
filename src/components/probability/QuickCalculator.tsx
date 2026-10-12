import { useState } from 'react'

import { atLeastProbability, minCopiesFor } from '../../app/quick-odds'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Modal } from '../ui/Modal'
import { ProgressRing } from '../ui/ProgressRing'
import { Segmented } from '../ui/Segmented'
import { field } from '../ui/surfaces'

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

/** Cuentas sin armar el deck: con N copias en un deck de M, cuántas manos la abren, y cuántas copias hacen falta para llegar a un %. */
export function QuickCalculator({ isOpen, onClose, deckSize, handSize }: QuickCalculatorProps) {
  const [deck, setDeck] = useState(String(deckSize > 0 ? deckSize : 40))
  const [copies, setCopies] = useState('3')
  const [turn, setTurn] = useState<Turn>('first')
  const [target, setTarget] = useState('60')

  const cards = clampInt(deck, 1, MAX_DECK, 40)
  const hand = turn === 'first' ? handSize : handSize + 1
  const count = clampInt(copies, 0, cards, 0)
  const wanted = clampInt(target, 1, 100, 60)
  const needed = minCopiesFor(cards, hand, wanted / 100)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" icon="sliders" kicker="Lab" title="Calculadora rápida" subtitle="Una carta (o un grupo que contás junto), sin armar el deck.">
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-micro text-muted">Cartas en el deck</span>
            <input type="number" inputMode="numeric" min={1} max={MAX_DECK} value={deck} className={INPUT} onChange={(event) => setDeck(event.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-micro text-muted">Copias</span>
            <input type="number" inputMode="numeric" min={0} max={cards} value={copies} className={INPUT} onChange={(event) => setCopies(event.target.value)} />
          </label>
        </div>

        {deckSize > 0 && cards !== deckSize ? (
          <Button variant="tertiary" size="sm" icon="cards" className="justify-self-start" onClick={() => setDeck(String(deckSize))}>
            Usar mi deck ({formatInteger(deckSize)} cartas)
          </Button>
        ) : null}

        <Segmented
          label="Turno"
          value={turn}
          onChange={setTurn}
          variant="track"
          size="sm"
          fullWidth
          options={[
            { value: 'first', label: 'Yendo 1º', detail: `${formatInteger(handSize)} cartas` },
            { value: 'second', label: 'Yendo 2º', detail: `${formatInteger(handSize + 1)} cartas` },
          ]}
        />

        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0" aria-label="Manos que la abren">
          {AT_LEAST.map((atLeast) => {
            const probability = atLeastProbability(cards, count, hand, atLeast)

            return (
              <li key={atLeast} className="grid justify-items-center gap-1.5 text-center">
                <ProgressRing value={probability} size={84} strokeWidth={9} label={`Al menos ${formatInteger(atLeast)}: ${formatShortPercent(probability)}`}>
                  <span className="text-body font-semibold">{formatShortPercent(probability)}</span>
                </ProgressRing>
                <span className="text-micro text-muted">Al menos {formatInteger(atLeast)}</span>
              </li>
            )
          })}
        </ul>

        {/* Al revés: cuántas copias hacen falta para abrirla en tantas manos. */}
        <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-2 border-t border-border-subtle pt-4 text-body text-muted">
          <label className="inline-flex items-center gap-1.5">
            Para abrirla en al menos
            <input type="number" inputMode="numeric" min={1} max={100} value={target} aria-label="Porcentaje buscado" className={cx(field, 'h-9 w-16 px-2 text-center text-body tabular-nums')} onChange={(event) => setTarget(event.target.value)} />
            % de las manos
          </label>
          <strong className="text-foreground" data-testid="needed-copies">
            {needed === null
              ? 'no alcanza ni con todo el deck.'
              : `hacen falta ${formatInteger(needed)} ${needed === 1 ? 'copia' : 'copias'} (${formatShortPercent(atLeastProbability(cards, needed, hand, 1))}).`}
          </strong>
        </p>
      </div>
    </Modal>
  )
}
