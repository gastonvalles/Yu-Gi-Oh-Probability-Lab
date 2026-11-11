import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving, usePresence } from '../../app/use-presence'
import { useSwipeFold } from '../../app/use-swipe-fold'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { PromptTurnContext, promptTurnText } from '../duel/MatPrompt'
import { GHOST_CLICK_MS, type MenuItem } from '../probability/MatDialogs'
import { phaseRowEntries } from '../probability/PhaseRow'
import { CARD_BACK } from '../probability/practice-styles'
import { useSheetHost } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { CloseButton, IconButton, TileButton } from '../ui/IconButton'
import { overline } from '../ui/typography'

/** `docked`: apoyado abajo, sobre tu mano (el celular y, por ahora, el escritorio). `floating`: la ventana que se arrastra y se estira del escritorio (la completa TI-145; hoy se ve acoplada). */
type AutoPanelVariant = 'docked' | 'floating'

interface AutoPanelProps {
  /** `data-prompt`: qué cartel es (la mesa y las pruebas lo buscan por esto). */
  kind: string
  /** La pregunta, en texto: el título, la tira minimizada y su nombre accesible. */
  label: string
  /** En lugar del título (la ficha de una carta): quien lo pasa nombra el cartel con `labelledBy`. */
  head?: ReactNode
  /** Arriba de la pregunta, chico: de qué carta es (`AskWhy`) o qué pasó. */
  top?: ReactNode
  /** A la derecha del título (el modo de respuesta en escritorio): no suma un renglón. */
  aside?: ReactNode
  /** La bandeja de cartas o las opciones: lo único que se desplaza si no entra. */
  children?: ReactNode
  /** Los botones de abajo (lo que descarta a la izquierda, sin caja; la principal a la derecha): también en la tira minimizada. */
  actions?: ReactNode
  /** Al abrirse, el foco va a esto (un selector adentro). */
  focus?: string
  /** Escape lo minimiza (sólo si Escape no hace otra cosa: en una cadena es «No responder»). */
  escape?: boolean
  /** dialog (por defecto); group, la banda que no se lleva el foco de la mesa; egion, la ficha de una carta (como la hoja de la mesa manual). */
  role?: 'dialog' | 'group' | 'region'
  labelledBy?: string
  describedBy?: string
  /** Se cierra (la ficha de una carta, las fases): la X, Escape y tocar afuera; el foco queda adentro y vuelve a lo que lo tenía. Sin esto, hay que contestar: sólo se minimiza. */
  onDismiss?: () => void
  variant?: AutoPanelVariant
  className?: string
}

/**
 * El cascarón de los carteles del duelo automático (la pregunta, la bandeja, las opciones, la ficha de una carta y las fases): **texto arriba, bandeja si hay, botones abajo**, apoyado sobre tu mano
 * desde abajo y con techo en el borde de abajo de la línea (`data-duel-line`): nunca empuja ni tapa el campo ni la cadena (va en un portal `fixed`; la mesa no se entera). Mide lo de su contenido (sin
 * alto fijo): 8 px entre grupos y la pregunta en `text-body`; fondo al 92 % en alfa plano, sin desenfoque, y esquinas rectas (`mat-square`). En escritorio, el mismo cartel con 620 px de ancho máximo,
 * centrado en la columna de la mesa (`--mat-x`, `--mat-w`). Arrastrar la franja de arriba hacia abajo (o «Minimizar», o Escape con `escape`) lo deja en una tira con la pregunta y sus botones; nunca se
 * cierra solo. Con la hoja de la cadena abierta en el celular (`SheetHost`), va en su pie: una sola hoja. Va dentro de un `Presence` (así sale al contestarse).
 */
