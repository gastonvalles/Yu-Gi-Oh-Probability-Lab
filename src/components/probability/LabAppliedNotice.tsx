import { useEffect, useEffectEvent, useRef } from 'react'
import { createPortal } from 'react-dom'

import { usePresence } from '../../app/use-presence'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'

/** Cuánto queda a la vista «Aplicaste el cambio · Deshacer» si no se hace otra cosa. */
export const APPLIED_NOTICE_MS = 10_000

interface LabAppliedNoticeProps {
  open: boolean
  onUndo: () => void
  /** Se va solo a los 10 s, o al tocar cualquier otra cosa de la pantalla. */
  onClose: () => void
}

/**
 * El aviso de «Aplicar al deck»: «Aplicaste el cambio» con «Deshacer», abajo y centrado (en el celular, sobre la barra del armazón, donde estaba la barra del
 * cambio). Es del Lab mientras el aviso de la app (`AppToast`) no lleva acciones. La región `role="status"` está siempre: el lector anuncia el aviso cuando entra.
 * Entra como una hoja y sale al revés (`usePresence`); si el foco se perdió al irse el botón que lo aplicó, pasa a «Deshacer».
 */
export function LabAppliedNotice({ open, onUndo, onClose }: LabAppliedNoticeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useEffectEvent(onClose)
  const shown = usePresence(open, <LabAppliedCallout onUndo={onUndo} />, () => [ref.current])

  useEffect(() => {
    if (!open) {
      return
    }

    const timer = window.setTimeout(close, APPLIED_NOTICE_MS)
    // En captura: el clic que aplicó el cambio ya pasó por acá antes de que el aviso existiera, así que no lo cierra.
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node && ref.current?.contains(event.target))) close()
    }

    document.addEventListener('click', onClick, true)

    if (document.activeElement === null || document.activeElement === document.body) {
      ref.current?.querySelector('button')?.focus()
    }

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('click', onClick, true)
    }
  }, [open])

  return createPortal(
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+0.75rem)] z-30 flex justify-center px-gutter min-[1101px]:bottom-4">
      {shown ? (
        <div ref={ref} className="pointer-events-auto w-full max-w-md animate-sheet-in rounded-control bg-background shadow-overlay motion-reduce:animate-none">
          {shown}
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

/** El aviso por dentro (también la muestra del `/playground`): hecho, en verde, con «Deshacer» sin caja. */
export function LabAppliedCallout({ onUndo }: { onUndo: () => void }) {
  return (
    <Callout
      tone="success"
      title={t('lab.change.applied')}
      action={
        <Button variant="tertiary" size="sm" onClick={onUndo}>
          {t('lab.change.undo')}
        </Button>
      }
    />
  )
}
