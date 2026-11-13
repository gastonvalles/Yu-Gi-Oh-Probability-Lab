import { useDeferredValue, useId, useState, type KeyboardEvent } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import type { AskWhyView } from '../../app/auto/ask-why'
import type { CardFrame } from '../../app/card-frame'
import type { MatPile } from '../../app/practice-mat'
import { CardArt } from '../CardArt'
import { COPIES, PILE_SHORT } from '../probability/MatDialogs'
import { PICK_ORDER } from '../probability/MatFx'
import { AskWhy } from '../duel/AskWhy'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { SearchField } from '../ui/SearchField'
import { Skeleton } from '../ui/Skeleton'
import { AutoPanel, ON_ART, ON_ART_TAG, PANEL_PRIMARY } from './AutoPanel'

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
  /** El color de su tipo, para la carta sin imagen (`frameKindOf`, lámina T). */
  frame?: CardFrame
}

/**
 * Qué copias son la misma (decisión 7): la misma carta en el mismo lugar, nunca en el campo ni debajo de un Xyz (ahí cada una es otra cosa). `null`: va sola. Sin lugar, la misma carta (las
 * de una pila que ya dice el título).
 */
export function copyKey(card: PickCard): string | null {
  if (card.from === 'field' || card.from === 'material') return null

  return [card.name, card.art ?? '', card.from ?? '', card.theirs ? 'theirs' : '', card.place ?? ''].join('|')
}

/** Las cartas en grupos de copias (`copyKey`), en el orden en que aparece la primera de cada uno. */
export function copyGroups(cards: readonly PickCard[]): PickCard[][] {
  const groups = new Map<string, PickCard[]>()

  for (const card of cards) {
    const key = copyKey(card) ?? `#${card.key}`

    groups.set(key, [...(groups.get(key) ?? []), card])
  }

  return [...groups.values()]
}

/**
 * Qué copia toca un toque sobre un grupo (sólo se agrupa eligiendo una: `PickGrid`): la elegida (la suelta) o la primera que se pueda elegir. `null`: nada. Eligiendo varias no hay grupos: con
 * uno, el segundo toque soltaba la copia elegida en vez de sumar otra (`select_unselect_card` contesta de a una).
 */
export function copyToToggle(copies: readonly PickCard[], chosen: readonly string[], open: (card: PickCard) => boolean): string | null {
  return (copies.find((card) => chosen.includes(card.key)) ?? copies.find(open))?.key ?? null
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
    <Badge size="sm" shape="tag" {...(from === 'hand' && !theirs ? { tone: 'brand', solid: true } : {})} icon={FROM_ICON[from]} aria-hidden="true" data-pick-place="" className={cx('min-w-0 max-w-full justify-self-start', ON_ART)}>
      <span className="hidden min-w-0 truncate @[4rem]:inline">{theirs ? t('auto.picker.chip.theirs', { zone }) : zone}</span>
    </Badge>
  )
}

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
  /** Las columnas de la grilla (la bandeja: `TRAY`). */
  className?: string
  /** El lugar de cada carta en una pestaña sobre ella («Campo», «Mano»), como en «¿Activás el efecto?», y no debajo del nombre. */
  tabs?: boolean
  /** Cada copia, una carta aparte aunque cada toque elija una sola (`select_unselect_card` de varias, que el núcleo pide de a una). Eligiendo varias (`multi`), siempre. */
  apart?: boolean
  /** Verla en grande sin elegirla: toque largo, clic derecho o la tecla de menú (Mayús+F10) sobre la carta (`contextmenu`). Un toque normal sigue eligiendo. */
  onInspect?: (key: string) => void
}

/**
 * La grilla de cartas para elegir, con el marco de la elegida y el número de orden de `PileViewer` eligiendo varias (no se extrajo de ahí: allá son botones con `aria-pressed` y acá un `listbox`). Se recorre con
 * las flechas (arriba y abajo, una fila), Inicio y Fin, con un solo lugar de tabulación; Espacio o Enter eligen. Mientras llega el arte de una carta, un esqueleto quieto (son decenas a la vez).
 * Las que dicen de dónde son (`from`) van por lugar, la mano propia primero, cada una con su chip: dos copias iguales de la mano y del Deck nunca se ven iguales. Eligiendo una sola, las copias de
 * la misma carta en el mismo lugar van en una, con «×3» (`copyGroups`, `copyToToggle`); eligiendo varias (`multi` o `apart`), cada copia es una carta, con su número de orden.
 */
