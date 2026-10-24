import { useId, useState, type KeyboardEvent } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/Skeleton'

/** Una carta para elegir u ordenar. */
export interface PickCard {
  key: string
  name: string
  /** El arte; `undefined` mientras llega (un esqueleto quieto), `null` si no hay (las iniciales). */
  art?: string | null
  /** De dónde es («Cementerio», «Mano del rival»): una línea chica debajo del nombre. */
  place?: string
}

interface PickGridProps {
  /** El nombre de la lista para el lector de pantalla. */
  label: string
  cards: readonly PickCard[]
  /** Las elegidas, en el orden en que se eligieron: llevan el aro ámbar y su número. */
  chosen: readonly string[]
  /** Un toque, Espacio o Enter; `range` con Mayús (el tramo desde la última). */
  onToggle: (key: string, range: boolean) => void
  /** Se eligen varias (`aria-multiselectable`, y Mayús+clic para el tramo). */
  multi: boolean
  /** Las columnas de la grilla. */
  className?: string
}

/**
 * La grilla de cartas para elegir, con el aro ámbar y el número de orden de `PileViewer` eligiendo varias (no se extrajo de ahí: allá son botones con `aria-pressed` y acá un `listbox`). Se recorre con
 * las flechas (arriba y abajo, una fila), Inicio y Fin, con un solo lugar de tabulación; Espacio o Enter eligen. Mientras llega el arte de una carta, un esqueleto quieto (son decenas a la vez).
 */
