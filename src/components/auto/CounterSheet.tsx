import { useId, useState } from 'react'

import type { AskWhyView } from '../../app/auto/ask-why'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { AskWhy } from '../duel/AskWhy'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Stepper } from '../ui/Stepper'
import { listItemSelected } from '../ui/surfaces'
import { AutoPanel, PANEL_PRIMARY } from './AutoPanel'
import { PickCount, type PickCard } from './CardPicker'

interface CounterSheetProps {
  /** Las cartas con contadores, cada una con cuántos tiene (`has`). */
  cards: readonly (PickCard & { has: number })[]
  /** Cuántos pide el núcleo, en total. */
  need: number
  /** Cuántos se sacan de cada carta, en el orden de `cards`. */
  onPick: (counts: number[]) => void
  /** De qué carta es y si es su costo o su efecto (`AskWhy`), arriba del título. */
  why?: AskWhyView | null
}

/**
 * Sacar contadores (`select_counter`: «sacá 3 contadores de tu campo») en el cartel del automático (`AutoPanel`): una fila por carta, con su arte, cuántos tiene y un `Stepper` de 0 a lo que se le puede
 * sacar (lo que tiene, y nunca más del total). La fila con alguno lleva el aro de lo elegido. «Sacar contadores» se enciende con el total justo. Hay que contestar: Escape lo minimiza,
 * sin contestar. Va dentro de un `Presence` (así sale al contestarse).
 */
export function CounterSheet({ cards, need, onPick, why }: CounterSheetProps) {
  const whyId = useId()
  const [counts, setCounts] = useState(() => cards.map(() => 0))
  const total = counts.reduce((sum, count) => sum + count, 0)
  const title = t('auto.counter.title', { count: need })

  return (
    <AutoPanel
      kind="counters"
      label={title}
      {...(why ? { describedBy: whyId } : {})}
      focus="button"
      escape
      top={
        <>
          {why ? <AskWhy id={whyId} why={why} /> : null}
          <p className="m-0 text-micro text-muted">{t('auto.counter.hint')}</p>
        </>
      }
      aside={<PickCount chosen={total} max={need} />}
      actions={
        <Button variant="primary" className={cx(PANEL_PRIMARY, 'ml-auto')} disabled={total !== need} onClick={() => onPick(counts)}>
          {t('auto.counter.done')}
        </Button>
      }
    >
      <ul aria-label={title} className="m-0 grid list-none gap-1 p-0">
        {cards.map((card, index) => {
          const count = counts[index]!

          return (
            <li key={card.key} className={cx('flex min-w-0 items-center gap-2.5 rounded-control p-1.5 transition-colors duration-150 motion-reduce:transition-none', count > 0 && listItemSelected)}>
              {/* `rounded-none`: las cartas van rectas. La imagen no se lee: el nombre ya va al lado. */}
              <span aria-hidden="true" className="relative aspect-[421/614] w-10 shrink-0 overflow-hidden rounded-none bg-input">
                <CardArt remoteUrl={card.art ?? null} name={card.name} className="block h-full w-full object-cover" />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-body font-semibold text-foreground">{card.name}</span>
                <span className="text-micro text-muted">{[card.place, t('auto.counter.has', { count: card.has })].filter(Boolean).join(' · ')}</span>
              </span>
              <Stepper
                size="lg"
                label={t('auto.counter.remove', { name: card.name })}
                value={count}
                min={0}
                max={Math.min(card.has, need - total + count)}
                onChange={(value) => setCounts((current) => current.map((old, at) => (at === index ? value : old)))}
              />
            </li>
          )
        })}
      </ul>
    </AutoPanel>
  )
}