export function PickGrid({ label, cards: given, chosen, onToggle, multi, eligible, className, tabs = false, apart = false, onInspect }: PickGridProps) {
  const [active, setActive] = useState(0)
  // Las artes, en el render siguiente al de la entrada (de menor prioridad, de a pedazos): la hoja sale enseguida con los esqueletos, como si el arte no hubiera llegado.
  const arts = useDeferredValue(true, false)
  const sorted = groupsOf(given).flat()
  const groups = multi || apart ? sorted.map((card) => [card]) : copyGroups(sorted)
  const at = Math.min(active, groups.length - 1)
  const open = (card: PickCard) => eligible === undefined || eligible.has(card.key)
  const target = (copies: readonly PickCard[]) => copyToToggle(copies, chosen, open)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const options = event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')
    const grid = options[at]?.parentElement ?? event.currentTarget
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : Object.hasOwn(step, event.key) ? Math.min(groups.length - 1, Math.max(0, at + step[event.key]!)) : null

    if (next !== null) {
      event.preventDefault()
      setActive(next)
      options[next]?.focus()
    } else if ((event.key === ' ' || event.key === 'Enter') && groups[at]) {
      event.preventDefault()
      const key = target(groups[at])

      if (key !== null) onToggle(key, event.shiftKey)
    }
  }

  const option = (copies: PickCard[], index: number) => {
    const card = copies[0]!
    const orders = copies.map((copy) => chosen.indexOf(copy.key)).filter((order) => order >= 0).sort((a, b) => a - b)
    const order = orders[0] ?? -1
    const count = copies.length
    const named = count > 1 ? t('auto.picker.copies', { name: card.name, count }) : card.name
    // Eligiendo una sola, la elegida lleva sólo el marco (sin número de orden).
    const name = order >= 0 && multi ? t('practice.many.order', { name: named, n: orders.map((n) => n + 1).join(', ') }) : named
    const off = target(copies) === null
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
        className={cx('group @container relative grid min-w-0 content-start gap-1 rounded-none outline-none focus-visible:shadow-focus', off ? 'cursor-default opacity-40' : 'cursor-pointer')}
        onClick={(event) => {
          setActive(index)
          const key = target(copies)

          if (key !== null) onToggle(key, event.shiftKey)
        }}
        onContextMenu={
          onInspect
            ? (event) => {
                event.preventDefault()
                onInspect(card.key)
              }
            : undefined
        }
      >
        {card.from ? <PlaceChip from={card.from} theirs={card.theirs ?? false} /> : null}
        {tabs && card.place && !card.from ? (
          <Badge size="sm" shape="tag" aria-hidden="true" className={cx('min-w-0 max-w-full justify-self-start', ON_ART_TAG)}>
            <span className="min-w-0 truncate">{card.place}</span>
          </Badge>
        ) : null}
        {/* Al pasar el mouse, el aro fino de las cartas de la mesa. */}
        <span data-pick-art="" className={cx('relative block aspect-[421/614] w-full overflow-hidden bg-input shadow-[0_4px_10px_rgba(0,0,0,0.4)]', order < 0 && 'group-hover:outline-1 group-hover:outline-white/60')}>
          {card.art === undefined || !arts ? <Skeleton still radius="none" className="absolute inset-0" /> : <CardArt tilt remoteUrl={card.art} name={card.name} {...(card.frame ? { frame: card.frame } : {})} className="block h-full w-full object-cover" />}
          {/* Las copias juntas: cuántas son, arriba a la izquierda. */}
          {count > 1 ? (
            <span aria-hidden="true" data-pick-copies="" className={COPIES}>
              ×{count}
            </span>
          ) : null}
          {/* Lo elegido, el aro y la tilde lima (eligiendo varias, su número de orden); lo que ahora no se puede elegir va apagado. */}
          {order >= 0 ? <span aria-hidden="true" data-pick-chosen="" className="pointer-events-none absolute inset-0 outline-2 -outline-offset-2 outline-info" /> : null}
          {order >= 0 && multi ? <span aria-hidden="true" className={PICK_ORDER}>{orders.map((n) => n + 1).join('·')}</span> : null}
          {order >= 0 && !multi ? (
            <span aria-hidden="true" className="absolute right-0.5 top-0.5 grid size-5 place-items-center bg-info text-background">
              <Icon name="check" size={14} strokeWidth={2.5} />
            </span>
          ) : null}
        </span>
        {/* En un renglón (el alto es de la carta) y entero al pasar el mouse. En la ventana de escritorio no va: lo dice la imagen (y el nombre accesible). */}
        <span aria-hidden="true" data-pick-name="" title={card.name} className="grid min-w-0 group-data-[window]/panel:hidden">
          <span className="truncate text-micro text-foreground">{card.name}</span>
          {card.place && !tabs && !card.from ? <span className="truncate text-micro text-muted">{card.place}</span> : null}
        </span>
      </div>
    )
  }

  return (
    <div
      role="listbox"
      aria-label={label}
      aria-multiselectable={multi || undefined}
      className={cx('grid gap-2', TRAY_N[Math.min(groups.length, TRAY_N.length) - 1], className)}
      onKeyDown={onKeyDown}
    >
      {groups.map(option)}
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

/** Hasta cuántas cartas van en una fila de la bandeja sin deslizar. */
export const BAND_MAX = 6
/**
 * La bandeja de los carteles del automático: una sola fila de cartas de 1/6 del ancho (a 390 px, ~56 px; con tope de 72 px en la tableta; nunca se agrandan con pocas), centradas, y con más de seis se desliza de costado. En la
 * ventana, crecen y se achican con ella (`AutoPanel`: `--fit-h`, `--card-cap`): el ancho se reparte entre las que hay (`--n`, hasta 5: lo pone `PickGrid`) y, por debajo de 4 rem, se desliza.
 * Mide lo que miden las cartas: sin alto fijo.
 */
export const TRAY =
  'grid-flow-col auto-cols-[min(calc((100%-2.5rem)/6),4.5rem)] justify-center-safe overflow-x-auto overscroll-x-contain pb-1 group-data-[window]/panel:auto-cols-[clamp(4rem,min(calc((100cqw_-_1.5rem_-_(var(--n,1)_-_1)*0.5rem)/var(--n,1)),var(--fit-h)),var(--card-cap))]!'
/** Entre cuántas se reparte el ancho de la bandeja en la ventana (`TRAY`): las que hay, hasta 5 (más, se desliza). */
const TRAY_N = ['[--n:1]', '[--n:2]', '[--n:3]', '[--n:4]', '[--n:5]'] as const
/** El contador «1 de 2» (a la derecha del título), sólo cuando el total es mayor que 1 (nunca «1/1» ni «0 de 1»). */
export function PickCount({ chosen, max }: { chosen: number; max: number }) {
  return max > 1 ? (
    <p role="status" data-pick-count="" className="m-0 shrink-0 border border-border px-1.5 text-micro font-semibold tabular-nums text-foreground">
      {t('auto.picker.status', { chosen, max })}
    </p>
  ) : null
}

interface PickBandProps {
  /** Cuántas, para qué y cuántas van (`pickTitle`): «Elegí 2 cartas para desterrar · 1 de 2». */
  title: string
  /** De dónde salen todas, en la pestaña de arriba («Cementerio · 3»); si vienen de lugares distintos, cada carta lo dice con su chip. */
  place?: string
  cards: readonly PickCard[]
  /** Las elegidas, en el orden en que se eligieron (el aro lima y su número). */
  chosen: readonly string[]
  eligible: ReadonlySet<string>
  /** Se eligen varias: la principal contesta. Con una, el toque contesta. */
  multi: boolean
  /** La principal se enciende (y contesta) cuando la pregunta está completa. */
  done: boolean
  onToggle: (key: string) => void
  onPick: () => void
  /** Sólo si la pregunta se puede cancelar: «Cancelar», sin caja (y Escape, que lo da la mesa). */
  onCancel?: () => void
  /** El texto de la principal, si dice qué hace («Activar Garunix primero»); sin esto, «Listo» o «Elegir N cartas». */
  action?: string
  /** Una nota chica debajo de la bandeja («Sin “Pasar”: son obligatorias»). */
  note?: string
  /** De qué carta es y si es su costo o su efecto (`AskWhy`), arriba del título. */
  why?: AskWhyView | null
  /** Sólo el catálogo lo fuerza (la ventana de escritorio en su marco); en la mesa, según el ancho. */
  variant?: 'floating'
  /** Verla en grande sin elegirla (`PickGrid`). */
  onInspect?: (key: string) => void
  /** Cada copia aparte aunque el toque elija una (`PickGrid`). */
  apart?: boolean
}

/**
 * Elegir de una lista corta (hasta `BAND_MAX` cartas) en el cartel del automático (`AutoPanel`): la frase con para qué, la bandeja (`PickGrid`: flechas, Espacio y Enter) y abajo «Cancelar» sin
 * caja y la principal a la derecha. Con una sola para elegir, el toque contesta y la principal sólo aparece si se puede terminar sin elegir («Listo»). Al aparecer, el foco va a la primera carta.
 * Varias obligatorias (`use-auto-asks`): una sola, ya elegida la primera (`done`); el toque cambia cuál y la principal (`action`) la activa. Sin «Cancelar», Escape lo minimiza.
 */
export function PickBand({ title, place, cards, chosen, eligible, multi, done, onToggle, onPick, onCancel, action, note, why, variant, onInspect, apart = false }: PickBandProps) {
  const titleId = useId()
  const whyId = useId()
  const primary = multi || done

  return (
    <AutoPanel
      kind="ask"
      variant={variant}
      role="group"
      label={title}
      titleId={titleId}
      labelledBy={why ? `${titleId} ${whyId}` : titleId}
      focus='[role="option"][tabindex="0"]'
      escape={!onCancel}
      top={
        <>
          {place ? (
            <Badge size="sm" shape="tag" className="justify-self-start">
              {place}
            </Badge>
          ) : null}
          {why ? <AskWhy id={whyId} why={why} /> : null}
        </>
      }
      actions={
        primary || onCancel ? (
          <>
            {onCancel ? (
              <Button variant="tertiary" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
            ) : null}
            {primary ? (
              <Button variant="primary" className={cx(PANEL_PRIMARY, 'ml-auto')} disabled={!done} onClick={onPick}>
                {action ?? (chosen.length === 0 ? t('auto.pick.done') : t('auto.picker.choose', { count: chosen.length }))}
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <div className="grid gap-1">
        <PickGrid label={t('auto.picker.cards')} cards={cards} chosen={chosen} eligible={eligible} onToggle={onToggle} multi={multi} apart={apart} className={TRAY} {...(onInspect ? { onInspect } : {})} />
        {note ? <p className="m-0 text-micro text-muted">{note}</p> : null}
      </div>
    </AutoPanel>
  )
}

/** Desde cuántas cartas la bandeja trae un buscador por nombre (las que se pueden declarar son un deck entero). */
const SEARCH_FROM = 12

interface CardPickerProps {
  /** Lo que pide el núcleo (el `HINT_SELECTMSG`), o «Elegí cartas». */
  title: string
  /** Arriba del título: la carta que pide elegir. */
  kicker?: string
  /** De qué carta es y si es su costo o su efecto (`AskWhy`): va en lugar de `kicker`. */
  why?: AskWhyView | null
  cards: readonly PickCard[]
  min: number
  max: number
  /** Las elegidas, en el orden en que se eligieron. Con `max` 1, el primer toque contesta. */
  onPick: (keys: string[]) => void
  /** Sólo si la pregunta se puede cancelar (`can_cancel`): «Cancelar» y Escape. Sin esto, hay que contestar. */
  onCancel?: () => void
  /**
   * Controlada por quien pregunta (el duelo automático lleva la cuenta en `ask-ui`): las elegidas, cada toque (`onToggle`), qué toque vale ahora (`eligible`: una suma o un Sacrificio no deja
   * elegir lo que el núcleo no acepta) y si la principal contesta (`done`). Sin esto, la bandeja lleva la cuenta sola hasta `max`.
   */
  chosen?: readonly string[]
  onToggle?: (key: string) => void
  eligible?: ReadonlySet<string>
  done?: boolean
  /** Verla en grande sin elegirla (`PickGrid`). */
  onInspect?: (key: string) => void
  /** Cada copia aparte aunque el toque elija una (`PickGrid`). */
  apart?: boolean
  /**
   * Declarar una carta: el buscador está siempre y, además de `cards` (las que se vieron y las del deck propio, a un toque), muestra las de todo el catálogo que encuentra `find` (nunca sin
   * escribir: no dicen nada del rival). `status`: el catálogo cargando o sin poder cargar (las de `cards` siguen valiendo).
   */
  more?: { find: (query: string) => PickCard[]; status: 'loading' | 'ready' | 'error' }
}

/**
 * Elegir de `min` a `max` cartas (M-03) en un solo cartel del automático (`AutoPanel`): la bandeja en una fila que se desliza (las cartas por lugar, la mano propia primero, cada una con su chip; eligiendo
 * una, las copias juntas con «×3») y, con `SEARCH_FROM` cartas o más, un buscador por nombre arriba (filtra lo que se ve; lo elegido queda). Tocar elige o suelta (el aro lima y el número de orden), Mayús+clic
 * elige el tramo; nunca más de `max`. Con `max` 1 un toque contesta (y «Listo» sólo si se puede terminar sin elegir: `done`); si no, una sola principal («Elegir 3 cartas», o «Listo») que se
 * enciende con `min` (o con `done`) y el contador («2 de 3») a la derecha del título. Va dentro de un `Presence` (así sale al contestarse).
 */
export function CardPicker({ title, kicker, why, cards, min, max, onPick, onCancel, chosen: picked, onToggle, eligible, done, onInspect, apart = false, more }: CardPickerProps) {
  const leaving = useLeaving()
  const whyId = useId()
  // El tramo de Mayús, en el orden que se ve (por lugar).
  const [own, toggleOwn] = usePicked(groupsOf(cards).flat(), max)
  const chosen = picked ?? own
  const toggle = onToggle ? (key: string) => onToggle(key) : toggleOwn
  const single = max === 1
  const ready = done ?? chosen.length >= min
  // Con `max` 1, la principal sólo si hay «Listo» (terminar sin elegir).
  const finish = single && done === true
  const [query, setQuery] = useState('')
  const searchable = more !== undefined || cards.length >= SEARCH_FROM
  const needle = query.trim().toLocaleLowerCase()
  const listed = needle ? cards.filter((card) => card.name.toLocaleLowerCase().includes(needle)) : cards
  const found = needle && more ? more.find(query) : []
  const shown = [...listed, ...found]
  const open = eligible && found.length > 0 ? new Set([...eligible, ...found.map((card) => card.key)]) : eligible
  // El catálogo, mientras se busca en él: cargando o sin cargar (una línea chica, sin tapar lo que ya se encontró).
  const moreNote = needle && more && more.status !== 'ready' ? t(more.status === 'loading' ? 'auto.picker.catalogLoading' : 'auto.picker.catalogError') : null

  // Sin cancelar, Escape no cierra esto ni lo que haya abajo: hay que contestar. Con cancelar, Escape cancela.
  useEscapeKey(onCancel ?? (() => {}), !leaving)

  return (
    <AutoPanel
      kind="pick"
      label={title}
      {...(why ? { describedBy: whyId } : {})}
      focus='[role="option"][tabindex="0"]'
      top={why ? <AskWhy id={whyId} why={why} /> : kicker ? <p className="m-0 text-micro font-semibold text-muted">{kicker}</p> : null}
      {...(single ? {} : { aside: <PickCount chosen={chosen.length} max={max} /> })}
      actions={
        single && !onCancel && !finish ? undefined : (
          <>
            {onCancel ? (
              <Button variant="tertiary" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
            ) : null}
            {single && !finish ? null : (
              <Button variant="primary" className={cx(PANEL_PRIMARY, 'ml-auto')} disabled={!ready} onClick={() => onPick([...chosen])}>
                {chosen.length === 0 ? t('auto.pick.done') : t('auto.picker.choose', { count: chosen.length })}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="grid gap-2">
        {searchable ? <SearchField label={t('auto.picker.search')} placeholder={t(more ? 'auto.picker.searchAny' : 'auto.picker.search')} value={query} onChange={setQuery} /> : null}
        {shown.length > 0 ? (
          <PickGrid label={t('auto.picker.cards')} cards={groupsOf(shown).flat()} chosen={chosen} eligible={open} onToggle={single && !onToggle ? (key) => onPick([key]) : toggle} multi={!single} apart={apart} className={TRAY} {...(onInspect ? { onInspect } : {})} />
        ) : moreNote === null ? (
          <p className="m-0 text-body text-muted">{needle ? t('auto.picker.noMatches', { query: query.trim() }) : t('auto.picker.typeName')}</p>
        ) : null}
        {moreNote ? (
          <p role="status" aria-busy={more?.status === 'loading' || undefined} className="m-0 text-micro text-muted">
            {moreNote}
          </p>
        ) : null}
      </div>
    </AutoPanel>
  )
}
