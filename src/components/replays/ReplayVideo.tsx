import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { numberLocale, t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Modal } from '../ui/Modal'
import { ProgressRing } from '../ui/ProgressRing'
import { Switch } from '../ui/Switch'
import { videoSupport, type VideoSupport } from './video/video-support'
import { LONG_VIDEO_MS, videoDurationMs, videoFileName, type VideoSpeed, type VideoSubject } from './video/video-timeline'

/**
 * «Descargar video» de un replay: se arma en el navegador (`video/video-encode.ts`, que se carga recién acá con `import()`), con su progreso y «Cancelar», y al terminar queda
 * «Video listo» con «Guardar video» y, si el sistema puede, «Compartir video». Ese paso de más es a propósito: compartir un archivo necesita un toque reciente y armar el
 * video tarda unos segundos. Cerrar el diálogo cancela. Lo usan «Guardar replay» (adentro de su mismo diálogo), el ⋯ de «Tus duelos» y el del replay abierto, y los combos de la
 * práctica (su ⋯ y la barra del combo compartido): el video es de un `VideoSubject`, un duelo o un combo.
 */

/** Si este navegador puede armar el video (null mientras se fija). */
export function useVideoSupport(): VideoSupport | null {
  const [value, setValue] = useState<VideoSupport | null>(null)
  useEffect(() => {
    let live = true
    void videoSupport().then((result) => live && setValue(result))
    return () => {
      live = false
    }
  }, [])
  return value
}

export type VideoState = { stage: 'idle' } | { stage: 'working'; progress: number } | { stage: 'ready'; file: File; durationMs: number } | { stage: 'failed' }

/** Armar el video de un duelo o un combo: el estado, empezar y cancelar (también al desmontar). */
export function useReplayVideo() {
  const [state, setState] = useState<VideoState>({ stage: 'idle' })
  const job = useRef<AbortController | null>(null)
  const cancel = useCallback(() => {
    job.current?.abort()
    job.current = null
    setState({ stage: 'idle' })
  }, [])
  const start = useCallback(async (subject: VideoSubject, speed: VideoSpeed) => {
    job.current?.abort()
    const controller = new AbortController()
    job.current = controller
    setState({ stage: 'working', progress: 0 })
    try {
      const { makeReplayVideo } = await import('./video/video-encode')
      const result = await makeReplayVideo(subject, { speed, signal: controller.signal, onProgress: (progress) => !controller.signal.aborted && setState({ stage: 'working', progress }) })
      if (controller.signal.aborted) return
      setState({ stage: 'ready', file: new File([result.blob], videoFileName(subject), { type: 'video/mp4' }), durationMs: result.durationMs })
    } catch {
      if (!controller.signal.aborted) setState({ stage: 'failed' })
    } finally {
      if (job.current === controller) job.current = null
    }
  }, [])
  useEffect(() => () => job.current?.abort(), [])
  return { state, start, cancel }
}

