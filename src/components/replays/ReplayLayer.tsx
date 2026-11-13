import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type { DuelReplay } from '../../app/duel-replay'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import { DuelReplayScreen } from './DuelReplayScreen'

/**
 * El replay de un duelo recién jugado, sin guardarlo (Gastón, 2026-11-12: «que hace el bot deberia mostrar el replay»): el visor de replays (`DuelReplayScreen`, los dos lados, la banda
 * de las fases y la carta grande al activar) a pantalla completa, desde la primera jugada; volver (su flecha o Escape) lleva al resultado.
 */
export function ReplayLayer({ replay, onClose }: { replay: DuelReplay | null; onClose: () => void }) {
  return replay ? (
    <ReplayOverlay label={t('duel.result.watchReplay')} onClose={onClose}>
      <DuelReplayScreen replay={replay} onClose={onClose} actions={[]} startAt={0} backLabel={t('duel.result.back')} />
    </ReplayOverlay>
  ) : null
}

/**
 * Toda la pantalla para el visor de un replay de duelo, como la mesa del duelo (sin la barra ni el menú de la app): el del final del duelo y los guardados (Replays) van en la misma. Escape
 * cierra; el fondo no scrollea. Por portal: un `fixed` adentro de la mesa se correría.
 */
export function ReplayOverlay({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <Layer label={label} onClose={onClose}>
      {children}
    </Layer>,
    document.body,
  )
}

/** Encima de la capa (`z-160`): los hijos del `body` con `data-fx`. */
const FX_ABOVE = ['*:data-fx:z-170!']

function Layer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEscapeKey(onClose, true)
  useBodyScrollLock(true)
  useEffect(() => ref.current?.focus(), [])
  // Los efectos de la mesa que se dibujan en el `body` (el impacto de `field-impact.ts`, la espada de `AttackFx`) van encima de esta capa mientras está abierta: si no, quedaban detrás.
  useEffect(() => {
    document.body.classList.add(...FX_ABOVE)
    return () => document.body.classList.remove(...FX_ABOVE)
  }, [])

  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} data-testid="replay-layer" className="fixed inset-0 z-160 bg-background outline-none">
      {children}
    </div>
  )
}
