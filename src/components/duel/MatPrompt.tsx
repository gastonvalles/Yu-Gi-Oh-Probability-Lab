import { useEffect, useRef, useState, type ReactNode } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving, usePresence } from '../../app/use-presence'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

interface MatPromptProps {
  /** Lo que dice el asa minimizada: la pregunta, corta («¿Activás el efecto?»). */
  label: string
  /** La fila de arriba (lo que es y la pregunta); el botón de minimizar va a su derecha. */
  head: ReactNode
  children: ReactNode
  /** `data-prompt`: qué pregunta es (la mesa y las pruebas la buscan por esto). */
  kind: string
  /** Más ancho (`data-prompt-row`: una banda con cartas). */
  row?: boolean
  role?: 'status' | 'group'
  labelledBy?: string
  /** Al abrirse (y al reabrirlo), el foco va a esto (un selector adentro del cartel). */
  focus?: string
  /** Escape lo minimiza: sólo si Escape no hace otra cosa (en una cadena es «No responder»; con «Cancelar», cancela). */
  escape?: boolean
  className?: string
}

/**
 * Un cartel que la mesa pone en la ranura de la pregunta (`duel.prompt`: «¿Activás el efecto?», responder a una cadena, elegir de una lista, la pregunta del rival de pasar
 * de fase), sin velo y sin mover nada. Arriba a la derecha, la flecha (44 px, «Minimizar») lo reduce a un asa de una línea («¿Activás el efecto? ▲») que la mesa pone donde no
 * tapa ninguna carta: minimizado, todo lo de abajo se toca (la carta que brilla sigue contestando) y la pregunta sigue pendiente; la flecha del asa («Mostrar la pregunta») lo
 * reabre. Siempre abre entero, aunque no entre sin tapar cartas (la mesa lo pone donde menos tapa): sólo lo minimiza la persona. Minimizado es de esta decisión (quien lo usa le da
 * una `key` por decisión: las repreguntas de la misma lo actualizan en el lugar y una nueva abre entera).
 * Lleva `data-minimized` minimizado (la mesa lo ubica distinto). Contestado, se achica y se funde (va dentro de un `Presence`).
 */
export function MatPrompt({ label, head, children, kind, row = false, role = 'status', labelledBy, focus, escape = false, className }: MatPromptProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const leaving = useLeaving()
  const [minimized, setFold] = useState(false)

  useEscapeKey(() => setFold(true), escape && !minimized && !leaving)
  useEffect(() => {
    const target = minimized ? '[data-prompt-show]' : focus

    if (target) ref.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: true })
  }, [minimized, focus])

  return usePresence(
    !leaving,
    minimized ? (
      <div ref={ref} role={role} aria-label={label} data-prompt={kind} data-minimized="" className="flex max-w-full items-center gap-1 rounded-full border border-info bg-card-background py-0 pl-4 pr-0 text-body text-foreground shadow-overlay">
        <p className="m-0 min-w-0 truncate font-semibold">{label}</p>
        <IconButton size="lg" data-prompt-show="" aria-label={t('duel.prompt.show')} title={t('duel.prompt.show')} onClick={() => setFold(false)}>
          <Icon name="chevron-up" />
        </IconButton>
      </div>
    ) : (
      <div ref={ref} role={role} aria-labelledby={labelledBy} data-prompt={kind} {...(row ? { 'data-prompt-row': '' } : {})} className={cx('grid gap-3 rounded-card border border-info bg-card-background p-4 text-body text-foreground shadow-overlay motion-safe:animate-dialog-enter', className)}>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">{head}</div>
          <IconButton size="lg" className="-my-2 -mr-2 self-start" aria-label={t('duel.prompt.minimize')} title={t('duel.prompt.minimize')} onClick={() => setFold(true)}>
            <Icon name="chevron-down" />
          </IconButton>
        </div>
        {children}
      </div>
    ),
    () => [ref.current],
  )
}
