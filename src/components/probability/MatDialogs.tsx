import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useEscapeKey } from '../../app/use-overlay'
import { usePresence } from '../../app/use-presence'
import { normalizeSearchText } from '../../app/utils'
import type { MatPile } from '../../app/practice-mat'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { CloseButton } from '../ui/IconButton'
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
  /**
   * Las respuestas de una pregunta de «cómo» (la posición, boca arriba o boca abajo, dónde del deck): la opción es un grupo y lleva una flecha (›). En el menú pegado a la carta salen en un submenú al
   * costado (al pasar el mouse, con un clic, Enter o →); en la hoja del celular el toque hace `onSelect`, que abre el segundo paso de siempre.
   */
  children?: MenuItem[]
  /** Arranca un bloque (apoyo, envíos, jugadas): en el menú pegado a la carta lleva una línea fina arriba. */
  divider?: boolean
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
  /** Arranca con el submenú de la opción que se llama así ya abierto (así el catálogo lo muestra). */
  startExpanded?: string
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

/**
 * Una opción del menú y del submenú: el texto al medio y el foco con el aro de siempre (las filas van a 4 px del borde del panel, así el aro entra sin cortarse). Abierta (su submenú a la vista),
 * el mismo fondo que al pasar el mouse.
 */
const MENU_ROW =
  'relative w-full rounded-tag border-0 bg-transparent py-1.5 text-body font-medium text-foreground outline-none transition-[background-color,box-shadow] duration-100 hover:bg-tint/12 focus-visible:bg-tint/12 focus-visible:shadow-focus aria-expanded:bg-tint/12'

/** Lo que se elige con las flechas: las apagadas se enfocan con Tab (se leen), pero las flechas las saltean. */
const CHOOSABLE = '[role="menuitem"]:not([aria-disabled="true"])'

/** La espera del mouse antes de abrir, cambiar o cerrar un submenú: pasar de largo por una fila no lo abre ni lo cierra. */
const HOVER_MS = 120

/**
 * ↑ ↓ Inicio y Fin mueven el foco entre las opciones de una lista, dando la vuelta (desde la primera, ↑ va a la última: la jugada principal, que está abajo, pegada a la carta). Dice si la tecla era de ésas.
 */
function moveFocus(list: HTMLElement, key: string): boolean {
  const rows = [...list.querySelectorAll<HTMLElement>(CHOOSABLE)]
  const at = rows.findIndex((row) => row === document.activeElement)
  const next = key === 'ArrowDown' ? at + 1 : key === 'ArrowUp' ? (at < 0 ? rows.length : at) - 1 : key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : null

  if (next === null || rows.length === 0) return false
  rows[(next + rows.length) % rows.length]!.focus()
  return true
}

/**
 * En el celular, el click que el navegador sintetiza al soltar el dedo llega DESPUÉS del `pointerup` que
 * abrió el menú y cae sobre el fondo recién montado: durante este lapso el fondo no cierra el menú.
 */
export const GHOST_CLICK_MS = 350

/**
 * Menú de jugadas pegado a la carta, como en DuelingBook: una línea por jugada, sin diálogo en el
 * medio. Nace de la carta (crece desde su lado, de 0,96 a 1) y, al cerrarse, vuelve a ella. Se cierra al elegir, al tocar afuera o con Escape.
 * Las opciones van al medio; una con `children` (›) abre al costado un submenú con sus respuestas, sin mover el menú: al pasar el mouse (con una espera, y sin cerrarse al ir en diagonal
 * hacia él), con un clic, Enter o →; se cierra al irse el mouse, con ← o con Escape (el primero cierra sólo el submenú y vuelve a su fila). ↑ ↓ Inicio y Fin recorren las opciones.
 */
