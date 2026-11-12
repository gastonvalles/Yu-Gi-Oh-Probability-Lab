import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cardTypeLabel, frameKindOf, frameTextClass } from '../../app/card-frame'
import { useMatMenus } from '../../app/mat-menus'
import { useDraggableOffset } from '../../app/use-draggable-offset'
import { useFocusTrap } from '../../app/use-focus-trap'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving, usePresence } from '../../app/use-presence'
import { useSwipeFold } from '../../app/use-swipe-fold'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { GHOST_CLICK_MS, LayerBackContext, type MenuItem } from '../probability/MatDialogs'
import { levelText } from '../probability/MatFx'
import { CARD_BACK } from '../probability/practice-styles'
import { useSheetHost } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { CloseButton, IconButton } from '../ui/IconButton'

/** `docked`: apoyado abajo, sobre tu mano (el celular). `floating`: la ventana que se arrastra y se estira (el escritorio, desde 1101 px; en el celular con «Menús flotantes»). Sin decirlo, según el ancho y esa preferencia. */
type AutoPanelVariant = 'docked' | 'floating'

/**
 * Dónde recuerda cada ventana su lugar y su tamaño: las preguntas comparten una (la próxima sale donde quedó la anterior); la ficha de una carta, la suya; las del catálogo (`playground`), otra,
 * así probarlas no corre las de la mesa.
 */
const OWN_PLACE = new Set(['card', 'playground', 'options'])
export const autoWindowKey = (kind: string) => `ygo-lab:auto-window:v1:${OWN_PLACE.has(kind) ? kind : 'ask'}`
/** El lugar de la ventana en el celular: aparte del de escritorio (otra pantalla, otras medidas). */
const onPhone = (key: string) => `${key}:phone`
/**
 * Lo más chica que se deja estirar una ventana; lo más grande, la pantalla. El mínimo alcanza para la barra (44), la cabeza de la ficha (64: la miniatura), la fila de botones entera en **un** renglón
 * (44; dos botones de `min-w-32` y su aire piden 18 rem) y los márgenes (12; con el dedo 28 abajo: por eso el celular pide 200 y el escritorio, 186: lo que mide al abrir, así achicar nunca la corre: lo que no entra es el contenido, que se desplaza, y los botones nunca quedan fuera del marco.
 */
