import { useState, type CSSProperties } from 'react'

import type { RangeFit } from '../../app/pendulum-range'
import { useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Modal } from '../ui/Modal'
import { PILE_SHORT } from './MatDialogs'
import { FxFrame, PICK_ORDER } from './MatFx'

export interface PendulumPickCard {
  id: string
  name: string
  art: string | null
  from: 'hand' | 'extra'
  /** El nivel que se mira (`pendulumLevel`); `null` sin dato. */
  level: number | null
  fit: RangeFit
}

interface PendulumPickerProps {
  /** Las que se pueden elegir (`pendulumCandidates`), la mano primero. */
  cards: readonly PendulumPickCard[]
  /** El rango en palabras (`describeRange`): «Niveles 2 a 7» o «Sin rango». */
  range: string
  /** Arranca con éstas elegidas (la carta desde la que se abrió). */
  initial: readonly string[]
  /** Las elegidas, en el orden en que se eligieron. */
  onConfirm: (ids: string[]) => void
  onCancel: () => void
}

/**
 * Invocar varias por Péndulo en la mesa manual: una hoja con las cartas de la mano y las boca arriba del Extra, como la ventana de Master Duel, y el rango arriba (`describeRange`). Tocar elige o suelta
 * (el marco celeste y el número de orden de toda elección de varias). La que no entra en el rango va apagada y lo dice, **pero se puede elegir**: la mesa avisa y no frena (un efecto puede cambiar el
 * rango); sin rango (una escala sin dato) no se marca ninguna. Todas en una sola grilla, cada una con el chip de su lugar (la mano, violeta lleno, como en `CardPicker`): en el celular, cuatro por fila, así
 * la mano y el Extra entran juntos en la hoja. No tapa la mesa con un velo y se baja para mirar el campo (`lowerable`); la mesa no se mueve. Va dentro de un `Presence`.
 */
export function PendulumPicker({ cards, range, initial, onConfirm, onCancel }: PendulumPickerProps) {
  const leaving = useLeaving()
  const [picked, setPicked] = useState<string[]>(() => [...initial])
  // Si la mesa cambia por debajo (Deshacer), lo elegido se recorta a lo que sigue ahí.
  const chosen = picked.filter((id) => cards.some((card) => card.id === id))
  const toggle = (id: string) => setPicked(chosen.includes(id) ? chosen.filter((card) => card !== id) : [...chosen, id])

  const option = (card: PendulumPickCard, index: number) => {
    const order = chosen.indexOf(card.id)
    const on = order >= 0
    const out = card.fit === 'out'
    const level = card.level === null ? null : t('practice.pendulum.level', { level: card.level })
    const label = [card.name, PILE_SHORT[card.from], level, out ? t('practice.pendulum.out').toLocaleLowerCase() : null].filter(Boolean).join(', ')

    return (
      <li key={card.id} className="min-w-0">
        <button
          type="button"
          aria-pressed={on}
          aria-label={label}
          data-initial-focus={index === 0 ? '' : undefined}
          data-fit={card.fit}
          className="group @container grid w-full min-w-0 content-start gap-1 rounded-none bg-transparent p-0 text-left outline-none focus-visible:shadow-focus"
          onClick={() => toggle(card.id)}
        >
          <Badge size="sm" shape="tag" {...(card.from === 'hand' ? { tone: 'brand', solid: true } : {})} icon={card.from === 'hand' ? 'hand' : 'cards'} aria-hidden="true" className="min-w-0 max-w-full justify-self-start">
            <span className="min-w-0 truncate">{PILE_SHORT[card.from]}</span>
          </Badge>
          <span className={cx('relative block aspect-[421/614] w-full overflow-hidden bg-input transition-opacity duration-150 motion-reduce:transition-none', out && !on && 'opacity-40', !on && 'group-hover:outline-1 group-hover:outline-white/60')}>
            <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
            {on ? <FxFrame tone="cyan" /> : null}
            {on ? <span aria-hidden="true" className={PICK_ORDER}>{order + 1}</span> : null}
          </span>
          <span aria-hidden="true" className="grid min-w-0">
            <span className="truncate text-micro text-foreground">{card.name}</span>
            <span className={cx('text-micro', out ? 'line-clamp-2 font-semibold text-warning' : 'truncate text-soft')}>{out ? t('practice.pendulum.out') : (level ?? ' ')}</span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <Modal
      isOpen={!leaving}
      onClose={onCancel}
      size="fit"
      lowerable
      anchor="mat"
      veil={false}
      title={t('practice.menu.pendulumSummon')}
      subtitle={range}
      footer={
        <>
          <p role="status" className="m-0 mr-auto text-body tabular-nums text-muted">
            {t('practice.pendulum.status', { chosen: chosen.length, total: cards.length })}
          </p>
          <Button variant="tertiary" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="sm" disabled={chosen.length === 0} onClick={() => onConfirm(chosen)}>
            {t('practice.pendulum.confirm', { count: chosen.length })}
          </Button>
        </>
      }
    >
      {cards.length === 0 ? (
        <p className="m-0 text-body text-muted">{t('practice.pendulum.empty')}</p>
      ) : (
        // En el celular, cuatro por fila; desde 640 px, cartas de 6.5 rem y la hoja (`fit`) mide lo de la fila (hasta seis).
        <ul aria-label={t('practice.pendulum.cards')} style={{ '--n': Math.min(6, cards.length) } as CSSProperties} className="m-0 grid list-none grid-cols-4 gap-2 p-0 sm:grid-cols-[repeat(var(--n),6.5rem)]">
          {cards.map(option)}
        </ul>
      )}
    </Modal>
  )
}