export function CardMenu({ anchor, kicker, title, items, onInspect, wide = false, passThrough = false, startExpanded, onClose }: CardMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const subRef = useRef<HTMLDivElement | null>(null)
  const openedAtRef = useRef(0)
  // La carta a la que se acomodó el menú la última vez: si cambia sólo lo que dice (el segundo paso, "¿En ataque o en defensa?") y no la carta, se queda donde estaba.
  const placedForRef = useRef<DOMRect | null>(null)
  // La espera del mouse (`hover`): a qué fila va (`null`, cerrar) y su reloj. Dónde estaba el mouse y de qué lado salió el submenú: yendo hacia él, la espera vuelve a empezar.
  const intentRef = useRef<{ timer: number; index: number | null } | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const sideRef = useRef<1 | -1>(1)
  // `transformOrigin`: el punto del borde del menú que da a la carta (frente a su centro, abajo si el menú va arriba de ella): de ahí crece al abrirse y ahí vuelve al cerrarse.
  const [position, setPosition] = useState<{ left: number; top: number; transformOrigin: string } | null>(null)
  // El submenú abierto: de qué fila (su lugar y su texto: si la lista cambia por debajo, se cierra solo).
  const [expanded, setExpanded] = useState<{ index: number; label: string } | null>(null)
  const open = anchor !== null
  const expandedItem = expanded ? items[expanded.index] : undefined
  const sub = expandedItem && expandedItem.label === expanded?.label && expandedItem.children && !expandedItem.disabled ? expandedItem : null
  const subIndex = sub ? expanded!.index : null

  const cancelIntent = () => {
    window.clearTimeout(intentRef.current?.timer)
    intentRef.current = null
  }
  const rowOf = (index: number | null) => (index === null ? null : (ref.current?.querySelector<HTMLElement>(`[data-menu-row="${index}"]`) ?? null))

  /** El mouse llegó a una fila (o se fue): pasada la espera, abre su submenú, cambia al de otra o lo cierra (`null`). */
  const hover = (index: number | null) => {
    cancelIntent()
    const timer = window.setTimeout(() => {
      intentRef.current = null
      setExpanded((current) => (index === null ? null : current?.index === index ? current : { index, label: items[index]?.label ?? '' }))
    }, HOVER_MS)

    intentRef.current = { timer, index }
  }

  /** Abre el submenú de la fila ya (un clic, Enter, →) y, desde el teclado, pasa el foco a su primera respuesta. */
  const expand = (index: number, focus: boolean) => {
    cancelIntent()
    flushSync(() => setExpanded({ index, label: items[index]?.label ?? '' }))
    if (focus) subRef.current?.querySelector<HTMLElement>(CHOOSABLE)?.focus()
  }

  /** Cierra el submenú y, si se pide (← o Escape), vuelve el foco a su fila. */
  const collapse = (focusRow: boolean) => {
    const row = focusRow ? rowOf(subIndex) : null

    cancelIntent()
    setExpanded(null)
    row?.focus()
  }

  useEscapeKey(onClose, open)
  // Arriba del Escape del menú: con el submenú abierto, el primero cierra sólo el submenú.
  useEscapeKey(() => collapse(true), sub !== null)
  // La trampa del foco es de todo el menú, con el submenú adentro (va al lado del panel, no dentro: el panel scrollea y lo cortaría).
  useFocusTrap(rootRef, open && !passThrough)

  useEffect(() => () => window.clearTimeout(intentRef.current?.timer), [])

  useLayoutEffect(() => {
    const menu = ref.current

    if (!anchor || !menu) {
      placedForRef.current = null
      setPosition(null)
      window.clearTimeout(intentRef.current?.timer)
      intentRef.current = null
      setExpanded(null)
      return
    }

    openedAtRef.current = performance.now()

    const margin = 8
    // Medidas de layout, no del rect: la animación de entrada arranca en escala 0,96 y el rect daba un menú más chico del real (se salía de la pantalla).
    const { offsetWidth: width, offsetHeight: height } = menu
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, margin), Math.max(margin, window.innerWidth - width - margin))
    const above = anchor.top - height - 6
    const top = above >= margin ? above : Math.min(anchor.bottom + 6, Math.max(margin, window.innerHeight - height - margin))
    const transformOrigin = `${Math.round(Math.min(Math.max(anchor.left + anchor.width / 2 - left, 0), width))}px ${above >= margin ? '100%' : '0%'}`
    const sameCard = placedForRef.current === anchor

    placedForRef.current = anchor
    // El segundo paso aparece en el mismo lugar que el menú que se acaba de tocar (si es más corto o más largo "pegado a la carta" lo movía de lugar): misma esquina de arriba a la izquierda, sin salirse de la pantalla.
    setPosition((current) =>
      sameCard && current
        ? { left: Math.min(Math.max(current.left, margin), Math.max(margin, window.innerWidth - width - margin)), top: Math.min(Math.max(current.top, margin), Math.max(margin, window.innerHeight - height - margin)), transformOrigin: current.transformOrigin }
        : { left, top, transformOrigin },
    )

    // Otra carta: el submenú arranca cerrado (o el que pide el catálogo).
    if (!sameCard) {
      const start = startExpanded === undefined ? -1 : items.findIndex((item) => item.label === startExpanded && item.children)

      setExpanded(start >= 0 ? { index: start, label: startExpanded! } : null)
    }
    // `items` y `startExpanded` se leen al acomodarse para otra carta: cambiar lo que dice no lo vuelve a acomodar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, items.length, wide])

  // El submenú sale pegado al costado del menú (a la derecha; si no entra, a la izquierda), con su primera respuesta a la altura de la fila y entero dentro de la pantalla. Se acomoda con
  // las medidas de layout de la fila y del panel (no con su rect, que al abrirse está achicado por la animación) y sin otro dibujo: el estilo va directo al elemento.
  useLayoutEffect(() => {
    const panel = ref.current
    const submenu = subRef.current
    const row = rowOf(subIndex)

    if (!panel || !submenu || !row || !position) return

    const margin = 8
    // Se pisan 4 px (el aire del costado del panel): el mouse pasa de la fila al submenú sin salir de los dos.
    const overlap = 4
    const { offsetWidth: width, offsetHeight: height } = submenu
    const right = position.left + panel.offsetWidth - overlap
    const side = right + width <= window.innerWidth - margin ? 1 : -1
    const left = side === 1 ? right : Math.max(margin, position.left - width + overlap)
    const first = submenu.querySelector<HTMLElement>('[role="menuitem"]')
    const rowTop = position.top + panel.clientTop + row.offsetTop - panel.scrollTop
    const top = Math.min(Math.max(rowTop - submenu.clientTop - (first?.offsetTop ?? 0), margin), Math.max(margin, window.innerHeight - height - margin))

    sideRef.current = side
    submenu.style.left = `${Math.round(left)}px`
    submenu.style.top = `${Math.round(top)}px`
    // Crece desde el lado que da a la fila.
    submenu.style.transformOrigin = `${side === 1 ? '0' : '100%'} ${Math.round(rowTop - top + row.offsetHeight / 2)}px`
  }, [subIndex, position])

  const closeFromBackdrop = () => {
    if (performance.now() - openedAtRef.current >= GHOST_CLICK_MS) {
      onClose()
    }
  }

  // Yendo hacia el submenú en diagonal (por arriba de otras filas), la espera de cambiar o cerrar vuelve a empezar mientras el mouse siga acercándose: no se cierra en el camino.
  const keepTowardSub = (event: ReactMouseEvent) => {
    const last = pointerRef.current
    const pending = intentRef.current

    pointerRef.current = { x: event.clientX, y: event.clientY }
    if (!last || !pending || subIndex === null || pending.index === subIndex) return

    const toward = (event.clientX - last.x) * sideRef.current

    if (toward > 0 && toward >= Math.abs(event.clientY - last.y) / 2) hover(pending.index)
  }

  const onPanelKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (moveFocus(event.currentTarget, event.key)) {
      event.preventDefault()
      if (expanded) collapse(false)
      return
    }

    const index = Number(document.activeElement instanceof HTMLElement ? document.activeElement.dataset.menuRow : undefined)
    const item = items[index]

    if (event.key === 'ArrowRight' && item?.children && !item.disabled) {
      event.preventDefault()
      expand(index, true)
    }
  }

  /** Una fila: la de una jugada o la de una respuesta del submenú (`row`: su lugar en el menú; sin él, es del submenú). */
  const renderRow = (item: MenuItem, index: number, row?: number) => {
    // Su lugar, si abre un submenú (una opción apagada no abre nada).
    const group = item.children && !item.disabled ? row : undefined
    // Las frases largas (la lista de efectos de «Activar efecto», con su número arriba y sus rasgos abajo) van a la izquierda: centradas se leen mal.
    const left = wide || item.lead !== undefined

    return (
      <button
        // El lugar hace única la clave (dos materiales pueden llamarse igual); el texto, que el segundo paso sean botones nuevos.
        key={`${index}|${item.label}`}
        type="button"
        role="menuitem"
        aria-current={item.current ? 'true' : undefined}
        aria-disabled={item.disabled || undefined}
        aria-haspopup={group !== undefined ? 'menu' : undefined}
        aria-expanded={group !== undefined ? subIndex === group : undefined}
        data-menu-row={row}
        // Relleno parejo a los dos lados: el texto queda al medio, haya flecha o no (la de un grupo va en su relleno).
        className={cx(MENU_ROW, 'block', left ? 'px-2 text-left' : cx('text-center text-balance', group !== undefined ? 'px-4' : 'px-2'), item.lead && 'font-normal', item.current && 'font-bold text-info!', item.disabled && 'cursor-default text-muted hover:bg-transparent')}
        data-initial-focus={row === 0 ? '' : undefined}
        onClick={item.disabled ? undefined : group !== undefined ? (event) => expand(group, event.detail === 0) : item.onSelect}
        onMouseEnter={() => {
          if (row !== undefined) hover(group ?? null)
          item.onPreview?.(true)
        }}
        onMouseLeave={() => {
          if (row !== undefined) hover(null)
          item.onPreview?.(false)
        }}
        // Con el teclado también (no al abrir con el mouse: el foco que se lleva el primero sin que nadie lo apunte no resalta nada).
        onFocus={item.onPreview ? (event) => item.onPreview?.(keyboardFocus(event.currentTarget)) : undefined}
        onBlur={item.onPreview ? () => item.onPreview?.(false) : undefined}
      >
        {item.lead ? <span className="block text-micro font-semibold text-soft">{item.lead}</span> : null}
        {item.label}
        {item.hint ? <span className="block text-micro font-normal text-soft">{item.hint}</span> : null}
        {group !== undefined ? <Icon name="chevron-right" size={12} strokeWidth={2} className="absolute right-1 top-1/2 -translate-y-1/2 text-muted" /> : null}
      </button>
    )
  }

  // Al cerrarse sigue montado mientras vuelve a la carta (`usePresence`): sin atajar el toque siguiente.
  return usePresence(open, open && typeof document !== 'undefined' ? createPortal(
    <div ref={rootRef} className={cx('fixed inset-0 z-210', passThrough && 'pointer-events-none')} onClick={closeFromBackdrop}>
      <div
        ref={ref}
        role="menu"
        aria-label={title || kicker}
        tabIndex={-1}
        // Sin nada que elegir, el foco va al panel.
        data-initial-focus={items.length === 0 && !onInspect ? '' : undefined}
        className={cx(surface.panel, 'absolute max-h-[min(calc(100dvh-1rem),34rem)] overflow-y-auto px-1 py-1 outline-none animate-dialog-enter motion-reduce:animate-none', wide ? 'w-[min(22rem,calc(100vw-1rem))]' : 'w-[13rem]', position ? 'visible' : 'invisible')}
        style={position ?? { left: 0, top: 0 }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onPanelKey}
        onMouseMove={keepTowardSub}
        // Si el panel scrollea, el submenú quedaría lejos de su fila: se cierra.
        onScroll={() => (expanded ? collapse(false) : undefined)}
      >
        <div className="grid gap-0.5 px-2 pb-1.5 pt-1.5">
          <p className={cx('m-0', overline)}>{kicker}</p>
          {title ? (
            <p className="m-0 truncate text-body font-semibold text-foreground" title={title}>
              {title}
            </p>
          ) : null}
        </div>
        {items.map((item, index) => (
          <Fragment key={`${index}|${item.label}`}>
            {/* Entre bloques (apoyo, envíos, jugadas), una línea fina. */}
            {item.divider ? <div aria-hidden="true" className="my-1 border-t border-border-subtle" /> : null}
            {renderRow(item, index, index)}
          </Fragment>
        ))}
        {items.length === 0 ? <p className="m-0 px-2 py-1.5 text-micro text-muted">{t('practice.dialog.empty')}</p> : null}
        {onInspect ? (
          <>
            <div aria-hidden="true" className="my-1 border-t border-border-subtle" />
            <button
              type="button"
              role="menuitem"
              className={cx(MENU_ROW, 'flex items-center justify-center gap-2 px-2 text-muted')}
              data-initial-focus={items.length === 0 ? '' : undefined}
              onClick={onInspect}
              onMouseEnter={() => hover(null)}
            >
              <Icon name="search" size={14} />
              {t('practice.dialog.viewCard')}
            </button>
          </>
        ) : null}
      </div>
      {sub ? (
        <div
          // Uno nuevo por fila: cambiar de submenú vuelve a fundirse.
          key={subIndex}
          ref={subRef}
          role="menu"
          aria-label={sub.label}
          className={cx(surface.panel, 'absolute left-0 top-0 w-36 px-1 py-1 animate-dialog-enter motion-reduce:animate-none')}
          onClick={(event) => event.stopPropagation()}
          onMouseEnter={cancelIntent}
          onMouseLeave={() => hover(null)}
          onKeyDown={(event) => {
            if (moveFocus(event.currentTarget, event.key)) {
              event.preventDefault()
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault()
              collapse(true)
            }
          }}
        >
          {sub.children!.map((child, index) => renderRow(child, index))}
        </div>
      ) : null}
    </div>,
    document.body,
  ) : null, () => [rootRef.current])
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
  /** La pila que se mira; `null`, cerrado. */
  pile: MatPile | null
  /** Escondido sin cerrarse (la pausa o el final del duelo tapan la mesa): sale como al cerrarse y, al destaparse, vuelve como estaba (lo buscado, lo elegido). */
  hidden?: boolean
  ids: string[]
  info: (id: string) => MatCardInfo
  /** Cartas marcadas como objetivo: llevan la mira (como en la mano y en el campo). */
  targeted: ReadonlySet<string>
  onPick: (id: string, rect: DOMRect) => void
  /** Cada toque de una carta, también eligiendo varias: la mesa la muestra en el detalle fijo de la izquierda. */
  onPeek?: (id: string) => void
  /** Se pasó el mouse por una carta (el dedo no: tocar ya la fija): la mesa la muestra en el detalle mientras no haya otra fija, como en la mano y en el campo. */
  onHover?: (id: string) => void
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
 * Es uno solo para todas las pilas y queda montado: al cerrarse sale (la inversa de su entrada) y cada vez que se abre arranca de cero.
 *
 * **No tapa el campo ni el detalle** (Gastón, 2026-10-24: «los modales de deck, extra, gy y banish tapan el campo pero no deberían hacerlo» y «el detalle de la carta se ve opacado cuando estoy en un modal y no puedo
 * acceder a la info»): no es un modal ni lleva velo. En escritorio es un panel que llena el lugar que le da quien lo monta (una caja `grid` posicionada: la columna de la derecha o un rincón de la mesa, ver `PracticeMat`)
 * y el campo sigue vivo: se tocan sus cartas y sus casillas con el visor abierto, y la carta que se toca o se apunta en el visor se lee en el detalle (`onPeek`, `onHover`).
 * El foco entra al panel (al buscador o a la primera carta) y vuelve a lo que lo abrió, sin trampa (Tab sale a la mesa). En el celular es la hoja de abajo de siempre, hasta 55 dvh (el campo se ve arriba), y se cierra al tocar afuera.
 */