export function AutoPanel({ kind, label, head, top, aside, children, actions, focus, escape = false, role = 'dialog', labelledBy, describedBy, onDismiss, variant = 'docked', className }: AutoPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const leaving = useLeaving()
  const host = useSheetHost()
  const slot = host?.slot ?? null
  // En un marco del catálogo (`SheetHost phone`), en su lugar: ni portal ni `fixed`.
  const inline = host?.phone === true && !slot
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY) && host?.phone !== true
  const turn = useContext(PromptTurnContext)
  const [minimized, setMinimized] = useState(false)
  // Con el dedo, la franja de arriba sigue al dedo hacia abajo (corriendo su `translate`, sin redibujar) y, soltada lejos, lo minimiza; minimizado, el asa hacia arriba lo abre.
  const follow = (dy: number | null) => {
    if (ref.current) ref.current.style.translate = dy === null ? '' : `${desktop && !slot ? '-50%' : '0'} ${dy}px`
  }
  const dismissible = Boolean(onDismiss) && !leaving
  const openedAt = useRef(0)

  useEscapeKey(() => (onDismiss ? onDismiss() : setMinimized(true)), (dismissible || escape) && !minimized && !leaving)
  useFocusTrap(ref, dismissible && !minimized && !inline)

  // Al abrir (y al reabrirlo), el foco va a lo que se decide; minimizado, a la flecha que lo abre. Sin desplazar la página.
  useEffect(() => {
    const target = minimized ? '[data-panel-show]' : (focus ?? '[data-panel-fold]')

    if (target) ref.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: true })
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
      const ceiling = line ? `${Math.max(0, Math.round(line.getBoundingClientRect().bottom))}px` : '50dvh'

      if (root.style.getPropertyValue('--panel-ceiling') !== ceiling) root.style.setProperty('--panel-ceiling', ceiling)
    }

    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [slot, inline, minimized])

  const named = labelledBy ?? titleId
  const attrs = {
    role,
    // Minimizado, su nombre es la pregunta corta de la tira (lo que lo nombraba abierto ya no está).
    ...(minimized ? { 'aria-label': label } : { 'aria-labelledby': named, ...(describedBy ? { 'aria-describedby': describedBy } : {}) }),
    'data-prompt': kind,
    'data-auto-panel': variant,
    // `data-lowered`: el mismo estado con el nombre de las hojas del celular (lo leen la mesa y sus pruebas).
    ...(minimized ? { 'data-minimized': '', 'data-lowered': '' } : {}),
  }
  const place = slot
    ? 'border-t border-border-subtle'
    : inline
      ? 'relative mx-auto w-full max-w-155 border border-primary/60'
      : cx(
        'fixed inset-x-0 bottom-0 z-[130] max-h-[calc(100dvh-var(--panel-ceiling,50dvh))] border-t border-primary/60 shadow-overlay',
        'min-[1101px]:inset-x-auto min-[1101px]:left-[var(--mat-x,50%)] min-[1101px]:w-[min(38.75rem,var(--mat-w,100vw))] min-[1101px]:-translate-x-1/2 min-[1101px]:border-x',
        'pb-[env(safe-area-inset-bottom,0px)]',
      )
  const surface = 'mat-square pointer-events-auto bg-card-background/92 text-body text-foreground motion-safe:animate-sheet-in'

  const view = minimized ? (
    // La tira: la pregunta y sus botones, a la vista; tocar la flecha (o arrastrarla para arriba) lo abre entero.
    <div ref={ref} {...attrs} className={cx(surface, place, 'flex min-w-0 items-center gap-2 px-2 py-1', className)}>
      <Swipe dir="up" onFold={() => setMinimized(false)} className="flex min-w-0 flex-1 touch-none items-center gap-1">
        <IconButton size="lg" tone="ghost" data-panel-show="" aria-label={t('duel.prompt.show')} title={t('duel.prompt.show')} onClick={() => setMinimized(false)}>
          <Icon name="chevron-up" />
        </IconButton>
        <p className="m-0 min-w-0 truncate font-semibold">{label}</p>
      </Swipe>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  ) : (
    <div ref={ref} {...attrs} className={cx(surface, place, 'flex min-h-0 min-w-0 flex-col gap-2 px-2 pb-2', className)}>
      {/* La franja de arriba es el asa: arrastrarla hacia abajo lo minimiza. La rayita no suma alto (va sobre el aire de arriba). */}
      <Swipe dir="down" onFold={() => setMinimized(true)} follow={follow} className="relative flex min-w-0 touch-none select-none items-start gap-2 pt-2">
        <span aria-hidden="true" className="absolute left-1/2 top-0.5 h-1 w-10 -translate-x-1/2 bg-muted/50" />
        <div className="grid min-w-0 flex-1 gap-1">
          {turn ? (
            <p data-prompt-turn="" className="m-0 text-micro text-muted">
              {promptTurnText(turn)}
            </p>
          ) : null}
          {top}
          {head ?? (
            <h2 id={titleId} className="m-0 text-body font-semibold break-words">
              {label}
            </h2>
          )}
        </div>
        {aside}
        <IconButton size="lg" tone="ghost" data-panel-fold="" className="-my-1 shrink-0" aria-label={t('duel.prompt.minimize')} title={t('duel.prompt.minimize')} onClick={() => setMinimized(true)}>
          <Icon name="chevron-down" />
        </IconButton>
        {onDismiss ? <CloseButton size="lg" tone="ghost" className="-my-1 shrink-0" aria-label={t('common.close')} onClick={onDismiss} /> : null}
      </Swipe>
      {children ? (
        <div data-panel-body="" className="-mx-2 min-h-0 overflow-y-auto overscroll-contain px-2 py-0.5">
          {children}
        </div>
      ) : null}
      {actions ? <div className="flex min-w-0 items-center justify-between gap-2">{actions}</div> : null}
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

/** El ícono de cada jugada que ofrece el núcleo (`ask-ui`: los textos de la mesa manual); la que no está en la lista, el rayo de activar. */
const playIcons = (): ReadonlyArray<readonly [string, IconName]> => [
  [t('practice.menu.normalSummon'), 'summon'],
  [t('practice.menu.flipSummon'), 'summon'],
  [t('practice.menu.set'), 'set'],
  [t('practice.menu.specialSummon'), 'special'],
  [t('practice.menu.pendulumSummon'), 'special'],
  [t('practice.menu.asScale'), 'layers'],
  [t('practice.menu.battleAttack'), 'sword'],
  [t('practice.menu.attackDirectly'), 'sword'],
  [t('practice.menu.toAttack'), 'swap'],
  [t('practice.menu.toDefense'), 'swap'],
]

function playIcon(label: string): IconName {
  return playIcons().find(([text]) => text === label)?.[1] ?? 'zap'
}

/** Todas las jugadas de una vez: «Activar efecto» de una carta con varios efectos da un botón por efecto (sin segundo paso ni submenú). */
function flatPlays(items: readonly MenuItem[]): MenuItem[] {
  return items.flatMap((item) => item.children ?? [item])
}

export interface AutoCardSheetProps {
  name: string
  /** Dónde está la carta o de quién es: arriba del nombre. */
  kicker?: string
  art: string | null
  /** Sin imagen (una carta del rival que no mostró): el dorso. */
  back?: boolean
  apiCard?: ApiCardReference | null
  /** Las jugadas que ofrece el núcleo para esta carta (`duel.auto.itemsFor`), en su orden. */
  items: readonly MenuItem[]
  /** Sin jugadas: por qué (`NoPlays`). */
  empty?: ReactNode
  /** «Ver carta»: el texto entero. */
  onInspect?: () => void
  onClose: () => void
}

/**
 * La ficha de una carta en el duelo automático (en el celular y en escritorio, la misma): la miniatura, el nombre, el tipo y su ATK/DEF, tres renglones del efecto y «Ver carta»; debajo, **todas** las
 * jugadas que ofrece el núcleo como botones cuadrados con ícono y rótulo (`menuitem`): la principal primero, violeta y de doble ancho; las demás en una grilla de 5 columnas (8 desde 576 px de cartel: en escritorio). Sin «Más»,
 * sin «⋯» y sin submenús (`flatPlays`). Se cierra con la X, Escape o tocando afuera; el foco vuelve a la carta. Reemplaza a `CardSheet`/`CardMenu` sólo con `duel.auto` (la mesa manual no cambia).
 */
export function AutoCardSheet({ name, kicker, art, back = false, apiCard = null, items, empty, onInspect, onClose }: AutoCardSheetProps) {
  const nameId = useId()
  const [armed, setArmed] = useState(false)
  const plays = flatPlays(items)
  const first = plays.findIndex((item) => !item.disabled)
  const stats = apiCard?.atk != null ? [`${t('duel.dock.atk')} ${apiCard.atk}`, ...(apiCard.def != null ? [`${t('duel.dock.def')} ${apiCard.def}`] : [])].join(' / ') : null

  // La ficha sale al levantar el dedo de la carta: el clic que el celular manda después caería en una jugada. Un instante no atiende toques.
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), GHOST_CLICK_MS)

    return () => window.clearTimeout(timer)
  }, [])
  // Cerrada, el foco vuelve a la carta que se tocó.
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null

    return () => back?.focus({ preventScroll: true })
  }, [])

  return (
    <AutoPanel
      kind="card"
      role="region"
      label={name}
      labelledBy={nameId}
      focus='[role="menuitem"]'
      onDismiss={onClose}
      className={armed ? undefined : 'pointer-events-none'}
      head={
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2">
          <figure className="relative m-0 aspect-[421/614] w-full overflow-hidden bg-input">{back ? <span className={CARD_BACK} /> : <CardArt remoteUrl={art} name={name} className="block h-full w-full object-cover" />}</figure>
          <div className="grid min-w-0 gap-0.5">
            {kicker ? <p className={cx('m-0', overline)}>{kicker}</p> : null}
            <h2 id={nameId} className="m-0 line-clamp-2 text-body font-bold text-foreground">
              {name}
            </h2>
            {apiCard ? <p className="m-0 truncate text-micro text-muted">{[apiCard.cardType, stats].filter(Boolean).join(' · ')}</p> : null}
            {apiCard?.description ? <p className="m-0 line-clamp-3 text-micro text-muted">{apiCard.description}</p> : null}
            {onInspect ? (
              <Button variant="tertiary" size="sm" iconEnd="chevron-right" className="min-h-8! justify-self-start px-0! text-info pointer-coarse:min-h-11!" onClick={onInspect}>
                {t('practice.dialog.viewCard')}
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      <div role="menu" aria-label={name} className="@container">
        {plays.length === 0 ? (
          (empty ?? <p className="m-0 text-micro text-muted">{t('practice.dialog.empty')}</p>)
        ) : (
          <div className="grid grid-cols-5 gap-1 @min-[36rem]:grid-cols-8">
            {plays.map((item, index) => (
              <Button
                key={`${index}|${item.label}`}
                role="menuitem"
                variant={index === first ? 'primary' : 'secondary'}
                size="sm"
                icon={playIcon(item.label)}
                aria-disabled={item.disabled || undefined}
                title={item.hint ?? item.label}
                className={cx('min-h-14 min-w-0 flex-col gap-1 px-1! py-1.5! text-micro', index === first && 'col-span-2', item.disabled && 'cursor-default opacity-40')}
                onClick={item.disabled ? undefined : item.onSelect}
              >
                <span className="line-clamp-3 min-w-0 hyphens-auto break-words text-center">{item.label}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
    </AutoPanel>
  )
}

/** Lo que se elige con las flechas en las fases: las apagadas se enfocan con Tab (dicen «Todavía no»), pero las flechas las saltean. */
const CHOOSABLE = '[role="menuitem"]:not([aria-disabled="true"])'

/**
 * Las fases del duelo automático (`PhaseRow` en la mesa manual): seis botones cuadrados unidos por una línea fina, la de ahora con el aro lima, las que se pueden elegir con aro blanco y las que no,
 * apagadas y punteadas (se distinguen por la forma, no sólo por el color); «Cancelar» abajo. Qué se puede elegir lo da el núcleo (`items`). ← → Inicio y Fin recorren las elegibles; Escape, la X o
 * tocar afuera la cierran.
 */
export function AutoPhases({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const title = t('auto.phase.title')
  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(CHOOSABLE)]
    const at = rows.findIndex((row) => row === document.activeElement)
    const next = event.key === 'ArrowRight' ? at + 1 : event.key === 'ArrowLeft' ? (at < 0 ? rows.length : at) - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : null

    if (next === null || rows.length === 0) return
    event.preventDefault()
    rows[(next + rows.length) % rows.length]!.focus()
  }

  return (
    <AutoPanel
      kind="phases"
      label={title}
      focus='[aria-current="true"]'
      onDismiss={onClose}
      actions={
        <Button variant="tertiary" size="sm" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
    >
      <div role="menu" aria-orientation="horizontal" aria-label={title} className="relative flex justify-between" onKeyDown={onKey}>
        {/* La línea fina que une las seis, a la altura del centro de las cajas (detrás). */}
        <span aria-hidden="true" className="absolute inset-x-6 top-5 h-px bg-border" />
        {phaseRowEntries(items).map(({ item, short, word, name }) => (
          // La caja de cada fase (`TileButton`): las elegibles con aro blanco; la de ahora, llena de lima; las que no, punteadas y apagadas.
          <TileButton
            key={item.label}
            role="menuitem"
            // Debajo de la de ahora, «ahora» (su nombre lo dice la caja: «M1»); el lector oye «Fase actual: Main Phase 1».
            label={item.current ? t('auto.phase.now') : word}
            aria-label={name}
            aria-current={item.current ? 'true' : undefined}
            aria-disabled={item.disabled || undefined}
            className="relative min-w-0! flex-1 [&>span:first-child]:border-2 [&>span:first-child]:border-white [&[aria-current=true]>span:first-child]:bg-info [&[aria-current=true]>span:first-child]:text-background [&[aria-disabled=true]>span:first-child]:border-dashed [&[aria-disabled=true]>span:first-child]:border-border [&[aria-disabled=true]>span:first-child]:opacity-60"
            onClick={item.disabled ? undefined : item.onSelect}
          >
            <span className="text-micro font-extrabold leading-none">{short}</span>
          </TileButton>
        ))}
      </div>
    </AutoPanel>
  )
}
