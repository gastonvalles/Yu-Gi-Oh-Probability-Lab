import { useState } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Modal } from '../ui/Modal'
import { Stepper } from '../ui/Stepper'
import { listItemSelected } from '../ui/surfaces'
import type { PickCard } from './CardPicker'

interface CounterSheetProps {
  /** Las cartas con contadores, cada una con cuántos tiene (`has`). */
  cards: readonly (PickCard & { has: number })[]
  /** Cuántos pide el núcleo, en total. */
  need: number
  /** Cuántos se sacan de cada carta, en el orden de `cards`. */
  onPick: (counts: number[]) => void
}

/**
 * Sacar contadores (`select_counter`: «sacá 3 contadores de tu campo») en una hoja chica (`Modal keypad`): una fila por carta, con su arte, cuántos tiene y un `Stepper` de 0 a lo que se le puede
 * sacar (lo que tiene, y nunca más del total). La fila con alguno lleva el aro de lo elegido. «Sacar contadores» se enciende con el total justo. Hay que contestar: no se cierra con Escape ni tocando
 * afuera (en el celular, su asa la baja sin contestar). Va dentro de un `Presence` (así sale al contestarse).
 */
export function CounterSheet({ cards, need, onPick }: CounterSheetProps) {
  const leaving = useLeaving()
  const [counts, setCounts] = useState(() => cards.map(() => 0))
  const total = counts.reduce((sum, count) => sum + count, 0)
  const title = t('auto.counter.title', { count: need })

  useEscapeKey(() => {}, !leaving)

  return (
    <Modal
      isOpen={!leaving}
      onClose={() => {}}
      dismissible={false}
      size="keypad"
      lowerable
      veil={false}
      title={title}
      subtitle={t('auto.counter.hint')}
      footer={
        <>
          <p role="status" className="m-0 mr-auto text-body tabular-nums text-muted">
            {t('auto.picker.status', { chosen: total, max: need })}
          </p>
          <Button variant="primary" size="sm" disabled={total !== need} onClick={() => onPick(counts)}>
            {t('auto.counter.done')}
          </Button>
        </>
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
                <span className="text-micro text-soft">{[card.place, t('auto.counter.has', { count: card.has })].filter(Boolean).join(' · ')}</span>
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
    </Modal>
  )
}