const WINDOW_MIN = { width: 420, height: 186 }
/** En el celular (390 px de pantalla; la ventana sale de 19 rem) dos botones largos («Colocar» e «Invocación Normal») no entran en un renglón: el alto mínimo alcanza para dos filas, así ninguna queda fuera del marco. */
const WINDOW_MIN_PHONE = { width: 296, height: 256 }
const ARROW_KEYS: Record<string, readonly [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
const WINDOW_KEYS = 'ArrowUp ArrowDown ArrowLeft ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Enter'

/**
 * Los botones de la fila de abajo (B-01 a B-04): la principal y las que hacen algo llevan esto (en el celular se reparten el ancho; en la ventana, a su ancho y a la derecha). Lo que descarta
 * (`tertiary`) va sin esto, a su ancho y a la izquierda. Todos `size="md"` (44 px) y en un renglón (lo pone la fila).
 */
export const PANEL_MAIN = 'flex-1 group-data-[auto-panel=floating]/panel:min-w-32 group-data-[auto-panel=floating]/panel:flex-none'
/** La fila de abajo: un renglón, la principal al final (a la derecha); en la ventana, todo a la derecha y pegada al borde de abajo (`mt-auto`: estirada, el aire queda entre el contenido y ella). */
const ACTIONS = 'flex min-w-0 shrink-0 items-center gap-2 *:whitespace-nowrap group-data-[auto-panel=floating]/panel:mt-auto group-data-[auto-panel=floating]/panel:justify-end'

interface AutoPanelProps {
  /** `data-prompt`: qué cartel es (la mesa y las pruebas lo buscan por esto). */
  kind: string
  /** La pregunta, en texto: el título, la tira minimizada y su nombre accesible. */
  label: string
  /** La tira minimizada, en un renglón, en lugar de `label` cuando éste es largo: la forma corta de la pregunta (si no entra, se corta lo que ella lleva, nunca la pregunta: `StripText`). `label` sigue siendo su nombre accesible. */
  strip?: ReactNode
  /** En lugar del título (la ficha de una carta): quien lo pasa nombra el cartel con `labelledBy`. */
  head?: ReactNode
  /** Arriba de la pregunta, chico: de qué carta es (`AskWhy`) o qué pasó. */
  top?: ReactNode
  /** A la derecha del título (el contador «2 de 3», el modo de respuesta en escritorio): no suma un renglón. */
  aside?: ReactNode
  /** La bandeja de cartas o las opciones: lo único que se desplaza si no entra. */
  children?: ReactNode
  /** En la ventana de escritorio, la bandeja va a la izquierda del texto y de los botones (M-08: una carta para responder). */
  side?: boolean
  /** Los botones de abajo (lo que descarta a la izquierda, sin caja; la principal a la derecha, con `PANEL_MAIN`): también en la tira minimizada. */
  actions?: ReactNode
  /** Al abrirse, el foco va a esto (un selector adentro). */
  focus?: string
  /** Escape lo minimiza (sólo si Escape no hace otra cosa: en una cadena es «No responder»). */
  escape?: boolean
  /** dialog (por defecto); group, la banda que no se lleva el foco de la mesa; region, la ficha de una carta (como la hoja de la mesa manual). */
  role?: 'dialog' | 'group' | 'region'
  labelledBy?: string
  describedBy?: string
  /** Se cierra (la ficha de una carta): la X, Escape y tocar afuera; el foco queda adentro y vuelve a lo que lo tenía. Sin esto, hay que contestar: sólo se minimiza. */
  onDismiss?: () => void
  /** Lo que este cartel tapa en el celular (el visor de una pila bajo la ficha): arriba, «‹ GY · 2», que lo cierra y lo deja a la vista. Una pregunta lo lee de `LayerBackContext`, sin botón. */
  crumb?: { label: string; onBack: () => void }
  variant?: AutoPanelVariant
  /** Opciones: lleva más filas que una pregunta, así que puede subir hasta la mitad de la pantalla (tapa parte del campo, que no se corre) en vez de quedarse sobre tu mano. */
  tall?: boolean
  className?: string
}

/**
 * El cascarón de los carteles del duelo automático (la pregunta, la bandeja, las opciones y la ficha de una carta): **texto arriba, bandeja si hay, botones abajo**, apoyado sobre tu mano desde
 * abajo y con techo en el borde de abajo de la línea (`data-duel-line`): nunca empuja ni tapa el campo (va en un portal `fixed`; la mesa no se entera). Mide lo de su contenido (sin alto fijo):
 * 8 px entre grupos y la pregunta en `text-body`; fondo opaco, sin desenfoque, y esquinas rectas (`mat-square`). Sin cabecera de fase ni de turno ni flecha de bajar (cada dato, una vez): se
 * baja arrastrando el asa de arriba (o tocándola: es un botón, «Minimizar»; o Escape con `escape`) y queda una tira con la pregunta y sus botones que **se sube tocándola entera**; nunca se
 * cierra solo.
 * En escritorio (`floating`) es una ventana apaisada (30 rem, centrada en la columna de la mesa: `--mat-x`, `--mat-w`, apoyada sobre tu mano) con una barra violeta que es el asa
 * (`useDraggableOffset`: se lleva con el mouse; enfocada, flechas, Alt + flechas la estiran, Enter o doble clic la vuelven a su lugar y su tamaño) y se estira del borde derecho, del de abajo y de
 * la esquina; con `side`, la bandeja a la izquierda del texto. Lugar y tamaño se recuerdan por tipo (`autoWindowKey`). Con la hoja de la cadena abierta en el celular (`SheetHost`), va en su pie:
 * una sola hoja. Va dentro de un `Presence` (así sale al contestarse).
 */
export function AutoPanel({ kind, label, strip, head, top, aside, children, side = false, actions, focus, escape = false, role = 'dialog', labelledBy, describedBy, onDismiss, crumb, variant, tall = false, className }: AutoPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const leaving = useLeaving()
  const host = useSheetHost()
  const slot = host?.slot ?? null
  // En un marco del catálogo (`SheetHost phone`), en su lugar: ni portal ni `fixed`.
  const inline = host?.phone === true && !slot
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY) && host?.phone !== true
  // En el pie de la hoja de la cadena (celular) nunca es ventana.
  // «Menús flotantes» (Opciones): la ventana también en el celular, con el dedo. En un marco del catálogo no vale.
  const menus = useMatMenus()
  const floating = !slot && (variant === 'floating' || (variant === undefined && (desktop || (menus === 'floating' && !inline))))
  const phoneWindow = floating && !desktop && !inline
  const saved = useContext(LayerBackContext)
  const [minimized, setMinimized] = useState(false)
  // La ventana se lleva de la barra y se estira del borde y la esquina; posición y tamaño, por tipo (`autoWindowKey`). En la mesa se centra con su `translate`: el corrimiento va en `--drag-x/y`.
  const move = useDraggableOffset(phoneWindow ? onPhone(autoWindowKey(kind)) : autoWindowKey(inline ? 'playground' : kind), ref, floating, !inline, phoneWindow ? WINDOW_MIN_PHONE : WINDOW_MIN, true)
  // Con el dedo, la franja de arriba sigue al dedo hacia abajo (corriendo su `translate`, sin redibujar) y, soltada lejos, lo minimiza; minimizado, la tira hacia arriba lo abre.
  const follow = (dy: number | null) => {
    if (ref.current) ref.current.style.translate = dy === null ? '' : `${desktop && !slot ? '-50%' : '0'} ${dy}px`
  }
  const dismissible = Boolean(onDismiss) && !leaving
  const openedAt = useRef(0)

  useEscapeKey(() => (onDismiss ? onDismiss() : setMinimized(true)), (dismissible || escape) && !minimized && !leaving)
  useFocusTrap(ref, dismissible && !minimized && !inline)

  // Al abrir (y al reabrirlo), el foco va a lo que se decide; minimizado, a la tira que lo sube. Sin desplazar la página.
  useEffect(() => {
    const target = minimized ? '[data-panel-show]' : (focus ?? '[data-panel-grip], [data-window-bar]')

    ref.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: true })
  }, [minimized, focus, slot])

  // Lo que lo cierra tocando afuera: el toque fantasma del celular (el clic que sigue al dedo que abrió la ficha) no cuenta.
  useEffect(() => {
    openedAt.current = performance.now()
  }, [])

  // El techo: el borde de abajo de la línea (en el celular); sin línea (escritorio), la mitad de la pantalla. Se mide al abrir y al cambiar el tamaño de la ventana.
  useLayoutEffect(() => {
    const root = ref.current

    if (!root || slot || inline) return
    const place = () => {
      const line = document.querySelector('[data-duel-line]')
      const ceiling = line && !tall ? `${Math.max(0, Math.round(line.getBoundingClientRect().bottom))}px` : '50dvh'

      if (root.style.getPropertyValue('--panel-ceiling') !== ceiling) root.style.setProperty('--panel-ceiling', ceiling)
    }

    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [slot, inline, minimized, tall])

  const attrs = {
    role,
    // Minimizado, su nombre es la pregunta corta de la tira (lo que lo nombraba abierto ya no está).
    ...(minimized ? { 'aria-label': label } : { 'aria-labelledby': labelledBy ?? titleId, ...(describedBy ? { 'aria-describedby': describedBy } : {}) }),
    'data-prompt': kind,
    'data-auto-panel': floating ? 'floating' : 'docked',
    // `data-lowered`: el mismo estado con el nombre de las hojas del celular (lo leen la mesa y sus pruebas).
    ...(minimized ? { 'data-minimized': '', 'data-lowered': '' } : {}),
  }
  const place = slot
    ? 'border-t border-border-subtle'
    : inline
      ? 'relative mx-auto w-full max-w-155 border border-primary/60'
      : cx(
        'fixed inset-x-0 bottom-0 z-[130] max-h-[calc(100dvh-var(--panel-ceiling,50dvh))] border-t border-primary/60 shadow-overlay',
        'pb-[env(safe-area-inset-bottom,0px)]',
        // Una sola hoja abajo en el celular: lo que abrís con una pregunta abierta (la ficha, el visor de una pila) va encima y la esconde sin cerrarla; al cerrarlo, vuelve. Lo que ya estaba
        // abierto cuando llegó la pregunta, al revés, queda guardado debajo de ella (`PracticeMat`).
        !onDismiss && 'in-[body:has(>[data-auto-panel=docked][data-prompt=card],[data-pile-sheet]:not([hidden]))]:hidden',
      )
  const surface = 'group/panel mat-square pointer-events-auto bg-card-background text-body text-foreground motion-safe:animate-sheet-in'

  // La ventana del escritorio: apoyada sobre tu mano y centrada en la columna de la mesa como el cartel de siempre (no empuja ni tapa el campo al abrirse); corrida, flota encima de lo que haya.
  const windowPlace = inline
    ? 'relative w-[min(30rem,100%)] border border-primary'
    : cx('fixed bottom-0 left-[var(--mat-x,50%)] z-[130] max-h-[calc(100dvh-var(--panel-ceiling,50dvh))] translate-x-[calc(var(--drag-x,0px)-50%)] translate-y-[var(--drag-y,0px)] border border-primary shadow-overlay', phoneWindow ? 'w-[min(19rem,calc(100vw-1rem))]' : 'w-[min(30rem,var(--mat-w,100vw))]')
  const windowSurface = 'group/panel mat-square pointer-events-auto bg-card-background text-body text-foreground motion-safe:animate-dialog-enter'
  /** Con la barra enfocada: las flechas la mueven 16 px (Mayús: 64), Alt + flechas la estiran y Enter la vuelve a su lugar y su tamaño. */
  const onBarKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey) return
    if (event.key === 'Enter') {
      event.preventDefault()
      move.reset()
      return
    }
    const arrow = ARROW_KEYS[event.key]

    if (!arrow) return
    event.preventDefault()
    const step = event.shiftKey ? 64 : 16

    if (event.altKey) move.resizeBy(arrow[0] * step, arrow[1] * step)
    else move.moveBy(arrow[0] * step, arrow[1] * step)
  }
  // La barra de título (violeta): el asa, sin fase ni turno. Minimizada, la pregunta, que la sube.
  const bar = (
    <div
      {...move.head}
      role="toolbar"
      tabIndex={0}
      aria-label={t('auto.window.move')}
      aria-description={t('auto.window.help')}
      aria-keyshortcuts={WINDOW_KEYS}
      title={t('auto.window.help')}
      data-window-bar=""
      className="flex min-h-11 min-w-0 shrink-0 cursor-grab touch-none select-none items-center bg-primary text-white focus-visible:outline-none focus-visible:shadow-focus active:cursor-grabbing"
      onKeyDown={onBarKey}
    >
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center [&_svg]:size-5">
        <Icon name="grip" />
      </span>
      {minimized ? (
        <button type="button" data-panel-show="" aria-label={t('duel.prompt.show')} title={t('duel.prompt.show')} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left font-semibold focus-visible:outline-none focus-visible:shadow-focus" onClick={() => setMinimized(false)}>
          {strip ?? <span className="min-w-0 truncate">{label}</span>}
        </button>
      ) : (
        <span className="flex-1" />
      )}
      {onDismiss && !minimized ? <CloseButton size="lg" tone="raised" aria-label={t('common.close')} onClick={onDismiss} /> : null}
      {/* Minimizar con el mouse o el dedo (antes, sólo Escape): un botón de 44 px a la derecha de la barra; la tira que queda se sube tocándola. */}
      {!onDismiss && !minimized ? (
        <IconButton tone="raised" size="lg" data-window-minimize="" aria-label={t('duel.prompt.minimize')} title={t('duel.prompt.minimize')} onClick={() => setMinimized(true)}>
          <Icon name="chevron-down" />
        </IconButton>
      ) : null}
    </div>
  )
  // Los agarres para estirar: el borde derecho, el de abajo y la esquina (con su marca). Sólo el mouse o el lápiz; el teclado, Alt + flechas en la barra.
  const grips = (
    <>
      <span aria-hidden="true" title={t('auto.window.resize')} className="absolute inset-y-0 -right-1 w-2 cursor-ew-resize touch-none" {...move.stretch(true, false)} />
      <span aria-hidden="true" title={t('auto.window.resize')} className="absolute inset-x-0 -bottom-1 h-2 cursor-ns-resize touch-none" {...move.stretch(false, true)} />
      <span
        aria-hidden="true"
        title={t('auto.window.resize')}
        data-window-corner=""
        className="absolute -right-1 -bottom-1 size-4 cursor-nwse-resize touch-none after:absolute after:right-1.5 after:bottom-1.5 after:size-2 after:border-r-2 after:border-b-2 after:border-primary pointer-coarse:size-9 pointer-coarse:after:right-2.5 pointer-coarse:after:bottom-2.5"
        {...move.stretch(true, true)}
      />
    </>
  )

  // «Volver» (una sola hoja en el celular): en la ficha, un botón que la cierra y deja a la vista lo que tapaba; en una pregunta, sólo qué vuelve al contestarla.
  const back = crumb ? (
    <Button variant="tertiary" size="sm" icon="chevron-left" data-layer-back="" aria-label={t('auto.layer.back', { place: crumb.label })} className="min-h-11! justify-self-start px-0! text-info" onClick={crumb.onBack}>
      {crumb.label}
    </Button>
  ) : saved && !onDismiss ? (
    <p data-layer-back="" className="m-0 flex min-w-0 items-center gap-1 text-micro font-semibold text-info">
      <Icon name="chevron-left" size={14} strokeWidth={2} className="shrink-0" />
      <span className="sr-only">{t('auto.layer.after')}</span>
      <span className="truncate">{saved}</span>
    </p>
  ) : null
  const heading = (
    <div className="grid min-w-0 flex-1 gap-1">
      {back}
      {top}
      {head ?? (
        <h2 id={titleId} className="m-0 text-body font-semibold break-words">
          {label}
        </h2>
      )}
    </div>
  )
  const close = onDismiss ? <CloseButton size="lg" tone="ghost" className="-my-1 shrink-0" aria-label={t('common.close')} onClick={onDismiss} /> : null
  const row = actions ? <div className={ACTIONS}>{actions}</div> : null
  // Minimizado: tocar cualquier lugar de la tira que no sea uno de sus botones la sube (el texto es el botón para el teclado).
  const raiseFrom = (event: ReactMouseEvent<HTMLElement>) => {
    if (!(event.target as Element).closest('button:not([data-panel-show]), a, [role="option"]')) setMinimized(false)
  }

  const view = floating ? (
    minimized ? (
      // La tira: la barra con la pregunta y sus botones, en el mismo lugar y con el mismo ancho (el alto, el suyo).
      <div ref={ref} {...attrs} className={cx(windowSurface, windowPlace, 'flex h-auto! min-w-0 flex-col', className)}>
        {bar}
        {row ? <div className="px-2 py-1">{row}</div> : null}
      </div>
    ) : (
      <div ref={ref} {...attrs} className={cx(windowSurface, windowPlace, 'flex min-h-0 min-w-0 flex-col', className)}>
        {bar}
        {side && children ? (
          // Apaisada (M-08): la bandeja a la izquierda; el texto arriba y los botones abajo, a su derecha. En el código, el mismo orden de siempre (texto, bandeja, botones).
          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 p-3 pointer-coarse:pb-7">
            <div className="col-start-2 row-start-1 flex min-w-0 items-start gap-2">
              {heading}
              {aside}
            </div>
            <div data-panel-body="" className="col-start-1 row-span-2 row-start-1 max-h-full max-w-60 self-center overflow-auto overscroll-contain py-0.5">
              {children}
            </div>
            {row ? <div className="col-start-2 row-start-2 min-w-0">{row}</div> : null}
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3 pointer-coarse:pb-7">
            <div className="flex min-w-0 shrink-0 items-start gap-2">
              {heading}
              {aside}
            </div>
            {/* Se reacomoda al ancho; estirada más alta que su contenido, el aire queda acá y no entre los botones. */}
            {children ? (
              <div data-panel-body="" className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-0.5">
                {children}
              </div>
            ) : null}
            {row}
          </div>
        )}
        {grips}
      </div>
    )
  ) : minimized ? (
    // La tira (M-07): la pregunta y sus botones, a la vista; tocarla entera (o arrastrarla para arriba) la sube.
    <div ref={ref} {...attrs} className={cx(surface, place, 'flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1', className)} onClick={raiseFrom}>
      <Swipe dir="up" onFold={() => setMinimized(false)} className="flex min-w-0 flex-1 touch-none">
        <button type="button" data-panel-show="" aria-label={t('duel.prompt.show')} title={t('duel.prompt.show')} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-1 text-left font-semibold focus-visible:outline-none focus-visible:shadow-focus" onClick={() => setMinimized(false)}>
          {strip ?? <span className="min-w-0 truncate">{label}</span>}
          <Icon name="chevron-up" size={16} strokeWidth={2} className="ml-auto shrink-0 text-muted" />
        </button>
      </Swipe>
      {row}
    </div>
  ) : (
    <div ref={ref} {...attrs} className={cx(surface, place, 'flex min-h-0 min-w-0 flex-col gap-2 px-2 pb-2', className)}>
      {/* La franja de arriba es el asa: arrastrarla hacia abajo lo minimiza; el asa misma es un botón («Minimizar», para el teclado). No suma alto (va sobre el aire de arriba). */}
      <Swipe dir="down" onFold={() => setMinimized(true)} follow={follow} className="relative flex min-w-0 touch-none select-none items-start gap-2 pt-3">
        <button
          type="button"
          data-panel-grip=""
          aria-label={t('duel.prompt.minimize')}
          title={t('duel.prompt.minimize')}
          className="absolute left-1/2 top-0 grid h-3 w-16 -translate-x-1/2 place-items-center focus-visible:outline-none focus-visible:shadow-focus"
          onClick={() => setMinimized(true)}
        >
          <span aria-hidden="true" className="h-1 w-10 bg-muted/50" />
        </button>
        {heading}
        {aside}
        {close}
      </Swipe>
      {children ? (
        <div data-panel-body="" className="-mx-2 min-h-0 overflow-y-auto overscroll-contain px-2 py-0.5">
          {children}
        </div>
      ) : null}
      {row}
    </div>
  )

  const content =
    onDismiss && !slot && !inline ? (
      <>
        {/* Tocar afuera cierra (no en la tira: ahí la mesa sigue viva). */}
        {minimized ? null : <div aria-hidden="true" className="fixed inset-0 z-[129]" onClick={() => performance.now() - openedAt.current >= GHOST_CLICK_MS && onDismiss()} />}
        {view}
      </>
    ) : (
      view
    )

  return usePresence(!leaving, inline ? content : typeof document === 'undefined' ? null : createPortal(content, slot ?? document.body), () => [ref.current])
}

