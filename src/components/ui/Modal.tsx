import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { CloseButton } from './IconButton'
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
  const sheet = size === 'sheet' || size === 'keypad'

  return createPortal(
    <div
      className={cx('fixed inset-0 grid place-items-center overscroll-contain bg-background/80 p-2 sm:p-4', above ? 'z-260' : 'z-180', sheet && 'max-sm:place-items-end max-sm:p-0', size === 'screen' && 'max-[1101px]:p-0!')}
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
            {dismissible ? <CloseButton size="sm" aria-label={t('common.close')} onClick={onClose} /> : null}
          </header>
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

        <div className={cx('min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain', !flush && 'p-5 min-[1101px]:px-6 min-[1101px]:py-5')}>
          {children}
        </div>

        {footer ? (
          // Un diálogo `bare` arma su propio encabezado (con su padding): su pie queda como estaba, alineado con ese.
          <footer className={cx('flex flex-wrap items-center justify-end border-t border-border-subtle min-[1101px]:px-6', bare ? 'gap-2 px-4 py-3' : 'gap-3 px-5 py-4')}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
