import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { usePresence } from '../../app/use-presence'
import { t } from '../../i18n'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { CloseButton, IconButton } from './IconButton'
import { PromptHandle } from './SheetHandle'
import { surface } from './surfaces'
import { TONE, type Tone } from './tone'
import { overline } from './typography'
import { Heading } from './Heading'

/**
 * Tamaños fijos: el panel no crece ni se achica según el contenido (el cuerpo scrollea por dentro).
 * 'sm' es para avisos y confirmaciones; en mobile los de contenido ocupan toda la pantalla.
 */
type ModalSize = 'sm' | 'md' | 'full' | 'sheet' | 'screen' | 'keypad'

const FULL_HEIGHT_MOBILE = 'max-sm:h-[calc(100dvh-1rem)]'

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'w-[min(32rem,100%)]',
  /** Toda la pantalla (menos el margen): para contenido con la estructura del builder. */
  full: `w-full h-[calc(100dvh-2rem)] ${FULL_HEIGHT_MOBILE}`,
  md: `w-[min(44rem,100%)] h-[min(40rem,calc(100dvh-2rem))] ${FULL_HEIGHT_MOBILE}`,
  sheet: 'w-[min(70rem,100%)] h-[min(46rem,calc(100dvh-2rem))] min-[1101px]:h-[min(33rem,calc(100dvh-2rem))] max-sm:h-[min(94dvh,52rem)] max-sm:w-full max-sm:rounded-b-none max-sm:border-b-0',
  /** Una hoja chica que en el celular sale de abajo (al alcance del pulgar) y ocupa lo que lleva: un teclado, una elección. En escritorio, un diálogo común. */
  keypad: 'w-[min(26rem,100%)] max-sm:w-full max-sm:rounded-b-none max-sm:border-b-0',
  /** La calculadora de LP: toda la pantalla en el celular (sin margen ni bordes); en escritorio, un panel del tamaño de un celular. */
  screen:
    'max-[1101px]:h-dvh max-[1101px]:max-h-dvh! max-[1101px]:w-full max-[1101px]:rounded-none! max-[1101px]:border-0! min-[1101px]:h-[min(52rem,calc(100dvh-2rem))] min-[1101px]:w-[26rem]',
}

/**
 * Desde la mesa (`anchor="mat"`): el ancho de siempre sin pasarse de la columna de la mesa (`--mat-w`) y, la hoja, su alto de siempre sin pasarse de lo que entra centrado en la fila Extra
 * (`--mat-room`); en todos los anchos es un diálogo (ya no sale de abajo en el celular). Las variables las escribe la mesa (`matSpot`); sin mesa, la pantalla.
 */
const MAT_SIZE_CLASS: Partial<Record<ModalSize, string>> = {
  sm: 'w-[min(32rem,var(--mat-w,calc(100vw-1rem)))]',
  md: 'w-[min(44rem,var(--mat-w,calc(100vw-1rem)))] h-[min(40rem,var(--mat-room,calc(100dvh-1rem)))]',
  sheet: 'w-[min(70rem,var(--mat-w,calc(100vw-1rem)))] h-[min(46rem,var(--mat-room,calc(100dvh-1rem)))] min-[1101px]:h-[min(33rem,var(--mat-room,calc(100dvh-1rem)))]',
  keypad: 'w-[min(26rem,var(--mat-w,calc(100vw-1rem)))]',
}

/** Con el teclado del celular abierto la pantalla visible se achica (`visualViewport`) sin que se achique la de la página: más que esto, es el teclado (px). */
const KEYBOARD_PX = 120

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  size?: ModalSize
  kicker?: ReactNode
  /** Ícono del encabezado: blanco si no hay `tone`; con `tone`, toma su color (el tipo de diálogo se reconoce sin leer). */
  icon?: IconName
  tone?: Tone
  title?: ReactNode
  subtitle?: ReactNode
  footer?: ReactNode
  /** Sin encabezado estándar: el contenido trae el suyo (se mantiene la X). */
  bare?: boolean
  /** Sin padding en el cuerpo: el contenido arma sus propias secciones. */
  flush?: boolean
  /** El contenido trae su propia X (p. ej. el detalle de carta). */
  hideCloseButton?: boolean
  /** false = sólo se cierra con un botón propio (avisos que requieren confirmación). */
  dismissible?: boolean
  /** Por encima del detalle de carta y de su zoom: para lo que se abre desde ahí. */
  above?: boolean
  role?: 'dialog' | 'alertdialog'
  ariaLabel?: string
  /** Botón de cerrar flotante (sin encabezado): `flat` es el blanco y grande de la práctica. */
  closeTone?: 'close' | 'flat'
  closeSize?: 'sm' | 'md'
  /** Posición de la X flotante; reemplaza a la estándar. */
  closeClassName?: string
  /**
   * Con encabezado: se minimiza (la flecha de arriba, como la pregunta del medio) a un asa de una línea (`PromptHandle`) en el lugar fijo de la pregunta, apoyada sobre la fila de las Zonas Extra
   * (`--mat-extra`), para ver el campo antes de elegir (las hojas del duelo automático). Minimizada, los toques llegan a lo de atrás; lo de adentro queda como estaba (escondido e inerte) y el
   * foco, en el asa. Cerrar sigue siendo la X, Escape o el botón de siempre; cada vez que se abre, abre entera.
   */
  lowerable?: boolean
  /**
   * `mat`: un cartel de la mesa del duelo (sus hojas, sus menús y sus confirmaciones). Va al centro de la fila de las Zonas Extra (`--mat-x`, `--mat-y`) y no al de la pantalla, con lo más alto
   * que entra ahí (`MAT_SIZE_CLASS`), y en el celular ya no sale de abajo; con el teclado del celular abierto, al centro de lo que queda a la vista (`visualViewport`). Sin mesa, al centro de la pantalla.
   */
  anchor?: 'mat'
  /**
   * false = sin velo: el fondo no se oscurece (los menús de la mesa: con uno abierto el campo se sigue viendo, como con el visor de una pila). Lo demás queda igual (el foco, Escape,
   * tocar afuera); el panel despega del fondo con un borde más marcado (`surface.floating`).
   */
  veil?: boolean
  children: ReactNode
}

