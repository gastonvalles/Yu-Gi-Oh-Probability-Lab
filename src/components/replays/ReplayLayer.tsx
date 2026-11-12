import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import type { DuelReplay } from '../../app/duel-replay'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import { DuelReplayScreen } from './DuelReplayScreen'

/**
 * El replay de un duelo recién jugado, sin guardarlo (Gastón, 2026-11-12: «que hace el bot deberia mostrar el replay»): el visor de replays (`DuelReplayScreen`, los dos lados, la banda
 * de las fases y la carta grande al activar) a pantalla completa, desde la primera jugada; volver (su flecha o Escape) lleva al resultado. Por portal: un `fixed` adentro de la mesa se correría.
 */
export function ReplayLayer({ replay, onClose }: { replay: DuelReplay | null; onClose: () => void }) {
  if (!replay || typeof document === 'undefined') return null

  return createPortal(<Layer replay={replay} onClose={onClose} />, document.body)
}

function Layer({ replay, onClose }: { replay: DuelReplay; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEscapeKey(onClose, true)
  useBodyScrollLock(true)
  useEffect(() => ref.current?.focus(), [])

  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('duel.result.watchReplay')} data-testid="replay-layer" className="fixed inset-0 z-160 bg-background outline-none">
      <DuelReplayScreen replay={replay} onClose={onClose} actions={[]} startAt={0} backLabel={t('duel.result.back')} />
    </div>
  )
}
