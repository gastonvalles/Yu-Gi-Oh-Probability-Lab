import { useEffect, useState } from 'react'

import type { DuelReplay, ReplayView } from '../../app/duel-replay'
import { MAX_SAVED_REPLAYS, saveReplay } from '../../app/duel-replay-share'
import { showToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Modal } from '../ui/Modal'
import { Switch } from '../ui/Switch'
import { FastSwitch, isLongVideo, unsupportedText, useReplayVideo, useVideoSupport, videoStage } from './ReplayVideo'

/** Guarda uno arriba de «Tus duelos» y dice cómo salió (lleno: se fue el más viejo; sin almacenamiento: que baje el video). */
export async function keepReplay(replay: DuelReplay): Promise<boolean> {
  const { saved, dropped } = await saveReplay(replay)
  if (!saved) showToastMessage(t('meta.duels.saveFailed'), 'error')
  else showToastMessage(dropped ? t('meta.duels.full', { max: MAX_SAVED_REPLAYS }) : t('meta.duels.saved'), dropped ? 'warning' : 'success')
  return saved !== null
}

/**
 * «Guardar replay» de un duelo (al terminar y en «Más opciones»): qué se guarda (lo de un espectador; con la casilla, también tu mano y tus cartas boca abajo, apagada al abrir) y
 * guardarlo en «Tus duelos» o bajarlo ya como video (`ReplayVideo.tsx`: se arma acá mismo, con su progreso, y queda listo para guardar o compartir). El replay se arma al tocar
 * (`build`), con el duelo como está en ese momento. Sin velo: la mesa se sigue viendo.
 */
export function SaveReplayDialog({ isOpen, onClose, build, note }: { isOpen: boolean; onClose: () => void; build: (view: ReplayView) => DuelReplay; /** Un límite de lo grabado (el manual con un corte: hasta dónde llega). */ note?: string }) {
  const [mine, setMine] = useState(false)
  const [fast, setFast] = useState(true)
  // El replay de la vista pública al abrir: para saber si el video pasa de 6 minutos (y ofrecer «Rápido (2×)»). Se rearma al tocar, con la vista elegida.
  const [sample, setSample] = useState<DuelReplay | null>(null)
  const supported = useVideoSupport()
  const video = useReplayVideo()
  const view: ReplayView = mine ? 'mine' : 'public'
  const long = sample !== null && isLongVideo({ kind: 'duel', replay: sample })
  const reason = unsupportedText(supported)

  useEffect(() => {
    if (isOpen) setSample(build('public'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez por apertura: `build` cambia con cada jugada
  }, [isOpen])

  // La casilla vuelve a apagarse cada vez que se cierra; cerrar cancela el video.
  const close = () => {
    video.cancel()
    setMine(false)
    setFast(true)
    onClose()
  }
  const makeVideo = () => void video.start({ kind: 'duel', replay: build(view) }, long && fast ? 2 : 1)
  const stage = video.state.stage === 'idle' ? null : videoStage(video.state, { cancel: video.cancel, retry: makeVideo, back: video.cancel })

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="keypad"
      anchor="mat"
      veil={false}
      title={stage?.title ?? t('meta.duels.save.title')}
      footer={
        stage?.footer ?? (
          // Juntos, sin ícono y chicos (en táctil siguen de 44 px): desde la mesa la hoja es 1 rem más angosta que la pantalla y, así, entran en una fila desde 360 px.
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={!supported?.ok} onClick={makeVideo}>
              {t('meta.duels.video.download')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => void keepReplay(build(view)).then((ok) => ok && close())}>
              {t('meta.duels.save.button')}
            </Button>
          </div>
        )
      }
    >
      {stage?.body ?? (
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
          {long && supported?.ok ? <FastSwitch subject={{ kind: 'duel', replay: sample }} fast={fast} onChange={setFast} /> : null}
          {reason ? <p className="m-0 text-micro text-soft">{reason}</p> : null}
        </div>
      )}
    </Modal>
  )
}
