import { useState } from 'react'

import type { DuelReplay, ReplayView } from '../../app/duel-replay'
import { downloadReplayFile, MAX_SAVED_REPLAYS, saveReplay } from '../../app/duel-replay-share'
import { showToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Modal } from '../ui/Modal'
import { Switch } from '../ui/Switch'
import { titleOf } from './duel-replay-text'

/** Guarda uno arriba de «Tus duelos» y dice cómo salió (lleno: se fue el más viejo; sin almacenamiento: que lo baje). */
export async function keepReplay(replay: DuelReplay): Promise<boolean> {
  const { saved, dropped } = await saveReplay(replay)
  if (!saved) showToastMessage(t('meta.duels.saveFailed'), 'error', { action: { label: t('meta.duels.download'), onAction: () => downloadReplayFile(replay, titleOf(replay)) } })
  else showToastMessage(dropped ? t('meta.duels.full', { max: MAX_SAVED_REPLAYS }) : t('meta.duels.saved'), dropped ? 'warning' : 'success')
  return saved !== null
}

/**
 * «Guardar replay» de un duelo (al terminar y en «Más opciones»): qué se guarda (lo de un espectador; con la casilla, también tu mano y tus cartas boca abajo, apagada al abrir) y
 * guardarlo en «Tus duelos» o bajar el archivo ya. El replay se arma al tocar (`build`), con el duelo como está en ese momento. Sin velo: la mesa se sigue viendo.
 */
export function SaveReplayDialog({ isOpen, onClose, build, note }: { isOpen: boolean; onClose: () => void; build: (view: ReplayView) => DuelReplay; /** Un límite de lo grabado (el manual con un corte: hasta dónde llega). */ note?: string }) {
  const [mine, setMine] = useState(false)
  const view: ReplayView = mine ? 'mine' : 'public'
  // La casilla vuelve a apagarse cada vez que se cierra.
  const close = () => {
    setMine(false)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="keypad"
      anchor="mat"
      veil={false}
      title={t('meta.duels.save.title')}
      footer={
        <>
          <Button
            variant="secondary"
            icon="download"
            onClick={() => {
              const replay = build(view)
              downloadReplayFile(replay, titleOf(replay))
            }}
          >
            {t('meta.duels.download')}
          </Button>
          <Button variant="primary" icon="save" onClick={() => void keepReplay(build(view)).then((ok) => ok && close())}>
            {t('meta.duels.save.button')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-body text-muted">{t('meta.duels.save.hint')}</p>
        {note ? <Callout tone="warning">{note}</Callout> : null}
        <div className="flex items-center justify-between gap-3">
          <span className="grid min-w-0 gap-0.5">
            <span className="text-body font-semibold text-foreground">{t('meta.duels.save.mine')}</span>
            <span className="text-micro text-soft">{t('meta.duels.save.mineHint')}</span>
          </span>
          <Switch checked={mine} onChange={setMine} label={t('meta.duels.save.mine')} />
        </div>
      </div>
    </Modal>
  )
}
