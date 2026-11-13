import { useEffect, useRef, useState, type ReactNode } from 'react'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving, usePresence } from '../../app/use-presence'
import { matCardPositionKey, touchOr, useDraggableOffset } from '../../app/use-draggable-offset'
import { useSwipeFold } from '../../app/use-swipe-fold'
import { t } from '../../i18n'
import { BottomSheet, useSheetHost } from '../ui/BottomSheet'
import { cx } from '../ui/cx'
import { PromptHandle } from '../ui/SheetHandle'

interface MatPromptProps {
  /** Lo que dice el asa minimizada: la pregunta, corta («¿Activás el efecto?»). */
  label: string
  /** La fila de arriba (lo que es y la pregunta). */
  head: ReactNode
  /** Sólo en escritorio: a la derecha de la cabeza; no suma un renglón (el modo de respuesta). */
  aside?: ReactNode
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
 * Una pregunta de la mesa («¿Activás el efecto?», responder a una cadena, elegir de una lista corta, la pregunta del rival de pasar de fase).
 * - **Desde 1101 px, un cartel** en la ranura de la pregunta (`duel.prompt`), sin velo y sin mover nada, siempre en el mismo lugar: apoyado sobre la fila de las Zonas Extra, crece hacia el campo del rival
 *   (si no entra, sus cartas se achican a lo que hay, `--prompt-art` de la mesa, y si ni así, su cuerpo se desplaza). Sin flecha de bajar: Escape (con `escape`) o el dedo lo reducen a un asa de una línea («¿Activás el efecto? ▲», `PromptHandle`) en ese mismo lugar: minimizado, todo
 *   lo de abajo se toca y la pregunta sigue pendiente; la flecha del asa lo reabre. Con el dedo, arrastrar la fila de arriba hacia abajo lo minimiza y arrastrar el asa hacia arriba lo abre (`useSwipeFold`).
 *   Con el mouse, la fila de arriba (o el asa) lo lleva a cualquier lado y ahí queda para las preguntas que siguen; doble clic, a su lugar (`useDraggableOffset`).
 * - **En el celular, la hoja de abajo estándar** (`BottomSheet`, Gastón 2026-11-02: «no aparece como debería sino como un cartel en el medio de la pantalla»): la fila de arriba es su título y lo que se
 *   decide va en su pie, siempre a la vista; bajada (arrastrándola, tocando su asa o con Escape) queda la tira con la pregunta corta y los botones.
 * Siempre abre entero: sólo lo minimiza la persona. Minimizado es de esta decisión (quien lo usa le da una `key` por decisión: las repreguntas de la misma lo actualizan en el lugar y una nueva abre entera).
 * Lleva `data-minimized` minimizado (en el celular, `data-lowered`). Contestado, sale (va dentro de un `Presence`).
 */
export function MatPrompt({ label, head, aside, children, kind, row = false, role = 'status', labelledBy, focus, escape = false, className }: MatPromptProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const leaving = useLeaving()
  const host = useSheetHost()
  // En un marco del catálogo (`SheetHost phone`), como en el celular en cualquier ancho.
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY) && host?.phone !== true
  const [minimized, setFold] = useState(false)
  // Con el mouse o el lápiz, la cabeza lo lleva a otro lado (también el asa): una posición para todas las preguntas.
  const move = useDraggableOffset(matCardPositionKey('prompt'), ref, desktop)
  // Con el dedo, arrastrar la fila de arriba hacia abajo lo minimiza; el cartel sigue al dedo corriendo su `translate`, sin redibujar.
  const swipe = touchOr(useSwipeFold({ dir: 'down', onFold: () => setFold(true), follow: move.nudge }), move.head)

  useEscapeKey(() => setFold(true), desktop && escape && !minimized && !leaving)
  useEffect(() => {
    const target = minimized && desktop ? '[data-prompt-show]' : focus

    if (target) ref.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: true })
  }, [minimized, focus, desktop])

  const attrs = { role, 'aria-labelledby': labelledBy, 'data-prompt': kind, ...(row ? { 'data-prompt-row': '' } : {}) }
  // La cabeza: lo que es y la pregunta (sin fase ni turno: cada dato, una vez). Bajada en el celular no se repite: queda la tira con la pregunta corta.
  const top = (
    <div className="grid min-w-0 flex-1 gap-1">
      <div className="flex min-w-0 items-center gap-3">{head}</div>
    </div>
  )
  const view = desktop ? (
    minimized ? (
      <PromptHandle ref={ref} role={role} aria-label={label} data-prompt={kind} data-minimized="" label={label} onShow={() => setFold(false)} move={move.head} {...move.root} />
    ) : (
      // Entre grupos, 8 px (no 12): en una ventana baja cada píxel es de la carta.
      <div ref={ref} {...attrs} {...move.root} className={cx('grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 rounded-card border border-info bg-card-background p-4 text-body text-foreground shadow-overlay motion-safe:animate-dialog-enter', className)}>
        <div {...swipe} title={t('duel.prompt.move')} className="flex cursor-grab touch-none select-none items-center gap-2 active:cursor-grabbing">
          {top}
          {aside}
        </div>
        {/* Más alto que lo que hay arriba de la fila Extra, el cuerpo se desplaza (la fila de arriba, con minimizar, queda a la vista). Llega hasta el borde del cartel (`-mx-4`, y 4 px arriba y abajo): lo que
            se desplaza no corta el aro del foco ni una fila de botones que no entra en 360 px. La fila de acciones (lo último, si hay algo antes) queda siempre a la vista, abajo, y opaca de borde a borde:
            pegada al borde del relleno (`-bottom-1` con `py-1`, regla 11) y con el ancho entero (`-mx-4 px-4`), así nada de lo que se desplaza asoma debajo ni a los costados. */}
        <div
          data-prompt-body=""
          className="-mx-4 -my-1 grid min-h-0 gap-[inherit] overflow-y-auto overscroll-contain px-4 py-1 [&>:last-child:not(:first-child)]:sticky [&>:last-child:not(:first-child)]:-bottom-1 [&>:last-child:not(:first-child)]:z-10 [&>:last-child:not(:first-child)]:-mx-4 [&>:last-child:not(:first-child)]:bg-card-background [&>:last-child:not(:first-child)]:px-4"
        >
          {children}
        </div>
      </div>
    )
  ) : (
    <BottomSheet
      ref={ref}
      {...attrs}
      label={label}
      yields
      escape={escape && !leaving}
      className="text-body text-foreground"
      head={<div className="px-4 pb-3">{top}</div>}
      footer={<div className="grid gap-3 px-4 pb-3">{children}</div>}
    />
  )

  return usePresence(!leaving, view, () => [ref.current])
}