/** La franja que se arrastra (`useSwipeFold`): un componente por estado, así lo que recuerda un arrastre (el clic que lo sigue se descarta) no pasa a la tira ni al cartel abierto. */
function Swipe({ dir, onFold, follow, className, children }: { dir: 'down' | 'up'; onFold: () => void; follow?: (dy: number | null) => void; className: string; children: ReactNode }) {
  const swipe = useSwipeFold({ dir, onFold, ...(follow ? { follow } : {}) })

  return (
    <div {...swipe} className={className}>
      {children}
    </div>
  )
}

/** Todas las jugadas de una vez: «Activar efecto» de una carta con varios efectos da un botón por efecto (sin segundo paso ni submenú). */
function flatPlays(items: readonly MenuItem[]): MenuItem[] {
  return items.flatMap((item) => item.children ?? [item])
}

export interface AutoCardSheetProps {
  name: string
  /** Dónde está la carta o de quién es. No se dibuja (M-01: ya la tocaste ahí); la mesa lo sigue pasando. */
  kicker?: string
  art: string | null
  /** Sin imagen (una carta del rival que no mostró): el dorso. */
  back?: boolean
  apiCard?: ApiCardReference | null
  /** Las jugadas que ofrece el núcleo para esta carta (`duel.auto.itemsFor`), en su orden. */
  items: readonly MenuItem[]
  /** Sin jugadas: por qué (`NoPlays`). */
  empty?: ReactNode
  /** Sin jugadas: «Seguir en modo manual», en el pie junto a «Ver carta» (siempre a la vista, aunque lo de arriba no entre). */
  onManual?: () => void
  /** «Ver carta»: el texto entero. */
  onInspect?: () => void
  onClose: () => void
  /** En el celular, el visor de una pila que la ficha tapa («GY · 2»): arriba, su «volver» (`AutoPanel.crumb`). */
  crumb?: { label: string; onBack: () => void }
  /** Sólo el catálogo lo fuerza (la ventana a 1440 px en su marco); en la mesa, según el ancho. */
  variant?: AutoPanelVariant
}