/**
 * Modal único de la app: se monta en <body> (así nunca queda atrapado dentro de un
 * contenedor con transform), centrado, con el mismo fondo, animación (de entrada y de salida), cierre y scroll.
 */
export function Modal({
  isOpen,
  onClose,
  size = 'md',
  kicker,
  icon,
  tone,
  title,
  subtitle,
  footer,
  bare = false,
  flush = false,
  hideCloseButton = false,
  dismissible = true,
  above = false,
  role = 'dialog',
  ariaLabel,
  closeTone = 'close',
  closeSize = 'md',
  closeClassName,
  lowerable = false,
  anchor,
  veil = true,
  children,
}: ModalProps) {
  const id = useId()
  const titleId = `${id}-title`
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // El fondo cierra sólo si el toque empezó ahí: si empezó en el panel y el panel se achicó o movió antes de
  // soltar (se cerró una explicación, cambió el contenido), el click cae en el fondo pero no es un cierre.
  const pressedBackdropRef = useRef(false)
  const hasHeader = !bare && (kicker || title || subtitle)
  const sheet = size === 'sheet' || size === 'keypad'
  const mat = anchor === 'mat' && size in MAT_SIZE_CLASS
  const minimizable = lowerable && Boolean(hasHeader)
  const [minimized, setMinimized] = useState(false)
  const [wasOpen, setWasOpen] = useState(isOpen)
  const lowered = minimizable && minimized

  useBodyScrollLock(isOpen)
  useEscapeKey(onClose, isOpen && dismissible)
  useFocusTrap(panelRef, isOpen)

  // Cada vez que se abre, entera.
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (isOpen) setMinimized(false)
  }

  // Minimizada, el foco va a la flecha del asa; reabierta, a la de minimizar (donde estaba). Con el teclado del celular abierto, minimizarla lo cierra.
  const folded = useRef(false)

  useLayoutEffect(() => {
    if (lowered === folded.current) return
    folded.current = lowered
    panelRef.current?.querySelector<HTMLElement>(lowered ? '[data-prompt-show]' : '[data-sheet-minimize]')?.focus({ preventScroll: true })
  }, [lowered])

  // Con el teclado del celular abierto, al centro de lo que queda a la vista: la página no se achica (el teclado la tapa), lo visible sí (`visualViewport`).
  useEffect(() => {
    const root = rootRef.current
    const view = window.visualViewport

    if (!mat || !isOpen || !root || !view) return
    const follow = () => {
      if (window.innerHeight - view.height > KEYBOARD_PX) {
        root.style.setProperty('--mat-y', `${Math.round(view.offsetTop + view.height / 2)}px`)
        root.style.setProperty('--mat-room', `${Math.floor(view.height - 16)}px`)
      } else {
        root.style.removeProperty('--mat-y')
        root.style.removeProperty('--mat-room')
      }
    }

    follow()
    view.addEventListener('resize', follow)
    view.addEventListener('scroll', follow)
    return () => {
      view.removeEventListener('resize', follow)
      view.removeEventListener('scroll', follow)
    }
  }, [mat, isOpen])

  const header = hasHeader ? (
    // La franja de arriba, un tono más clara que el panel (es parte del mismo panel: sin borde ni radio propios).
    <header className="flex items-start justify-between gap-3 border-b border-border-subtle bg-surface-raised px-5 py-4 min-[1101px]:px-6 min-[1101px]:py-5">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <Icon name={icon} size={22} className={cx('mt-0.5 shrink-0', tone ? TONE[tone].text : 'text-foreground')} /> : null}
        <div className="grid min-w-0 gap-0.5">
          {kicker ? <p className={cx('m-0', overline)}>{kicker}</p> : null}
          {title ? (
            <Heading level="section" id={titleId}>
              {title}
            </Heading>
          ) : null}
          {subtitle ? <p className="m-0 text-body text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {minimizable || dismissible ? (
        <div className="flex shrink-0 items-center gap-1">
          {minimizable ? (
            <IconButton tone="close" size="sm" data-sheet-minimize="" aria-label={t('duel.prompt.minimize')} title={t('duel.prompt.minimize')} onClick={() => setMinimized(true)}>
              <Icon name="chevron-down" />
            </IconButton>
          ) : null}
          {dismissible ? <CloseButton size="sm" aria-label={t('common.close')} onClick={onClose} /> : null}
        </div>
      ) : null}
    </header>
  ) : null

  // Al cerrarse sigue montado mientras sale (`usePresence`): el velo se funde y el panel hace su entrada al revés; el foco ya volvió.
  return usePresence(isOpen, isOpen && typeof document !== 'undefined' ? createPortal(
    <div
      ref={rootRef}
      data-anchor={mat ? 'mat' : undefined}
      className={cx(
        'fixed inset-0 overscroll-contain',
        // Desde la mesa, el panel se ubica solo (centrado en la fila Extra); si no, al centro de la pantalla y, `sheet` y `keypad`, desde abajo en el celular.
        !mat && 'grid place-items-center p-2 sm:p-4',
        !mat && sheet && 'max-sm:place-items-end max-sm:p-0',
        above ? 'z-260' : 'z-180',
        size === 'screen' && 'max-[1101px]:p-0!',
        lowered && 'pointer-events-none',
      )}
      onPointerDown={(event) => {
        pressedBackdropRef.current = event.target === event.currentTarget
      }}
      onClick={
        dismissible
          ? (event) => {
              if (pressedBackdropRef.current && event.target === event.currentTarget) onClose()
            }
          : undefined
      }
    >
      {/* El velo, aparte del panel para que se funda solo (entra y sale): no atrapa toques, así el fondo sigue siendo el que cierra. Minimizada se aclara: se ve la mesa. */}
      {veil ? <div aria-hidden="true" className={cx('pointer-events-none absolute inset-0 animate-nav-scrim transition-[background-color] duration-200 motion-reduce:animate-none motion-reduce:transition-none', lowered ? 'bg-transparent' : 'bg-background/80')} /> : null}
      <div
        ref={panelRef}
        tabIndex={-1}
        role={role}
        aria-modal="true"
        aria-labelledby={hasHeader && title ? titleId : undefined}
        aria-label={hasHeader && title ? undefined : ariaLabel}
        data-minimized={lowered ? '' : undefined}
        className={cx(
          'flex min-h-0 flex-col p-0 outline-none motion-reduce:animate-none',
          mat
            ? // En el centro de la fila Extra (con el teclado, en el de lo visible) o, minimizada, el asa apoyada sobre esa fila.
              cx('absolute left-[var(--mat-x,50%)] -translate-x-1/2', lowered ? 'top-[var(--mat-extra,calc(100%-1rem))] -translate-y-full' : 'top-[var(--mat-y,50%)] -translate-y-1/2 max-h-[var(--mat-room,calc(100dvh-1rem))]')
            : cx('relative max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]', sheet ? 'max-sm:animate-sheet-up sm:animate-dialog-enter' : 'animate-dialog-enter'),
          // Minimizada, el fondo deja pasar los toques; el asa, no.
          lowered ? 'pointer-events-auto max-w-[calc(100vw-2rem)]' : cx('overflow-hidden', mat && 'animate-dialog-enter', veil ? surface.panel : surface.floating, mat ? MAT_SIZE_CLASS[size] : SIZE_CLASS[size]),
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {lowered ? <PromptHandle label={typeof title === 'string' ? title : (ariaLabel ?? '')} onShow={() => setMinimized(false)} /> : null}
        {hasHeader ? (
          <div inert={lowered} hidden={lowered} className="contents">
            {header}
          </div>
        ) : dismissible && !hideCloseButton ? (
          <CloseButton
            size={closeSize}
            tone={closeTone}
            aria-label={t('common.close')}
            className={cx(
              'absolute z-10',
              closeClassName ?? 'right-3 top-3 min-[1101px]:right-4 min-[1101px]:top-4',
            )}
            onClick={onClose}
          />
        ) : null}

        <div inert={lowered} hidden={lowered} className={cx('min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain', !flush && 'p-5 min-[1101px]:px-6 min-[1101px]:py-5')}>
          {children}
        </div>

        {footer ? (
          // Un diálogo `bare` arma su propio encabezado (con su padding): su pie queda como estaba, alineado con ese.
          <footer inert={lowered} hidden={lowered} className={cx('flex flex-wrap items-center justify-end border-t border-border-subtle min-[1101px]:px-6', bare ? 'gap-2 px-4 py-3' : 'gap-3 px-5 py-4')}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  ) : null, () => [rootRef.current])
}
