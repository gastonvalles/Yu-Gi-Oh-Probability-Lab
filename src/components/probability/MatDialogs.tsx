import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useEscapeKey } from '../../app/use-overlay'
import { normalizeSearchText } from '../../app/utils'
import type { MatPile } from '../../app/practice-mat'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { field, surface } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { FX_CARD, TargetMark, fxVars } from './MatFx'
import { CARD_BACK } from './practice-styles'

/** Nombres de las casillas, los mismos que usa el builder (Main / Extra) y los del juego en inglés para las pilas. El texto se arma al leerlo, en el idioma de ese momento. */
/** El rótulo corto de cada pila sobre su casilla (la mesa es chica): Deck · Extra · Cem. · Dest. */
export const PILE_SHORT: Record<MatPile, string> = {
  get deck() { return t('practice.pile.short.deck') },
  get extra() { return t('practice.pile.short.extra') },
  get hand() { return t('practice.pile.short.hand') },
  get gy() { return t('practice.pile.short.gy') },
  get banished() { return t('practice.pile.short.banished') },
}

export const PILE_TITLES: Record<MatPile, string> = {
  get deck() { return t('practice.pile.deck') },
  get extra() { return t('practice.pile.extra') },
  get hand() { return t('practice.pile.hand') },
  get gy() { return t('practice.pile.gy') },
  get banished() { return t('practice.pile.banished') },
}

interface MatCardInfo {
  name: string
  art: string | null
  /** Desterrada boca abajo: se muestra de dorso. */
  faceDown?: boolean
  /** Boca arriba en el Extra Deck (un Monstruo de Péndulo): se muestra primero y con su etiqueta. */
  faceUp?: boolean
}

export interface MenuItem {
  label: string
  onSelect: () => void
  /** Una jugada de apoyo (revelar, target, descartar, desterrar, devolver al deck o al Extra): la hoja de la mano las pone aparte de las jugadas del juego, todas a la vista. */
  utility?: boolean
  /** La opción que ya está elegida (la fase de ahora): se marca, sin repetirla en otro lado. */
  current?: boolean
  /** Se ve pero no se puede elegir todavía (los contadores sin una carta en el campo); `hint` dice qué falta. */
  disabled?: boolean
  /** Una línea chica arriba de la opción (el número del efecto y cuándo se activa). */
  lead?: string
  hint?: string
  /** Se llama con `true` al pasar el mouse por la opción (o al enfocarla con el teclado) y con `false` al irse: la mesa lo usa para resaltar, en el detalle de la carta, el texto que dice esa opción. */
  onPreview?: (active: boolean) => void
}

interface CardMenuProps {
  /** Dónde está la carta (o el deck) que se tocó: el menú sale pegado, arriba si hay lugar. */
  anchor: DOMRect | null
  kicker: string
  /** Sin título (vacío) el menú sólo lleva el sobretítulo: las fases no repiten el nombre de la de ahora. */
  title: string
  items: MenuItem[]
  /** "Ver carta": abre el detalle (va al final, aparte de las jugadas). Con el detalle fijo a la izquierda de la mesa no hace falta: la mesa no lo pasa. */
  onInspect?: () => void
  /** Más ancho (la lista de efectos de «Activar efecto»: cada opción es la frase entera de un efecto, sin recortar). */
  wide?: boolean
  /** El menú no tapa la mesa: el fondo deja pasar los toques (se elige tocando una carta del campo, p. ej. a quién atacar) y no se lleva el foco. Se cierra con Escape, la jugada o al tocar otra carta. */
  passThrough?: boolean
  onClose: () => void
}

/** Si el foco llegó por el teclado (`:focus-visible`): un foco que se llevó el menú al abrirse con el mouse no cuenta. Donde el navegador no sabe el selector, no. */
const keyboardFocus = (element: HTMLElement): boolean => {
  try {
    return element.matches(':focus-visible')
  } catch {
    return false
  }
}

const MENU_ITEM =
  'block w-full border-0 bg-transparent px-3 py-1.5 text-left text-body font-medium text-foreground outline-none transition-colors duration-100 hover:bg-tint/12 focus-visible:bg-tint/12'

/**
 * En el celular, el click que el navegador sintetiza al soltar el dedo llega DESPUÉS del `pointerup` que
 * abrió el menú y cae sobre el fondo recién montado: durante este lapso el fondo no cierra el menú.
 */
export const GHOST_CLICK_MS = 350