/**
 * La ficha de una carta en el duelo automático (M-01; en el celular y en escritorio, la misma): la miniatura, el nombre, el chip de su tipo con el color de su marco (`frameKindOf`) y su
 * nivel y ATK/DEF, dos renglones del efecto y «Ver carta»; debajo, **todas** las jugadas que ofrece el núcleo (`menuitem`) en filas de a dos botones de 44 px con el texto en un renglón («…» si
 * no entra), la principal (la primera del núcleo que se puede) al final, abajo a la derecha y rellena. Sin «Más», sin «⋯» y sin submenús (`flatPlays`). Se cierra con la X, Escape o tocando
 * afuera; el foco vuelve a la carta. Reemplaza a `CardSheet`/`CardMenu` sólo con `duel.auto` (la mesa manual no cambia).
 */
export function AutoCardSheet({ name, art, back = false, apiCard = null, items, empty, onManual, onInspect, onClose, crumb, variant }: AutoCardSheetProps) {
  const nameId = useId()
  const [armed, setArmed] = useState(false)
  const plays = flatPlays(items)
  // La principal, al final: las demás jugadas en su orden y ella abajo a la derecha. Los efectos de una misma jugada («Efecto 2», «Efecto 3») van juntos y en su orden.
  const groups = items.map((item) => item.children ?? [item])
  const first = groups.findIndex((group) => group.some((play) => !play.disabled))
  const ordered = (first < 0 ? groups : [...groups.filter((_, index) => index !== first), groups[first]!]).flat()
  // Sin imagen, la carta sobre el color de su tipo (lámina T), como el chip.
  const frame = apiCard ? frameKindOf(apiCard.frameType, apiCard.cardType) : null
  const stats = apiCard?.atk != null ? [`${t('duel.dock.atk')} ${apiCard.atk}`, ...(apiCard.def != null ? [`${t('duel.dock.def')} ${apiCard.def}`] : [])].join(' / ') : null
  // Sin jugadas (a 360×740, desde el Cementerio, la cabeza se comía la hoja): «Seguir en modo manual» va al pie, siempre a la vista; el porqué queda solo en el cuerpo.
  const bare = plays.length === 0
  const foot = bare && onManual ? (
    <Button variant="secondary" className={cx(PANEL_MAIN, 'ml-auto')} onClick={onManual}>
      {t('auto.bar.manual')}
    </Button>
  ) : undefined

  // Las jugadas son los botones de la ficha: la fila de abajo, que no se desplaza. Filas de a dos (con una suelta, la primera ocupa su fila: la principal queda con pareja, abajo a la derecha); en la ventana, a su ancho y a la derecha.
  const menu = (
    <div role="menu" aria-label={name} className="w-full min-w-0">
      <div className="grid grid-cols-2 gap-2 group-data-[auto-panel=floating]/panel:flex group-data-[auto-panel=floating]/panel:flex-wrap group-data-[auto-panel=floating]/panel:justify-end">
        {ordered.map((item, index) => {
          const main = index === ordered.length - 1 && first >= 0 && !item.disabled

          return (
            <Button
              key={`${index}|${item.label}`}
              role="menuitem"
              variant={main ? 'primary' : 'secondary'}
              aria-disabled={item.disabled || undefined}
              title={item.hint ?? item.label}
              className={cx('min-w-0 whitespace-nowrap px-3! group-data-[auto-panel=floating]/panel:min-w-32', ordered.length % 2 === 1 && index === 0 && ordered.length > 1 && 'col-span-2', ordered.length === 1 && 'col-span-2', item.disabled && 'cursor-default opacity-40')}
              onClick={item.disabled ? undefined : item.onSelect}
            >
              <span className="min-w-0 truncate">{item.label}</span>
            </Button>
          )
        })}
      </div>
    </div>
  )

  // La ficha sale al levantar el dedo de la carta: el clic que el celular manda después caería en una jugada. Un instante no atiende toques.
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), GHOST_CLICK_MS)

    return () => window.clearTimeout(timer)
  }, [])
  // Cerrada, el foco vuelve a la carta que se tocó, si se perdió (si lo tomó una pregunta del núcleo que la tapó, se queda ahí).
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null

    return () => {
      const active = document.activeElement

      if (!active || active === document.body) back?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <AutoPanel
      kind="card"
      role="region"
      label={name}
      labelledBy={nameId}
      focus='[role="menuitem"]'
      onDismiss={onClose}
      {...(crumb ? { crumb } : {})}
      variant={variant}
      className={armed ? undefined : 'pointer-events-none'}
      actions={bare ? foot : menu}
      head={
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2">
          <figure className="relative m-0 aspect-[421/614] w-full overflow-hidden bg-input">
            {back ? <span className={CARD_BACK} /> : <CardArt remoteUrl={art} name={name} {...(frame ? { frame } : {})} className="block h-full w-full object-cover" />}
            {/* La carta se toca: la abre en grande, con su detalle (sin botón «Ver carta»; con el panel de detalle a la vista, la mesa no pasa `onInspect`). */}
            {onInspect ? (
              <button type="button" aria-label={t('practice.dialog.viewCard')} title={t('practice.dialog.viewCard')} className="absolute inset-0 grid place-items-end justify-items-end p-0.5 text-white focus-visible:outline-none focus-visible:shadow-focus" onClick={onInspect}>
                <span className="grid size-5 place-items-center border border-border-subtle bg-background/85">
                  <Icon name="search" size={12} />
                </span>
              </button>
            ) : null}
          </figure>
          <div className="grid min-w-0 gap-0.5">
            <h2 id={nameId} className="m-0 line-clamp-2 text-body font-bold text-foreground">
              {name}
            </h2>
            {apiCard ? (
              <p className="m-0 flex min-w-0 items-center gap-1.5 text-micro text-muted">
                {/* El tipo, en un chip del color de su marco (lámina T). */}
                <span data-type-chip="" className={cx('relative shrink-0 px-1.5 font-semibold', frame && frameTextClass(frame))}>
                  {cardTypeLabel(apiCard)}
                </span>
                <span className="min-w-0 truncate">{[levelText(apiCard), stats].filter(Boolean).join(' · ')}</span>
              </p>
            ) : null}
            {apiCard?.description ? <p className="m-0 line-clamp-2 text-micro text-muted">{apiCard.description}</p> : null}
          </div>
        </div>
      }
    >
      {bare ? <div role="menu" aria-label={name}>{empty ?? <p className="m-0 text-micro text-muted">{t('practice.dialog.empty')}</p>}</div> : null}
    </AutoPanel>
  )
}