export function PileViewer({ pile, hidden = false, ids, info, targeted, onPick, onPeek, onHover, many, onClose, anonymous = false }: PileViewerProps) {
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const [query, setQuery] = useState('')
  const [choosing, setChoosing] = useState(many?.start !== undefined)
  const [picked, setPicked] = useState<string[]>(() => [...(many?.start ?? [])])
  // Desde dónde elige Mayús+clic: la última carta tocada.
  const [last, setLast] = useState<string | null>(null)
  const [shownPile, setShownPile] = useState(pile)
  const gridRef = useRef<HTMLUListElement | null>(null)
  const footRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  // Lo que tenía el foco al abrirse (la casilla de la pila): ahí vuelve al cerrarse.
  const openerRef = useRef<HTMLElement | null>(null)
  // El fondo de la hoja cierra sólo si el toque empezó ahí (como el del `Modal`): el click que sigue a un toque que la abrió no la cierra.
  const pressedBackdropRef = useRef(false)
  const statusId = useId()
  const titleId = useId()
  const open = pile !== null && !hidden
  const canMany = many !== undefined && pile !== null && ids.length >= 2
  const cards = ids.map((id) => ({ id, ...info(id) }))
  // El Extra se muestra en su orden, pero las cartas boca arriba (las que se ven y se invocan por Péndulo) van primero.
  const ordered = pile === 'extra' ? [...cards.filter((card) => card.faceUp), ...cards.filter((card) => !card.faceUp)] : pile === 'deck' ? cards : [...cards].reverse()
  const words = normalizeSearchText(query).split(' ').filter(Boolean)
  const visible = words.length === 0 ? ordered : ordered.filter((card) => words.every((word) => normalizeSearchText(card.name).includes(word)))
  const visibleIds = visible.map((card) => card.id)
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => picked.includes(id))
  const title = pile ? `${PILE_TITLES[pile]} · ${ids.length}` : ''

  // Abrirlo (o pasar a otra pila) arranca sin lo buscado y, con `many.start`, eligiendo ésas (lo buscado en el deck no se hereda al abrir el cementerio). Cerrarlo o esconderlo
  // no cambia nada: sale tal cual estaba y, si se vuelve a abrir mientras sale, es el mismo visor (no se monta otro).
  if (shownPile !== pile) {
    setShownPile(pile)
    if (pile !== null) {
      setQuery('')
      setChoosing(many?.start !== undefined)
      setPicked([...(many?.start ?? [])])
      setLast(null)
    }
  }

  // La pila cambió por debajo (Deshacer, una jugada): la elección se recorta a las que siguen ahí y, con menos de dos cartas, se sale del modo.
  if (picked.some((id) => !ids.includes(id))) setPicked((current) => current.filter((id) => ids.includes(id)))
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

  // El de cerrar va antes que el de salir del modo: así el de salir queda arriba y el primer Escape sale del modo y el segundo cierra. Escondido, ninguno.
  useEscapeKey(onClose, open)
  useEscapeKey(exit, choosing && !hidden)

  // Al abrirse, y al pasar a otra pila, el foco entra al panel: al buscador o, si no hay, a la primera carta. Sin trampa: no es un modal y Tab sale a la mesa.
  useEffect(() => {
    if (!open) return

    const active = document.activeElement

    if (active instanceof HTMLElement && active !== document.body && !panelRef.current?.contains(active)) openerRef.current = active

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current

      ;(panel?.querySelector<HTMLElement>('[data-initial-focus]') ?? gridRef.current?.querySelector<HTMLElement>('button') ?? panel)?.focus({ preventScroll: true })
    })

    return () => cancelAnimationFrame(frame)
  }, [open, pile])

  // Al cerrarse (o esconderse), el foco vuelve a lo que lo abrió, si quedó en el visor o se perdió (lo que sale ya no se enfoca): si pasó a otro lado (el visor del rival que se abrió en su lugar), se queda ahí.
  useEffect(() => {
    if (open) return

    const opener = openerRef.current
    const active = document.activeElement
    const lost = !(active instanceof HTMLElement) || active === document.body || Boolean(panelRef.current?.contains(active)) || active.closest('[inert]') !== null

    openerRef.current = null
    if (opener?.isConnected && lost) opener.focus({ preventScroll: true })
  }, [open])

  const toggle = (id: string, range: boolean) => {
    const from = range && last !== null ? visibleIds.indexOf(last) : -1
    const to = visibleIds.indexOf(id)

    setLast(id)
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

  const footer =
    many && canMany ? (
      // Mide lo mismo en los dos modos: los botones son del mismo alto y lo de la izquierda entra en dos renglones (el número a la izquierda, la acción a la derecha).
      // Donde el pie es muy angosto (un celular de 320 px, el panel de escritorio), queda sólo el número: la palabra y la indicación siguen para el lector de pantalla. En el rincón de la mesa
      // (12 rem) la principal baja a otro renglón, a la derecha.
      <div ref={footRef} className="@container flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2">
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
    ) : null

  const content = (
    <>
      {/* El encabezado del `Modal`, más angosto: dónde y cuántas, y la X. */}
      <header className="flex flex-none items-start justify-between gap-2 border-b border-border-subtle bg-surface-raised py-2.5 pl-3 pr-2">
        <div className="grid min-w-0 gap-0.5">
          <p className={cx('m-0', overline)}>{t('practice.mat.name')}</p>
          <Heading level="section" id={titleId}>
            {title}
          </Heading>
        </div>
        <CloseButton size="sm" aria-label={t('common.close')} onClick={onClose} />
      </header>
      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto overflow-x-hidden overscroll-contain p-3">
        {ids.length > 8 && !anonymous ? (
          // Donde el buscador quedaría con menos de 9 rem (el rincón de la mesa) «Elegir todas» baja debajo de él: así se lee «Buscar carta» entero.
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block min-w-36 flex-1">
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
        {/* En el celular, cinco por fila (como el campo); en la hoja de una tableta, las que entren de 5.25 rem; en el panel de escritorio, más angosto, las de 4.5 rem (tres en la columna de la derecha, dos en el rincón de la mesa). */}
        <ul ref={gridRef} className={cx('m-0 grid list-none p-0', desktop ? 'grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2' : 'grid-cols-5 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] sm:gap-2')} aria-label={t('practice.dialog.cards')}>
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
                  onPointerEnter={onHover ? (event) => (event.pointerType === 'touch' ? undefined : onHover(card.id)) : undefined}
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
      {footer ? <footer className="flex flex-none items-center border-t border-border-subtle p-3">{footer}</footer> : null}
    </>
  )

  // Al cerrarse sigue montado mientras sale (`usePresence`: la inversa de `sheet-in`); el foco ya volvió.
  return usePresence(
    open,
    !open || typeof document === 'undefined' ? null : desktop ? (
      // Escritorio: llena la caja que le da quien lo monta, sin velo; con otro visor que sale mientras éste entra, los dos van en la misma celda (no se reparten el alto).
      <section ref={panelRef} role="dialog" aria-labelledby={titleId} tabIndex={-1} className={cx(surface.panel, 'pointer-events-auto col-start-1 row-start-1 flex min-h-0 flex-col overflow-hidden outline-none animate-sheet-in motion-reduce:animate-none')}>
        {content}
      </section>
    ) : (
      // Celular: la hoja de abajo, por encima de la mesa y debajo del menú de una carta (`CardSheet`), con un fondo sin velo que la cierra al tocar afuera.
      createPortal(
        <>
          <div
            ref={backdropRef}
            aria-hidden="true"
            className="fixed inset-0 z-180"
            onPointerDown={(event) => {
              pressedBackdropRef.current = event.target === event.currentTarget
            }}
            onClick={(event) => {
              if (pressedBackdropRef.current && event.target === event.currentTarget) onClose()
            }}
          />
          <section ref={panelRef} role="dialog" aria-labelledby={titleId} tabIndex={-1} className="fixed inset-x-0 bottom-0 z-180 flex max-h-[55dvh] flex-col overflow-hidden rounded-t-panel border border-b-0 border-border bg-card-background pb-[env(safe-area-inset-bottom,0px)] shadow-overlay outline-none animate-sheet-in motion-reduce:animate-none">
            {content}
          </section>
        </>,
        document.body,
      )
    ),
    () => [backdropRef.current, panelRef.current],
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

/** Queda montado (así sale al cerrarse): cada vez que se abre, el campo arranca con `defaultName`. */
export function SaveComboDialog({ isOpen, defaultName, rename = false, onSave, onClose }: SaveComboDialogProps) {
  const [name, setName] = useState(defaultName)
  const [wasOpen, setWasOpen] = useState(isOpen)
  const title = t(rename ? 'practice.panel.renameTitle' : 'practice.mat.saveCombo')

  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (isOpen) setName(defaultName)
  }

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