export function PickGrid({ label, cards, chosen, onToggle, multi, className }: PickGridProps) {
  const [active, setActive] = useState(0)
  const at = Math.min(active, cards.length - 1)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').filter(Boolean).length || 1
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Object.hasOwn(step, event.key) ? Math.min(cards.length - 1, Math.max(0, at + step[event.key]!)) : null

    if (next !== null) {
      const option = event.currentTarget.children[next] as HTMLElement | undefined

      event.preventDefault()
      setActive(next)
      option?.focus()
    } else if ((event.key === ' ' || event.key === 'Enter') && cards[at]) {
      event.preventDefault()
      onToggle(cards[at].key, event.shiftKey)
    }
  }

  return (
    <div role="listbox" aria-label={label} aria-multiselectable={multi || undefined} className={cx('grid gap-2', className)} onKeyDown={onKeyDown}>
      {cards.map((card, index) => {
        const order = chosen.indexOf(card.key)
        const name = order >= 0 ? t('practice.many.order', { name: card.name, n: order + 1 }) : card.name

        return (
          <div
            key={card.key}
            role="option"
            tabIndex={index === at ? 0 : -1}
            // Al abrirse la hoja, el foco va a las cartas (no a la X).
            data-initial-focus={index === at ? '' : undefined}
            aria-selected={order >= 0}
            aria-label={card.place ? `${name}, ${card.place}` : name}
            title={multi ? t('practice.many.range') : undefined}
            className="group grid min-w-0 cursor-pointer content-start gap-1 rounded-none outline-none focus-visible:shadow-focus"
            onClick={(event) => {
              setActive(index)
              onToggle(card.key, event.shiftKey)
            }}
          >
            {/* La elegida, un aro ámbar de 2 px por fuera; al pasar el mouse, el mismo aro, tenue. */}
            <span className={cx('relative block aspect-[421/614] w-full overflow-hidden bg-input shadow-[0_4px_10px_rgba(0,0,0,0.4)]', order >= 0 ? 'outline-2 outline-info' : 'group-hover:outline-2 group-hover:outline-info/45')}>
              {card.art === undefined ? <Skeleton still radius="none" className="absolute inset-0" /> : <CardArt tilt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />}
              {order >= 0 ? <span aria-hidden="true" className="absolute right-0.5 top-0.5 z-4 grid h-5 min-w-5 place-items-center rounded-full bg-info px-1 text-micro font-bold leading-none tabular-nums text-info-foreground">{order + 1}</span> : null}
            </span>
            <span aria-hidden="true" className="grid min-w-0">
              <span className="truncate text-micro text-foreground">{card.name}</span>
              {card.place ? <span className="truncate text-micro text-soft">{card.place}</span> : null}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Lo elegido en una `PickGrid`, en el orden en que se eligió: tocar elige o suelta (las de después se corren) y Mayús elige el tramo desde la última tocada; nunca más de `max`. */
export function usePicked(cards: readonly PickCard[], max: number) {
  const [chosen, setChosen] = useState<string[]>([])
  const [last, setLast] = useState<string | null>(null)

  const toggle = (key: string, range: boolean) => {
    const keys = cards.map((card) => card.key)
    const from = range && last !== null ? keys.indexOf(last) : -1
    const to = keys.indexOf(key)

    setLast(key)
    setChosen((current) => {
      if (from >= 0 && from !== to) {
        // El tramo en el orden que se ve, como si se tocaran de a una desde la última, hasta el tope.
        const span = keys.slice(Math.min(from, to), Math.max(from, to) + 1)

        return [...current, ...(from < to ? span : span.reverse()).filter((card) => !current.includes(card))].slice(0, max)
      }

      return current.includes(key) ? current.filter((card) => card !== key) : current.length < max ? [...current, key] : current
    })
  }

  return [chosen, toggle] as const
}

interface CardPickerProps {
  /** Lo que pide el núcleo (el `HINT_SELECTMSG`), o «Elegí cartas». */
  title: string
  /** Arriba del título: la carta que pide elegir. */
  kicker?: string
  cards: readonly PickCard[]
  min: number
  max: number
  /** Las elegidas, en el orden en que se eligieron. Con `max` 1, el primer toque contesta. */
  onPick: (keys: string[]) => void
  /** Sólo si la pregunta se puede cancelar (`can_cancel`): «Cancelar», la X y Escape. Sin esto, hay que contestar. */
  onCancel?: () => void
}

/**
 * Elegir de `min` a `max` cartas de una lista que no está en el campo ni en una sola pila (de varios lugares, o por código), en una hoja (`Modal sheet`; en el celular sale de abajo). Tocar elige o suelta
 * (aro ámbar y número de orden), Mayús+clic elige el tramo; nunca más de `max`. Con `max` 1 un toque contesta; si no, la principal («Elegir 2 cartas», o «Listo» si se puede no elegir ninguna) se enciende
 * con `min` y el pie dice cuántas van. Va dentro de un `Presence` (así sale al contestarse).
 */
export function CardPicker({ title, kicker, cards, min, max, onPick, onCancel }: CardPickerProps) {
  const leaving = useLeaving()
  const [chosen, toggle] = usePicked(cards, max)
  const statusId = useId()
  const single = max === 1

  // Sin cancelar, Escape no cierra esto ni lo que haya abajo: hay que contestar.
  useEscapeKey(() => {}, !onCancel && !leaving)

  return (
    <Modal
      isOpen={!leaving}
      onClose={onCancel ?? (() => {})}
      dismissible={Boolean(onCancel)}
      size="sheet"
      kicker={kicker}
      title={title}
      subtitle={min === max ? t('auto.pick.cards', { count: max }) : t('auto.pick.range', { min, max })}
      footer={
        single && !onCancel ? undefined : (
          <>
            {single ? null : (
              <p id={statusId} role="status" className="m-0 mr-auto text-body tabular-nums text-muted">
                {t('auto.picker.status', { chosen: chosen.length, max })}
              </p>
            )}
            {onCancel ? (
              <Button variant="tertiary" size="sm" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
            ) : null}
            {single ? null : (
              <Button variant="primary" size="sm" disabled={chosen.length < min} aria-describedby={statusId} onClick={() => onPick(chosen)}>
                {chosen.length === 0 ? t('auto.pick.done') : t('auto.picker.choose', { count: chosen.length })}
              </Button>
            )}
          </>
        )
      }
    >
      <PickGrid label={t('auto.picker.cards')} cards={cards} chosen={chosen} onToggle={single ? (key) => onPick([key]) : toggle} multi={!single} className="grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]" />
    </Modal>
  )
}