/**
 * Menú de jugadas pegado a la carta, como en DuelingBook: una línea por jugada, sin diálogo en el
 * medio. Se cierra al elegir, al tocar afuera o con Escape.
 */
export function CardMenu({ anchor, kicker, title, items, onInspect, wide = false, passThrough = false, onClose }: CardMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const openedAtRef = useRef(0)
  // La carta a la que se acomodó el menú la última vez: si cambia sólo lo que dice (el segundo paso, "¿En ataque o en defensa?") y no la carta, se queda donde estaba.
  const placedForRef = useRef<DOMRect | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const open = anchor !== null

  useEscapeKey(onClose, open)
  useFocusTrap(ref, open && !passThrough)

  useLayoutEffect(() => {
    const menu = ref.current

    if (!anchor || !menu) {
      placedForRef.current = null
      setPosition(null)
      return
    }

    openedAtRef.current = performance.now()

    const margin = 8
    // Medidas de layout, no del rect: la animación de entrada arranca en escala 0.7 y el rect daba un menú más chico del real (se salía de la pantalla).
    const { offsetWidth: width, offsetHeight: height } = menu
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, margin), Math.max(margin, window.innerWidth - width - margin))
    const above = anchor.top - height - 6
    const top = above >= margin ? above : Math.min(anchor.bottom + 6, Math.max(margin, window.innerHeight - height - margin))
    const sameCard = placedForRef.current === anchor

    placedForRef.current = anchor
    // El segundo paso aparece en el mismo lugar que el menú que se acaba de tocar (si es más corto o más largo "pegado a la carta" lo movía de lugar): misma esquina de arriba a la izquierda, sin salirse de la pantalla.
    setPosition((current) =>
      sameCard && current
        ? { left: Math.min(Math.max(current.left, margin), Math.max(margin, window.innerWidth - width - margin)), top: Math.min(Math.max(current.top, margin), Math.max(margin, window.innerHeight - height - margin)) }
        : { left, top },
    )
  }, [anchor, items.length, wide])

  if (!open || typeof document === 'undefined') {
    return null
  }

  const closeFromBackdrop = () => {
    if (performance.now() - openedAtRef.current >= GHOST_CLICK_MS) {
      onClose()
    }
  }

  return createPortal(
    <div className={cx('fixed inset-0 z-210', passThrough && 'pointer-events-none')} onClick={closeFromBackdrop}>
      <div
        ref={ref}
        role="menu"
        aria-label={title || kicker}
        tabIndex={-1}
        className={cx(surface.panel, 'absolute max-h-[min(calc(100dvh-1rem),34rem)] overflow-y-auto py-1 outline-none animate-pop motion-reduce:animate-none', wide ? 'w-[min(22rem,calc(100vw-1rem))]' : 'w-[13rem]', position ? 'visible' : 'invisible')}
        style={position ?? { left: 0, top: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid gap-0.5 px-3 pb-1.5 pt-1.5">
          <p className={cx('m-0', overline)}>{kicker}</p>
          {title ? (
            <p className="m-0 truncate text-body font-semibold text-foreground" title={title}>
              {title}
            </p>
          ) : null}
        </div>
        {items.map((item, index) => (
          <button
            // El lugar hace única la clave (dos materiales pueden llamarse igual); el texto, que el segundo paso sean botones nuevos.
            key={`${index}|${item.label}`}
            type="button"
            role="menuitem"
            aria-current={item.current ? 'true' : undefined}
            aria-disabled={item.disabled || undefined}
            className={cx(MENU_ITEM, item.lead && 'font-normal', item.current && 'font-bold text-info!', item.disabled && 'cursor-default text-muted hover:bg-transparent')}
            data-initial-focus={index === 0 ? '' : undefined}
            onClick={item.disabled ? undefined : item.onSelect}
            onMouseEnter={item.onPreview ? () => item.onPreview?.(true) : undefined}
            onMouseLeave={item.onPreview ? () => item.onPreview?.(false) : undefined}
            // Con el teclado también (no al abrir con el mouse: el foco que se lleva el primero sin que nadie lo apunte no resalta nada).
            onFocus={item.onPreview ? (event) => item.onPreview?.(keyboardFocus(event.currentTarget)) : undefined}
            onBlur={item.onPreview ? () => item.onPreview?.(false) : undefined}
          >
            {item.lead ? <span className="block text-micro font-semibold text-soft">{item.lead}</span> : null}
            {item.label}
            {item.hint ? <span className="block text-micro font-normal text-soft">{item.hint}</span> : null}
          </button>
        ))}
        {items.length === 0 ? <p className="m-0 px-3 py-1.5 text-micro text-muted">{t('practice.dialog.empty')}</p> : null}
        {onInspect ? (
          <button type="button" role="menuitem" className={cx(MENU_ITEM, 'mt-1 flex items-center gap-2 border-t border-border-subtle pt-2 text-muted')} data-initial-focus={items.length === 0 ? '' : undefined} onClick={onInspect}>
            <Icon name="search" size={14} />
            {t('practice.dialog.viewCard')}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

/** Elegir varias cartas de la pila para una misma jugada (enviarlas a un lugar, barajarlas, adjuntarlas, Target). */
export interface PileMany {
  /** El texto de la principal según lo elegido: en tu pila, «Elegir jugada»; en la del rival, la jugada misma («Target» o «Quitar target»). Sin nada elegido va apagada. */
  label: (ids: readonly string[]) => string
  /** La principal: las elegidas, en el orden en que se eligieron, y dónde está el botón (el menú del lote sale pegado a él). El visor no se cierra solo: lo cierra la jugada. */
  onPick: (ids: string[], rect: DOMRect) => void
  /** Arranca eligiendo, con éstas ya elegidas y en este orden (así el catálogo muestra cada estado). */
  start?: readonly string[]
}

interface PileViewerProps {
  pile: MatPile | null
  ids: string[]
  info: (id: string) => MatCardInfo
  /** Cartas marcadas como objetivo: llevan la mira (como en la mano y en el campo). */
  targeted: ReadonlySet<string>
  onPick: (id: string, rect: DOMRect) => void
  /** Cada toque de una carta, también eligiendo varias: la mesa la muestra en el detalle fijo de la izquierda. */
  onPeek?: (id: string) => void
  /** Con esto y dos cartas o más, el pie lleva «Elegir varias». */
  many?: PileMany
  onClose: () => void
  /** Las cartas del rival: sólo se sabe cómo se ven, no cómo se llaman, así que no hay nombre debajo ni buscador. */
  anonymous?: boolean
}

/**
 * Las cartas de una pila. El deck y el Extra se muestran en su orden real (tope primero; al cerrar el
 * deck se baraja, como en la mesa real) y con buscador; cementerio y destierro, la más reciente primero.
 * Con `many`, el pie ofrece elegir varias: tocar elige o suelta (aro ámbar y número de orden), Mayús+clic elige el tramo,
 * la principal le pasa las elegidas a quien abrió el visor y Escape sale del modo antes de cerrar el visor.
 */
export function PileViewer({ pile, ids, info, targeted, onPick, onPeek, many, onClose, anonymous = false }: PileViewerProps) {
  const [query, setQuery] = useState('')
  const [choosing, setChoosing] = useState(many?.start !== undefined)
  const [picked, setPicked] = useState<string[]>(() => [...(many?.start ?? [])])
  // Desde dónde elige Mayús+clic: la última carta tocada.
  const lastRef = useRef<string | null>(null)
  const gridRef = useRef<HTMLUListElement | null>(null)
  const footRef = useRef<HTMLDivElement | null>(null)
  const statusId = useId()
  const canMany = many !== undefined && pile !== null && ids.length >= 2
  const cards = ids.map((id) => ({ id, ...info(id) }))
  // El Extra se muestra en su orden, pero las cartas boca arriba (las que se ven y se invocan por Péndulo) van primero.
  const ordered = pile === 'extra' ? [...cards.filter((card) => card.faceUp), ...cards.filter((card) => !card.faceUp)] : pile === 'deck' ? cards : [...cards].reverse()
  const words = normalizeSearchText(query).split(' ').filter(Boolean)
  const visible = words.length === 0 ? ordered : ordered.filter((card) => words.every((word) => normalizeSearchText(card.name).includes(word)))
  const visibleIds = visible.map((card) => card.id)
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => picked.includes(id))
  const title = pile ? `${PILE_TITLES[pile]} · ${ids.length}` : ''

  // La pila cambió por debajo (Deshacer, una jugada): la elección se recorta a las que siguen ahí y, con menos de dos cartas, se sale del modo.
  const kept = picked.filter((id) => ids.includes(id))
  if (kept.length !== picked.length) setPicked(kept)
  if (choosing && !canMany) setChoosing(false)

  // Al entrar, el foco va a la primera carta; al salir, vuelve a «Elegir varias» (el botón que se tocó ya no está).
  const enter = () => {
    flushSync(() => setChoosing(true))
    gridRef.current?.querySelector<HTMLElement>('button')?.focus()
  }
  const exit = () => {
    flushSync(() => {
      setChoosing(false)
      setPicked([])
    })
    footRef.current?.querySelector<HTMLElement>('button')?.focus()
  }

  // Arriba del Escape del visor: el primero sale del modo y el segundo cierra.
  useEscapeKey(exit, choosing)

  const toggle = (id: string, range: boolean) => {
    const from = range && lastRef.current !== null ? visibleIds.indexOf(lastRef.current) : -1
    const to = visibleIds.indexOf(id)

    lastRef.current = id
    if (from >= 0 && from !== to) {
      // El tramo en el orden que se ve, como si se tocaran de a una desde la última.
      const span = visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1)
      const sweep = from < to ? span : span.reverse()

      setPicked((current) => [...current, ...sweep.filter((card) => !current.includes(card))])
    } else {
      setPicked((current) => (current.includes(id) ? current.filter((card) => card !== id) : [...current, id]))
    }
  }

  // «Elegir todas» es de las que se ven (con el filtro puesto, sólo ésas); con todas ya elegidas, las suelta.
  const pickVisible = () => setPicked((current) => (allVisible ? current.filter((id) => !visibleIds.includes(id)) : [...current, ...visibleIds.filter((id) => !current.includes(id))]))

  return (
    <Modal
      isOpen={pile !== null}
      onClose={onClose}
      size="md"
      kicker={t('practice.mat.name')}
      title={title}
      ariaLabel={title}
      footer={
        many && canMany ? (
          // Mide lo mismo en los dos modos: los botones son del mismo alto y lo de la izquierda entra en dos renglones (el número a la izquierda, la acción a la derecha).
          // Donde el pie es muy angosto (un celular de 320 px), queda sólo el número: la palabra y la indicación siguen para el lector de pantalla.
          <div ref={footRef} className="@container flex w-full items-center gap-3">
            <p id={statusId} role="status" className="m-0 line-clamp-2 min-w-0 flex-1 text-body leading-tight text-muted">
              {!choosing ? null : picked.length === 0 ? (
                <>
                  <span className="@max-2xs:sr-only">{t('practice.many.hint')}</span>
                  <span aria-hidden="true" className="hidden font-semibold text-foreground @max-2xs:inline">0</span>
                </>
              ) : (
                tRich('practice.many.picked', { n: (text) => <span className="font-semibold text-foreground">{text}</span>, w: (text) => <span className="@max-2xs:sr-only">{text}</span> }, { count: picked.length })
              )}
            </p>
            {choosing ? (
              <>
                <Button variant="tertiary" size="sm" onClick={exit}>
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" size="sm" disabled={picked.length === 0} aria-describedby={statusId} onClick={(event) => many.onPick(picked, event.currentTarget.getBoundingClientRect())}>
                  {many.label(picked)}
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" icon="check-circle" onClick={enter}>
                {t('practice.many.enter')}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        {ids.length > 8 && !anonymous ? (
          <div className="flex items-center gap-2">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">{t('practice.dialog.searchCard')}</span>
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
              <input
                type="search"
                value={query}
                placeholder={t('practice.dialog.searchCard')}
                autoComplete="off"
                data-initial-focus=""
                className={cx(field, 'h-10 w-full pl-9 pr-3 text-body pointer-coarse:h-11')}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {choosing ? (
              <Button variant="tertiary" size="sm" disabled={visibleIds.length === 0} onClick={pickVisible}>
                {/* Las dos palabras ocupan el lugar de la más larga: el buscador no cambia de ancho al pasar de una a la otra. */}
                <span className="grid">
                  <span className="col-start-1 row-start-1">{t(allVisible ? 'practice.many.none' : 'practice.many.all')}</span>
                  <span aria-hidden="true" className="invisible col-start-1 row-start-1">{t(allVisible ? 'practice.many.all' : 'practice.many.none')}</span>
                </span>
              </Button>
            ) : null}
          </div>
        ) : null}
        {ids.length === 0 ? <p className="m-0 text-body text-muted">{t('practice.dialog.noCards')}</p> : null}
        {visible.length === 0 && ids.length > 0 ? <p className="m-0 text-body text-muted">{t('practice.dialog.noMatch', { query: query.trim() })}</p> : null}
        {/* En el celular, cinco por fila (como el campo); en pantallas anchas, las que entren de 5.25 rem. */}
        <ul ref={gridRef} className="m-0 grid list-none grid-cols-5 gap-1.5 p-0 sm:grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] sm:gap-2" aria-label={t('practice.dialog.cards')}>
          {visible.map((card) => {
            // Boca abajo y objetivo a la vez: el nombre accesible dice las dos cosas (la mira se suma al "boca abajo", no lo pisa).
            const label = card.faceDown ? t('practice.dialog.cardFaceDown', { name: card.name }) : card.faceUp ? t('practice.dialog.cardFaceUp', { name: card.name }) : card.name
            const named = targeted.has(card.id) ? t('practice.card.targeted', { name: label }) : anonymous ? label : undefined
            const order = choosing ? picked.indexOf(card.id) : -1

            return (
              <li key={card.id}>
                <button
                  type="button"
                  aria-pressed={choosing ? order >= 0 : undefined}
                  aria-label={order >= 0 ? t('practice.many.order', { name: named ?? label, n: order + 1 }) : named}
                  title={choosing ? t('practice.many.range') : undefined}
                  className="group grid w-full gap-1 rounded-none bg-transparent p-0 text-left focus-visible:outline-none focus-visible:shadow-focus"
                  onClick={(event) => {
                    onPeek?.(card.id)
                    if (choosing) toggle(card.id, event.shiftKey)
                    else onPick(card.id, event.currentTarget.getBoundingClientRect())
                  }}
                >
                  <span
                    data-targeted={targeted.has(card.id) ? 'true' : 'false'}
                    // La elegida, un aro ámbar de 2 px por fuera (la mira del Target es un brillo por fuera y adentro: conviven); al pasar el mouse, el mismo aro, tenue.
                    className={cx('relative block aspect-[421/614] w-full overflow-hidden bg-input shadow-[0_4px_10px_rgba(0,0,0,0.4)] [--card-shadow:0_4px_10px_rgba(0,0,0,0.4)]', FX_CARD, choosing && (order >= 0 ? 'outline-2 outline-info' : 'group-hover:outline-2 group-hover:outline-info/45'))}
                    style={fxVars('red')}
                  >
                    {card.faceDown ? <span className={CARD_BACK} /> : <CardArt tilt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />}
                    {targeted.has(card.id) ? <TargetMark /> : null}
                    {card.faceUp ? <span className="absolute inset-x-0 bottom-0 z-2 bg-background/85 px-1 py-px text-center text-micro font-bold leading-tight text-white">{t('practice.dialog.faceUpTag')}</span> : null}
                    {order >= 0 ? <span aria-hidden="true" className="absolute right-0.5 top-0.5 z-4 grid h-5 min-w-5 place-items-center rounded-full bg-info px-1 text-micro font-bold leading-none tabular-nums text-info-foreground">{order + 1}</span> : null}
                  </span>
                  {anonymous ? null : <span className="truncate text-micro text-foreground">{label}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}

interface SaveComboDialogProps {
  isOpen: boolean
  defaultName: string
  /** Para un combo que ya está guardado: otro título y sin el aviso de qué se guarda. */
  rename?: boolean
  onSave: (name: string) => void
  onClose: () => void
}

export function SaveComboDialog({ isOpen, defaultName, rename = false, onSave, onClose }: SaveComboDialogProps) {
  const [name, setName] = useState(defaultName)
  const title = t(rename ? 'practice.panel.renameTitle' : 'practice.mat.saveCombo')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave(name)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" kicker={t('practice.mat.name')} title={title} ariaLabel={title}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="grid gap-1">
          <span className="text-body text-muted">{t('practice.dialog.name')}</span>
          <input
            type="text"
            value={name}
            maxLength={60}
            autoComplete="off"
            data-initial-focus=""
            className={cx(field, 'h-11 w-full px-3 text-body')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {rename ? null : <p className="m-0 text-micro text-soft">{t('practice.dialog.saveNote')}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="tertiary" size="sm" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="sm" type="submit" icon="save">
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Dorso para el fantasma del tope del deck. */
export function CardBack({ className }: { className?: string }) {
  return (
    <span className={cx('relative block aspect-[421/614] w-full', className)}>
      <span className={CARD_BACK} />
    </span>
  )
}