/** «6:54». */
const clock = (ms: number) => {
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
const megabytes = (bytes: number) => `${(bytes / 1048576).toLocaleString(numberLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`

/** Las tiendas de los navegadores leen el archivo después del clic: la dirección se suelta más tarde. */
function saveFile(file: File) {
  const url = URL.createObjectURL(file)
  const anchor = Object.assign(document.createElement('a'), { href: url, download: file.name })
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

const canShare = (file: File) => typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

/** El motivo de no poder, en una línea; null si se puede (o todavía no se sabe). */
export const unsupportedText = (value: VideoSupport | null) => (value && !value.ok ? t(`meta.duels.video.unsupported.${value.reason}`) : null)

/** «Rápido (2×)», sólo si el video pasa de 6 minutos. */
export function FastSwitch({ subject, fast, onChange }: { subject: VideoSubject; fast: boolean; onChange: (fast: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-body font-semibold text-foreground">{t('meta.duels.video.fast')}</span>
        <span className="text-micro text-soft">{t('meta.duels.video.fastHint', { normal: clock(videoDurationMs(subject, 1)), fast: clock(videoDurationMs(subject, 2)) })}</span>
      </span>
      <Switch checked={fast} onChange={onChange} label={t('meta.duels.video.fast')} />
    </div>
  )
}

export const isLongVideo = (subject: VideoSubject) => videoDurationMs(subject, 1) > LONG_VIDEO_MS

/**
 * Lo que muestra el diálogo mientras se arma, cuando está listo o si falló (el título, el cuerpo y el pie); `retry` lo arma de nuevo y `back` (en «Guardar replay») vuelve a sus
 * opciones, para guardarlo también.
 */
export function videoStage(state: Exclude<VideoState, { stage: 'idle' }>, actions: { cancel: () => void; retry: () => void; back?: () => void }): { title: string; body: ReactNode; footer: ReactNode } {
  const back = actions.back ? (
    <Button variant="tertiary" onClick={actions.back}>
      {t('meta.duels.video.back')}
    </Button>
  ) : null
  if (state.stage === 'working') {
    const percent = Math.round(state.progress * 100)
    return {
      title: t('meta.duels.video.working'),
      body: (
        <div className="grid justify-items-center gap-4 text-center" aria-busy="true">
          <ProgressRing value={state.progress} size={88} label={t('meta.duels.video.progress', { percent })}>
            <span className="text-lead font-bold tabular-nums text-foreground">{percent}%</span>
          </ProgressRing>
          <p className="m-0 text-body text-muted">{t('meta.duels.video.stay')}</p>
        </div>
      ),
      footer: (
        <Button variant="tertiary" onClick={actions.cancel}>
          {t('common.cancel')}
        </Button>
      ),
    }
  }
  if (state.stage === 'failed') {
    return {
      title: t('meta.duels.video.title'),
      body: <Callout tone="danger">{t('meta.duels.video.failed')}</Callout>,
      footer: (
        <>
          {back}
          <Button variant="primary" icon="refresh" onClick={actions.retry}>
            {t('meta.duels.video.retry')}
          </Button>
        </>
      ),
    }
  }
  const { file } = state
  return {
    title: t('meta.duels.video.ready', { size: megabytes(file.size) }),
    body: (
      <Callout tone="success">{t('meta.duels.video.readyHint', { duration: clock(state.durationMs) })}</Callout>
    ),
    footer: (
      <>
        {back}
        {canShare(file) ? (
          <Button variant="secondary" icon="send" onClick={() => void navigator.share({ files: [file], title: file.name }).catch(() => undefined)}>
            {t('meta.duels.video.share')}
          </Button>
        ) : null}
        <Button variant="primary" icon="download" onClick={() => saveFile(file)}>
          {t('meta.duels.video.save')}
        </Button>
      </>
    ),
  }
}

/**
 * El video de un replay ya guardado (el ⋯ de «Tus duelos» y el del replay abierto) o de un combo (su ⋯ y la barra del compartido). Uno corto se empieza a armar al abrir; uno de más de 6 minutos primero ofrece
 * «Rápido (2×)» (prendido: es para lo que se ofrece) y «Armar video». Sin soporte, el motivo.
 */
export function ReplayVideoDialog({ subject, onClose }: { subject: VideoSubject | null; onClose: () => void }) {
  const { state, start, cancel } = useReplayVideo()
  const supported = useVideoSupport()
  const [fast, setFast] = useState(true)
  const long = subject ? isLongVideo(subject) : false
  const speed: VideoSpeed = long && fast ? 2 : 1
  const reason = unsupportedText(supported)

  // Quien abre el diálogo arma `{ kind, combo }` en cada dibujo suyo: lo que se filma es lo de adentro. Con el objeto de afuera, cada dibujo de la mesa cancelaba el video
  // y lo empezaba de nuevo.
  const filmed = subject ? (subject.kind === 'duel' ? subject.replay : subject.combo) : null
  useEffect(() => {
    if (subject && supported?.ok && !isLongVideo(subject)) void start(subject, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmed, supported, start])

  const close = () => {
    cancel()
    setFast(true)
    onClose()
  }
  const stage = state.stage === 'idle' ? null : videoStage(state, { cancel: close, retry: () => subject && void start(subject, speed) })

  return (
    <Modal
      isOpen={subject !== null}
      onClose={close}
      size="keypad"
      title={stage?.title ?? t('meta.duels.video.title')}
      footer={
        stage?.footer ??
        (long && supported?.ok ? (
          <Button variant="primary" icon="play" onClick={() => subject && void start(subject, speed)}>
            {t('meta.duels.video.make')}
          </Button>
        ) : undefined)
      }
    >
      {stage?.body ?? (reason ? <Callout tone="warning">{reason}</Callout> : subject && long && supported?.ok ? <FastSwitch subject={subject} fast={fast} onChange={setFast} /> : <div className="min-h-24" aria-busy="true" />)}
    </Modal>
  )
}
