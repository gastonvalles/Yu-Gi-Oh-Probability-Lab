import { useEffect, useRef, useState } from 'react'

import type { ResumeSnapshot } from '../../app/auto/online-resume'
import { showToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'
import { Setting, type LaneNotice } from './DuelBar'

/**
 * Seguir en automático un duelo por enlace que va a mano (`online-resume.ts`; diseño: `docs/duelo-automatico-enlace.md`): la fila de «Más opciones» de la mesa manual
 * (`ResumeAutoSetting`: el botón, apagado con el motivo cuando no se puede, y el cartel corto con lo que se reinicia antes de pedir; pedido, «Cancelar pedido») y lo que va
 * en la línea de avisos (`useResumeLane`: el pedido del rival con sus dos botones, la espera del mío, y cómo terminó el mío en un aviso). Es el espejo de «Pasar a manual» de
 * `AutoDuelScreen`.
 */
export interface ResumeAuto {
  snapshot: ResumeSnapshot
  /** `true` pide (o acepta el pedido del rival); `false` lo rechaza o retira el mío. */
  want: (yes: boolean) => void
}

/** Por qué no se puede ahora, dicho para la fila y para el aviso (con el nombre del rival). */
const WHY: Record<NonNullable<ResumeSnapshot['blocked']>, (name: string) => string> = {
  turn: () => t('auto.resumeLink.why.turn'),
  phase: () => t('auto.resumeLink.why.phase'),
  tokens: () => t('auto.resumeLink.why.tokens'),
  control: () => t('auto.resumeLink.why.control'),
  table: () => t('auto.resumeLink.why.table'),
  peer: (name) => t('auto.resumeLink.why.peer', { name }),
  absent: (name) => t('auto.resumeLink.why.absent', { name }),
}
const whyText = (why: NonNullable<ResumeSnapshot['blocked']>, name: string) => WHY[why](name)

export function ResumeAutoSetting({ resume, rivalName }: { resume: ResumeAuto; rivalName: string }) {
  const { state, blocked } = resume.snapshot
  const [confirming, setConfirming] = useState(false)
  const hint = state === 'asking' ? t('auto.resumeLink.asking', { name: rivalName }) : blocked ? whyText(blocked, rivalName) : t('auto.resumeLink.hint', { name: rivalName })

  return (
    <>
      <Setting title={t('auto.resumeLink.title')} hint={hint}>
        {state === 'asking' ? (
          <Button variant="tertiary" className="justify-self-start" onClick={() => resume.want(false)}>
            {t('auto.online.manualCancel')}
          </Button>
        ) : (
          <Button variant="secondary" icon="zap" className="justify-self-start" disabled={blocked !== null || state === 'asked' || state === 'switching'} onClick={() => setConfirming(true)}>
            {t('auto.resumeLink.ask')}
          </Button>
        )}
      </Setting>
      <ConfirmDialog
        veil={false}
        anchor="mat"
        isOpen={confirming}
        title={t('auto.resumeLink.ask')}
        description={t('auto.resumeLink.confirmText', { name: rivalName })}
        confirmLabel={t('auto.resumeLink.confirm')}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          resume.want(true)
        }}
      />
    </>
  )
}

/** La línea de avisos del pase: el pedido del rival (se contesta ahí), la espera del mío (con «Cancelar pedido»); y cómo terminó el mío, en un aviso. */
export function useResumeLane(resume: ResumeAuto | undefined, rivalName: string): LaneNotice | null {
  const state = resume?.snapshot.state ?? 'idle'
  const why = resume?.snapshot.why ?? null
  const shown = useRef(state)

  useEffect(() => {
    if (shown.current === state) return
    shown.current = state
    if (state === 'declined') showToastMessage(t('auto.resumeLink.declined', { name: rivalName }), 'info')
    else if (state === 'expired') showToastMessage(t('auto.resumeLink.expired', { name: rivalName }), 'info')
    else if (state === 'refused') showToastMessage(t('auto.resumeLink.refused', { why: why ? whyText(why, rivalName) : '' }), 'warning')
  }, [state, why, rivalName])

  if (!resume) return null
  if (state === 'asked') return { kind: 'ask', text: t('auto.resumeLink.asked', { name: rivalName }), actions: [{ label: t('auto.resumeLink.deny'), onSelect: () => resume.want(false) }, { label: t('auto.resumeLink.accept'), onSelect: () => resume.want(true), primary: true }] }
  if (state === 'asking' || state === 'switching') return { kind: 'thinking', text: t('auto.resumeLink.asking', { name: rivalName }), ...(state === 'asking' ? { onCancel: () => resume.want(false), cancelLabel: t('auto.online.manualCancel') } : {}) }

  return null
}
