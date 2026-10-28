import { useState } from 'react'

import type { ManualPlay } from '../../app/auto/manual-handover'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'

interface ManualDialogProps {
  isOpen: boolean
  /** Tus jugadas, de la última hacia atrás (`manualHandover`): «Volver atrás» ofrece «Nada» y una opción por cada una, con su primer paso. */
  plays: readonly ManualPlay[]
  /** El núcleo está rearmando la mesa (deshacer, reiniciar): hasta que termina no se pasa. */
  busy: boolean
  /** El rival jugaba con handtraps: su mano pasa (si no, no pasa nada del rival). */
  rivalHand: boolean
  onClose: () => void
  /** Pasar a la mesa manual volviendo `back` jugadas (0: desde acá). */
  onConfirm: (back: number) => void
}

/**
 * «Seguir en modo manual» del duelo automático: la partida sigue en la mesa manual (con todas sus opciones) y, si el automático se equivocó o no ofreció la jugada que querías,
 * se vuelve atrás unas jugadas para rehacerlas a mano. Sin velo y minimizable para mirar la mesa, como las otras hojas del automático; «Nada» por defecto (cada
 * vez que se abre: `key`).
 */
export function ManualDialog({ isOpen, plays, busy, rivalHand, onClose, onConfirm }: ManualDialogProps) {
  const [back, setBack] = useState('0')
  const options = [
    { value: '0', label: t('auto.manual.none') },
    ...plays.map((play, index) => {
      const label = t('auto.manual.plays', { count: index + 1 })

      return { value: String(index + 1), label, detail: play.label, ariaLabel: `${label}: ${play.label}` }
    }),
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="keypad"
      veil={false}
      lowerable
      anchor="mat"
      title={t('auto.bar.manual')}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon="hand" disabled={busy} onClick={() => onConfirm(Number(back))}>
            {t('auto.manual.confirm')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-body text-muted">{t('auto.manual.text')}</p>
        <div className="grid gap-2">
          <span className="text-body font-semibold text-foreground">{t('auto.manual.back')}</span>
          <Segmented variant="list" fullWidth label={t('auto.manual.back')} value={back} onChange={setBack} options={options} />
        </div>
        <p className="m-0 text-micro text-soft" aria-live="polite">
          {busy ? t('auto.manual.busy') : rivalHand ? t('auto.manual.rivalHand') : t('auto.manual.rivalNone')}
        </p>
      </div>
    </Modal>
  )
}
