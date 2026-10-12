import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { CloseButton } from './IconButton'
import { surface } from './surfaces'
import { TONE, type Tone } from './tone'
import { overline } from './typography'

/**
 * Tamaños fijos: el panel no crece ni se achica según el contenido (el cuerpo scrollea por dentro).
 * 'sm' es para avisos y confirmaciones; en mobile los de contenido ocupan toda la pantalla.
 * 'board' es la mesa de práctica: en el celu es una hoja pegada abajo de la altura del contenido (campo, salidas
 * y mano, sin espacio muerto; la mano queda al alcance del pulgar); en escritorio se ensancha para el campo
 * completo y el panel de pasos.
 */
type ModalSize = 'sm' | 'md' | 'full' | 'board' | 'sheet' | 'screen'

const FULL_HEIGHT_MOBILE = 'max-sm:h-[calc(100dvh-1rem)]'

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'w-[min(32rem,100%)]',
  /** Toda la pantalla (menos el margen): para contenido con la estructura del builder. */
  full: `w-full h-[calc(100dvh-2rem)] ${FULL_HEIGHT_MOBILE}`,
  md: `w-[min(44rem,100%)] h-[min(40rem,calc(100dvh-2rem))] ${FULL_HEIGHT_MOBILE}`,
  board:
    'w-[min(40rem,100%)] h-[min(46rem,calc(100dvh-2rem))] max-sm:h-auto max-sm:max-h-[min(96dvh,52rem)] max-sm:w-full max-sm:rounded-b-none max-sm:border-b-0 min-[1101px]:w-[min(78rem,100%)] min-[1101px]:h-[min(50rem,calc(100dvh-2rem))]',
  sheet: 'w-[min(70rem,100%)] h-[min(46rem,calc(100dvh-2rem))] min-[1101px]:h-[min(33rem,calc(100dvh-2rem))] max-sm:h-[min(94dvh,52rem)] max-sm:w-full max-sm:rounded-b-none max-sm:border-b-0',
  /** La calculadora de LP: toda la pantalla en el celular (sin margen ni bordes); en escritorio, un panel del tamaño de un celular. */
  screen:
    'max-[1100px]:h-dvh max-[1100px]:max-h-dvh! max-[1100px]:w-full max-[1100px]:rounded-none! max-[1100px]:border-0! min-[1101px]:h-[min(52rem,calc(100dvh-2rem))] min-[1101px]:w-[26rem]',
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  size?: ModalSize
  kicker?: ReactNode
  /** Ícono del encabezado (en un cuadrito teñido por `tone`): el tipo de diálogo se reconoce sin leer. */
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
  children: ReactNode
}

/**
 * Modal único de la app: se monta en <body> (así nunca queda atrapado dentro de un
 * contenedor con transform), centrado, con el mismo fondo, animación, cierre y scroll.
 */
export function Modal({
  isOpen,
  onClose,
  size = 'md',
  kicker,
  icon,
  tone = 'brand',
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
  children,
}: ModalProps) {
  const id = useId()
  const titleId = `${id}-title`
  const panelRef = useRef<HTMLDivElement>(null)
  // El fondo cierra sólo si el toque empezó ahí: si empezó en el panel y el panel se achicó o movió antes de
  // soltar (se cerró una explicación, cambió el contenido), el click cae en el fondo pero no es un cierre.
  const pressedBackdropRef = useRef(false)

  useBodyScrollLock(isOpen)
  useEscapeKey(onClose, isOpen && dismissible)
  useFocusTrap(panelRef, isOpen)

  if (!isOpen || typeof document === 'undefined') {
    return null
  }

  const hasHeader = !bare && (kicker || title || subtitle)
  const sheet = size === 'sheet' || size === 'board'

  return createPortal(
    <div
      className={cx('fixed inset-0 grid place-items-center overscroll-contain bg-background/80 p-2 sm:p-4', above ? 'z-260' : 'z-180', sheet && 'max-sm:place-items-end max-sm:p-0', size === 'screen' && 'max-[1100px]:p-0!')}
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
      <div
        ref={panelRef}
        tabIndex={-1}
        role={role}
        aria-modal="true"
        aria-labelledby={hasHeader && title ? titleId : undefined}
        aria-label={hasHeader && title ? undefined : ariaLabel}
        className={cx(
          'relative flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden p-0 outline-none motion-reduce:animate-none',
          sheet ? 'max-sm:animate-sheet-up sm:animate-dialog-enter' : 'animate-dialog-enter',
          'sm:max-h-[calc(100dvh-2rem)]',
          surface.panel,
          SIZE_CLASS[size],
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {hasHeader ? (
          <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3.5 min-[1101px]:px-6 min-[1101px]:py-4">
            <div className="flex min-w-0 items-start gap-3">
              {icon ? <Icon name={icon} size={22} className={cx('mt-0.5 shrink-0', TONE[tone].text)} /> : null}
              <div className="grid min-w-0 gap-0.5">
                {kicker ? <p className={cx('m-0', overline)}>{kicker}</p> : null}
                {title ? (
                  <h3 id={titleId} className="m-0 text-lead font-semibold tracking-[-0.01em] text-foreground [overflow-wrap:anywhere] min-[1101px]:text-lead">
                    {title}
                  </h3>
                ) : null}
                {subtitle ? <p className="m-0 text-body text-muted">{subtitle}</p> : null}
              </div>
            </div>
            {dismissible ? <CloseButton size="sm" aria-label="Cerrar" onClick={onClose} /> : null}
          </header>
        ) : dismissible && !hideCloseButton ? (
          <CloseButton
            size={closeSize}
            tone={closeTone}
            aria-label="Cerrar"
            className={cx(
              'absolute z-10',
              closeClassName ?? 'right-3 top-3 min-[1101px]:right-4 min-[1101px]:top-4',
            )}
            onClick={onClose}
          />
        ) : null}

        <div className={cx('min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain', !flush && 'p-4 min-[1101px]:px-6 min-[1101px]:py-5')}>
          {children}
        </div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle px-4 py-3 min-[1101px]:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
