import type { HTMLAttributes, ReactNode, Ref } from 'react'

import type { SheetDrag } from '../../app/use-sheet-drag'
import { t } from '../../i18n'
import { cx } from './cx'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

interface SheetHandleProps {
  /** El arrastre de la hoja (`useSheetDrag`). */
  drag: SheetDrag
  /** El título de la hoja: bajada, es lo que se lee en la tira. */
  label: string
  /** El encabezado de la hoja (el título y la X): también arrastra. Bajada queda tapado e inerte. */
  children: ReactNode
  className?: string
}

/**
 * La franja de arriba de una hoja de abajo del celular que se baja sin cerrarse (`useSheetDrag`): el asa (un botón con `aria-expanded`; Enter o Espacio la bajan y la suben) y el encabezado.
 * Toda la franja es el asa: se arrastra (`touch-action: none`: lo de abajo, que scrollea, no la mueve) o se toca, y la sube o la baja; sus otros botones (la X) hacen lo suyo. Bajada, la tira
 * dice el título con una flecha para arriba. La llevan el visor de una pila (`PileViewer`) y las hojas del duelo automático (`Modal lowerable`). Muestra: «Hoja que se baja» del catálogo.
 */
export function SheetHandle({ drag, label, children, className }: SheetHandleProps) {
  return (
    <div
      {...drag.handlers}
      className={cx('flex-none touch-none select-none', className)}
      onClick={(event) => {
        const control = (event.target as Element).closest('a, button, input')

        if (control === null || control === drag.gripRef.current) drag.toggle()
      }}
    >
      <button
        ref={drag.gripRef}
        type="button"
        aria-expanded={!drag.lowered}
        aria-label={drag.lowered ? t('common.sheet.raise', { title: label }) : t('common.sheet.lower')}
        // Bajada, la tira mide 44 px (Gastón, 2026-10-29: la de 28 era muy fina); subida, el asa sigue de 28 px y la hoja no crece.
        className={cx('group flex w-full items-center justify-center px-4 outline-none', drag.lowered ? 'h-11' : 'h-7')}
      >
        {/* El aro del foco va en la pastilla de adentro: el de todo el botón lo cortaría el borde de la hoja. Como un botón de ícono, se enciende en ámbar al apuntarla. */}
        <span className={cx('flex min-w-0 items-center gap-1.5 rounded-full px-3 text-foreground group-hover:text-info group-focus-visible:shadow-focus', drag.lowered ? 'h-8' : 'h-5')}>
          {drag.lowered ? (
            <>
              <Icon name="chevron-up" size={14} strokeWidth={2} className="shrink-0" />
              <span aria-hidden="true" className="truncate text-micro font-semibold">
                {label}
              </span>
            </>
          ) : (
            <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-primary-soft/50 group-hover:bg-info" />
          )}
        </span>
      </button>
      <div inert={drag.lowered}>{children}</div>
    </div>
  )
}

interface PromptHandleProps extends HTMLAttributes<HTMLDivElement> {
  /** Lo que dice el asa: la pregunta, corta, o el título de la hoja. */
  label: string
  /** La flecha (44 px, «Mostrar la pregunta», `data-prompt-show`): la reabre. */
  onShow: () => void
  ref?: Ref<HTMLDivElement>
}

/**
 * El asa de una línea de un cartel minimizado de la mesa: la pregunta del medio (`MatPrompt`) y las hojas del duelo (`Modal lowerable`). Va en el lugar fijo de la pregunta, apoyada sobre la fila
 * de las Zonas Extra: no tapa nada de tu campo ni la mano. Muestra: «Hoja de la mesa» del catálogo.
 */
export function PromptHandle({ label, onShow, ref, className, ...props }: PromptHandleProps) {
  return (
    <div ref={ref} {...props} className={cx('flex max-w-full items-center gap-1 rounded-full border border-info bg-card-background py-0 pl-4 pr-0 text-body text-foreground shadow-overlay', className)}>
      <p className="m-0 min-w-0 truncate font-semibold">{label}</p>
      <IconButton size="lg" data-prompt-show="" aria-label={t('duel.prompt.show')} title={t('duel.prompt.show')} onClick={onShow}>
        <Icon name="chevron-up" />
      </IconButton>
    </div>
  )
}
