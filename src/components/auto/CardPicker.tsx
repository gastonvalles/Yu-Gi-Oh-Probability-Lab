import { useDeferredValue, useId, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import type { MatPile } from '../../app/practice-mat'
import { CardArt } from '../CardArt'
import { PILE_SHORT } from '../probability/MatDialogs'
import { FxFrame, PICK_ORDER } from '../probability/MatFx'
import { MatPrompt } from '../duel/MatPrompt'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { SearchField } from '../ui/SearchField'
import { Skeleton } from '../ui/Skeleton'

/** De qué lugar es una carta para elegir: la mano, una pila, el campo o debajo de un Xyz. */
export type PickFrom = MatPile | 'field' | 'material'

/** Una carta para elegir u ordenar. */
export interface PickCard {
  key: string
  name: string
  /** El arte; `undefined` mientras llega (un esqueleto quieto), `null` si no hay (las iniciales). */
  art?: string | null
  /** De dónde es («Cementerio», «Mano del rival»): una línea chica debajo del nombre; con `from`, el encabezado de su grupo en la hoja («Tu mano»). */
  place?: string
  /** El lugar, con `pickPlace`: un chip con ícono sobre la carta (la mano propia, violeta lleno; lo demás, neutro) y los grupos de la hoja, en vez de la línea chica. */
  from?: PickFrom
  theirs?: boolean
}

const FROM_ICON: Record<PickFrom, IconName> = { hand: 'hand', deck: 'layers', extra: 'cards', gy: 'trash', banished: 'ban', field: 'view-top', material: 'card' }

/** El lugar de una carta para elegir (`place`, `from`, `theirs`), con el vocabulario de la mesa: «Tu mano», «Tu Deck», «El Cementerio del rival». */
export function pickPlace(from: PickFrom, theirs: boolean): Pick<PickCard, 'place' | 'from' | 'theirs'> {
  return { place: t(`auto.picker.place.${theirs ? 'theirs' : 'mine'}.${from}`), from, ...(theirs ? { theirs } : {}) }
}

/** El chip del lugar sobre la carta: ícono y texto corto («Mano», «Cem. rival»); en una columna angosta (la banda a 390 px), sólo el ícono (el nombre accesible lo dice entero). */
function PlaceChip({ from, theirs }: { from: PickFrom; theirs: boolean }) {
  const zone = from === 'field' ? t('practice.mat.field') : from === 'material' ? t('auto.picker.chip.material') : PILE_SHORT[from]

  return (
    <Badge size="sm" shape="tag" {...(from === 'hand' && !theirs ? { tone: 'brand', solid: true } : {})} icon={FROM_ICON[from]} aria-hidden="true" data-pick-place="" className="min-w-0 max-w-full justify-self-start">
      <span className="hidden min-w-0 truncate @[4rem]:inline">{theirs ? t('auto.picker.chip.theirs', { zone }) : zone}</span>
    </Badge>
  )
}

/**
 * La grilla de la hoja (`grouped`) desde 640 px: cartas de 7.5 rem y la grilla mide lo de sus cartas en fila (`--n`; así la hoja, `Modal fit`, mide lo justo con pocas); si no entran, bajan de renglón y lo
 * que sobra de ancho se reparte entre las columnas (la primera y la última, al ras): ni columnas vacías ni una franja a la derecha. En el celular, tres por fila.
 */
const SHEET_COLUMNS = 'sm:grid-cols-[repeat(auto-fill,7.5rem)] sm:justify-between sm:w-[calc(var(--n)*8rem-0.5rem)] sm:max-w-full'
/** En el celular, un lugar con una o dos cartas ocupa sólo sus columnas de las tres (el de al lado se pone al lado): el ancho de un grupo y sus columnas. */
const PHONE_GROUP: Record<number, string> = { 1: 'max-sm:w-[calc((100%-1rem)/3)]', 2: 'max-sm:w-[calc((100%-1rem)*2/3+0.5rem)]', 3: 'max-sm:w-full' }
const PHONE_COLUMNS: Record<number, string> = { 1: 'max-sm:grid-cols-1', 2: 'max-sm:grid-cols-2', 3: 'max-sm:grid-cols-3' }

/** Lo mismo que se ve: las cartas por lugar (en el orden en que aparece cada uno; la mano propia, primero) y, dentro de cada uno, en el orden que llegan. */
function groupsOf(cards: readonly PickCard[]) {
  const groups = new Map<string, PickCard[]>()

  for (const card of cards) {
    const key = card.from ? `${card.theirs ? 'theirs' : 'mine'}:${card.from}` : ''

    groups.set(key, [...(groups.get(key) ?? []), card])
  }
  const hand = groups.get('mine:hand')

  return hand ? [hand, ...[...groups.values()].filter((group) => group !== hand)] : [...groups.values()]
}

interface PickGridProps {
  /** El nombre de la lista para el lector de pantalla. */
  label: string
  cards: readonly PickCard[]
  /** Las elegidas, en el orden en que se eligieron: llevan el marco celeste (`FxFrame`) y, eligiendo varias, su número. */
  chosen: readonly string[]
  /** Un toque, Espacio o Enter; `range` con Mayús (el tramo desde la última). */
  onToggle: (key: string, range: boolean) => void
  /** Se eligen varias (`aria-multiselectable`, y Mayús+clic para el tramo). */
  multi: boolean
  /** Las que un toque acepta ahora (el núcleo: lo que todavía completa la pregunta); las demás, sin elegir, van apagadas. Sin esto, todas. */
  eligible?: ReadonlySet<string>
  /** Las columnas de la grilla (sin `grouped`: la de la hoja es `SHEET_COLUMNS`). */
  className?: string
  /** El lugar de cada carta en una pestaña sobre ella («Campo», «Mano»), como en «¿Activás el efecto?», y no debajo del nombre. */
  tabs?: boolean
  /** La hoja: de lugares distintos (`from`), un grupo por lugar con su encabezado pegajoso («Tu mano · 1»), uno al lado del otro si entran; sus columnas, `SHEET_COLUMNS`. Sin esto (la banda), sólo el orden de los grupos. */
  grouped?: boolean
}

/**
 * La grilla de cartas para elegir, con el marco de la elegida y el número de orden de `PileViewer` eligiendo varias (no se extrajo de ahí: allá son botones con `aria-pressed` y acá un `listbox`). Se recorre con
 * las flechas (arriba y abajo, una fila), Inicio y Fin, con un solo lugar de tabulación; Espacio o Enter eligen. Mientras llega el arte de una carta, un esqueleto quieto (son decenas a la vez).
 * Las que dicen de dónde son (`from`) van por lugar, la mano propia primero, cada una con su chip: dos copias iguales de la mano y del Deck nunca se ven iguales.
 */
export function PickGrid({ label, cards: given, chosen, onToggle, multi, eligible, className, tabs = false, grouped = false }: PickGridProps) {
  const [active, setActive] = useState(0)
  const groupId = useId()
  // Las artes, en el render siguiente al de la entrada (de menor prioridad, de a pedazos): la hoja sale enseguida con los esqueletos, como si el arte no hubiera llegado.
  const arts = useDeferredValue(true, false)
  const groups = groupsOf(given)
  const cards = groups.flat()
  const at = Math.min(active, cards.length - 1)
  const blocked = (card: PickCard) => eligible !== undefined && !eligible.has(card.key) && !chosen.includes(card.key)
  const headed = grouped && groups.length > 1 && cards.every((card) => card.from)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const options = event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')
    const grid = options[at]?.parentElement ?? event.currentTarget
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Object.hasOwn(step, event.key) ? Math.min(cards.length - 1, Math.max(0, at + step[event.key]!)) : null

    if (next !== null) {
      event.preventDefault()
      setActive(next)
      options[next]?.focus()
    } else if ((event.key === ' ' || event.key === 'Enter') && cards[at]) {
      event.preventDefault()
      if (!blocked(cards[at])) onToggle(cards[at].key, event.shiftKey)
    }
  }

  const option = (card: PickCard) => {
    const index = cards.indexOf(card)
    const order = chosen.indexOf(card.key)
    // Eligiendo una sola, la elegida lleva sólo el marco (sin número de orden).
    const name = order >= 0 && multi ? t('practice.many.order', { name: card.name, n: order + 1 }) : card.name
    const off = blocked(card)
    // «Fire King Ponix, en tu mano»: el lugar, con minúscula, en la frase.
    const where = card.from && card.place ? t('auto.picker.at', { name, place: card.place.charAt(0).toLocaleLowerCase() + card.place.slice(1) }) : card.place ? `${name}, ${card.place}` : name

    return (
      <div
        key={card.key}
        role="option"
        tabIndex={index === at ? 0 : -1}
        // Al abrirse la hoja, el foco va a las cartas (no a la X).
        data-initial-focus={index === at ? '' : undefined}
        aria-selected={order >= 0}
        aria-disabled={off || undefined}
        aria-label={where}
        title={multi ? t('practice.many.range') : undefined}
        className={cx('group @container grid min-w-0 content-start gap-1 rounded-none outline-none focus-visible:shadow-focus', off ? 'cursor-default opacity-40' : 'cursor-pointer')}
        onClick={(event) => {
          setActive(index)
          if (!off) onToggle(card.key, event.shiftKey)
        }}
      >
        {card.from ? <PlaceChip from={card.from} theirs={card.theirs ?? false} /> : null}
        {tabs && card.place && !card.from ? (
          <Badge size="sm" shape="tag" aria-hidden="true" className="min-w-0 max-w-full justify-self-start">
            <span className="min-w-0 truncate">{card.place}</span>
          </Badge>
        ) : null}
        {/* La elegida lleva el marco celeste con la luz que gira de la carta elegida en la mano y en la mesa (`FxFrame`); al pasar el mouse, el aro fino de las cartas de la mesa. */}
        <span className={cx('relative block aspect-[421/614] w-full overflow-hidden bg-input shadow-[0_4px_10px_rgba(0,0,0,0.4)]', order < 0 && 'group-hover:outline-1 group-hover:outline-white/60')}>
          {card.art === undefined || !arts ? <Skeleton still radius="none" className="absolute inset-0" /> : <CardArt tilt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />}
          {order >= 0 ? <FxFrame tone="cyan" /> : null}
          {order >= 0 && multi ? <span aria-hidden="true" className={PICK_ORDER}>{order + 1}</span> : null}
        </span>
        <span aria-hidden="true" data-pick-name="" className="grid min-w-0">
          <span className="truncate text-micro text-foreground min-[1101px]:line-clamp-2 min-[1101px]:whitespace-normal">{card.name}</span>
          {card.place && !tabs && !card.from ? <span className="truncate text-micro text-soft">{card.place}</span> : null}
        </span>
      </div>
    )
  }

  return (
    <div
      role="listbox"
      aria-label={label}
      aria-multiselectable={multi || undefined}
      style={grouped && !headed ? ({ '--n': cards.length } as CSSProperties) : undefined}
      className={headed ? 'flex flex-wrap gap-x-2 gap-y-4 sm:gap-x-6' : cx('grid gap-2', grouped ? ['max-sm:grid-cols-3', SHEET_COLUMNS] : className)}
      onKeyDown={onKeyDown}
    >
      {headed
        ? groups.map((group, n) => (
            // Cada lugar mide lo de sus cartas y los chicos van uno al lado del otro: una sola carta de la mano no deja el resto del renglón vacío.
            <div key={n} role="group" aria-labelledby={`${groupId}-${n}`} className={cx('grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2', PHONE_GROUP[Math.min(3, group.length)])}>
              {/* Pegajoso, al ras de arriba de la hoja (`-top-5`: sobre su relleno, así no asoman cartas por encima): scrolleando, siempre se ve de qué lugar son las de abajo. */}
              <p id={`${groupId}-${n}`} className="sticky -top-5 z-10 m-0 flex items-center gap-1.5 bg-card-background py-1 text-body font-semibold text-foreground">
                <Icon name={FROM_ICON[group[0]!.from!]} size={16} className="shrink-0 text-muted" />
                {/* En un renglón (en el celular, con una carta, se corta; el chip de cada carta dice el lugar): así las cartas de los grupos de al lado quedan a la misma altura. */}
                <span className="min-w-0 truncate">{t('auto.band.from', { place: group[0]!.place ?? '', count: group.length })}</span>
              </p>
              <div style={{ '--n': group.length } as CSSProperties} className={cx('grid gap-2', PHONE_COLUMNS[Math.min(3, group.length)], SHEET_COLUMNS)}>
                {group.map(option)}
              </div>
            </div>
          ))
        : cards.map(option)}
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

/** Hasta cuántas cartas van en la banda; con más, la hoja (`CardPicker`). */
export const BAND_MAX = 6
/** Una sola fila: tantas columnas como cartas, entre 4 (con pocas, no quedan enormes) y 6 (a 390 px, cada una de ~48 px). */
const BAND_COLUMNS: Record<number, string> = { 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6' }

interface PickBandProps {
  /** Cuántas, para qué y cuántas van (`pickTitle`): «Elegí 2 cartas para desterrar · 1/2». */
  title: string
  /** De dónde salen todas, en la pestaña de arriba («Cementerio · 3»); si vienen de lugares distintos, cada carta lo dice debajo de su nombre. */
  place?: string
  cards: readonly PickCard[]
  /** Las elegidas, en el orden en que se eligieron (el marco celeste y su número). */
  chosen: readonly string[]
  eligible: ReadonlySet<string>
  /** Se eligen varias: el pie explica el toque y la principal contesta. Con una, el toque contesta. */
  multi: boolean
  /** La principal se enciende (y contesta) cuando la pregunta está completa. */
  done: boolean
  onToggle: (key: string) => void
  onPick: () => void
  /** Sólo si la pregunta se puede cancelar: «Cancelar», sin caja (y Escape, que lo da la mesa). */
  onCancel?: () => void
  /** El texto de la principal, si dice qué hace («Activar Garunix primero»); sin esto, «Listo» o «Elegir N cartas». */
  action?: string
  /** La nota del pie, a la izquierda («Sin “No responder”: son obligatorias»); sin esto, eligiendo varias, cómo se elige. */
  note?: string
}

/**
 * Elegir de una lista corta (hasta `BAND_MAX` cartas) sin tapar la mesa: una banda en una fila, en la ranura de la pregunta (`MatPrompt`, como `AskPrompt`: sin velo, ancha,
 * minimizable). Arriba de dónde salen y el título con para qué y la cuenta, las cartas (`PickGrid`: flechas, Espacio y Enter) y, abajo, «Cancelar» sin caja y la principal al final.
 * Con una sola para elegir, el toque contesta y la principal sólo aparece si se puede terminar sin elegir («Listo»). Al aparecer, el foco va a la primera carta.
 * Varias obligatorias (`use-auto-asks`): una sola, ya elegida la primera (`done`); el toque cambia cuál y la principal (`action`) la activa. Sin «Cancelar», Escape la minimiza.
 */
export function PickBand({ title, place, cards, chosen, eligible, multi, done, onToggle, onPick, onCancel, action, note }: PickBandProps) {
  const titleId = useId()
  const primary = multi || done

  return (
    <MatPrompt
      kind="ask"
      row
      role="group"
      labelledBy={titleId}
      label={title}
      focus='[role="option"][tabindex="0"]'
      escape={!onCancel}
      head={
        <div className="grid min-w-0 gap-3">
          {place ? (
            <Badge size="sm" shape="tag" className="justify-self-start">
              {place}
            </Badge>
          ) : null}
          <p id={titleId} className="m-0 font-semibold">
            {title}
          </p>
        </div>
      }
    >
      <PickGrid label={t('auto.picker.cards')} cards={cards} chosen={chosen} eligible={eligible} onToggle={onToggle} multi={multi} className={BAND_COLUMNS[Math.max(4, Math.min(BAND_MAX, cards.length))]} />
      {primary || onCancel ? (
        <div className="flex flex-wrap items-center gap-2">
          {note || multi ? <p className="m-0 mr-auto text-micro text-muted">{note ?? t('auto.band.hint')}</p> : null}
          <div className="ml-auto flex justify-end gap-2">
            {onCancel ? (
              <Button variant="tertiary" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
            ) : null}
            {primary ? (
              <Button variant="primary" disabled={!done} onClick={onPick}>
                {action ?? (chosen.length === 0 ? t('auto.pick.done') : t('auto.picker.choose', { count: chosen.length }))}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </MatPrompt>
  )
}

/** Desde cuántas cartas la hoja trae un buscador por nombre (las que se pueden declarar son un deck entero). */
const SEARCH_FROM = 13

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
  /**
   * Controlada por quien pregunta (el duelo automático lleva la cuenta en `ask-ui`): las elegidas, cada toque (`onToggle`), qué toque vale ahora (`eligible`: una suma o un Sacrificio no deja
   * elegir lo que el núcleo no acepta) y si la principal contesta (`done`). Sin esto, la hoja lleva la cuenta sola hasta `max`.
   */
  chosen?: readonly string[]
  onToggle?: (key: string) => void
  eligible?: ReadonlySet<string>
  done?: boolean
}

/**
 * Elegir de `min` a `max` cartas de una lista que no está en el campo ni en una sola pila (de varios lugares, o por código), en una hoja (`Modal fit`: mide lo de sus cartas; con buscador, `sheet`; al centro de la fila Extra: `anchor="mat"`; se minimiza sin
 * contestar, para ver el campo). Tocar elige o suelta
 * (el marco celeste y el número de orden), Mayús+clic elige el tramo; nunca más de `max`. Con `max` 1 un toque contesta (y «Listo» sólo si se puede terminar sin elegir: `done`); si no, la principal («Elegir 2 cartas»,
 * o «Listo» si se puede no elegir ninguna) se enciende con `min` (o con `done`) y el pie dice cuántas van. Con `SEARCH_FROM` cartas o más, un buscador por nombre arriba (filtra lo
 * que se ve; lo elegido queda). Va dentro de un `Presence` (así sale al contestarse).
 */
export function CardPicker({ title, kicker, cards, min, max, onPick, onCancel, chosen: picked, onToggle, eligible, done }: CardPickerProps) {
  const leaving = useLeaving()
  // El tramo de Mayús, en el orden que se ve (por lugar).
  const [own, toggleOwn] = usePicked(groupsOf(cards).flat(), max)
  const chosen = picked ?? own
  const toggle = onToggle ? (key: string) => onToggle(key) : toggleOwn
  const statusId = useId()
  const single = max === 1
  const ready = done ?? chosen.length >= min
  // Con `max` 1, el pie sólo si hay «Listo» (terminar sin elegir) o «Cancelar».
  const finish = single && done === true
  const [query, setQuery] = useState('')
  const searchable = cards.length >= SEARCH_FROM
  const needle = query.trim().toLocaleLowerCase()
  const shown = needle ? cards.filter((card) => card.name.toLocaleLowerCase().includes(needle)) : cards

  // Sin cancelar, Escape no cierra esto ni lo que haya abajo: hay que contestar.
  useEscapeKey(() => {}, !onCancel && !leaving)

  return (
    <Modal
      isOpen={!leaving}
      onClose={onCancel ?? (() => {})}
      dismissible={Boolean(onCancel)}
      // Mide lo que llevan sus cartas (sin franjas vacías al costado ni abajo); con buscador, la hoja fija de siempre: no cambia de tamaño (ni se corre) mientras se escribe.
      size={searchable ? 'sheet' : 'fit'}
      lowerable
      anchor="mat"
      veil={false}
      kicker={kicker}
      title={title}
      subtitle={min === max ? t('auto.pick.cards', { count: max }) : t('auto.pick.range', { min, max })}
      footer={
        single && !onCancel && !finish ? undefined : (
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
            {single && !finish ? null : (
              <Button variant="primary" size="sm" disabled={!ready} aria-describedby={single ? undefined : statusId} onClick={() => onPick([...chosen])}>
                {chosen.length === 0 ? t('auto.pick.done') : t('auto.picker.choose', { count: chosen.length })}
              </Button>
            )}
          </>
        )
      }
    >
      {searchable ? <SearchField label={t('auto.picker.search')} placeholder={t('auto.picker.search')} value={query} onChange={setQuery} className="mb-3" /> : null}
      {shown.length > 0 ? (
        <PickGrid grouped label={t('auto.picker.cards')} cards={shown} chosen={chosen} eligible={eligible} onToggle={single && !onToggle ? (key) => onPick([key]) : toggle} multi={!single} />
      ) : (
        <p className="m-0 text-body text-muted">{t('auto.picker.noMatches', { query: query.trim() })}</p>
      )}
    </Modal>
  )
}
