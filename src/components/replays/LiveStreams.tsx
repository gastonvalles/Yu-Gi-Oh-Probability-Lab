import { useState } from 'react'

import { liveThumbnailUrl, type LiveStream } from '../../app/live-streams'
import { REPLAYS, thumbnailUrl, watchUrl } from '../../app/replays'
import type { LiveState } from '../../app/use-live-streams'
import { getLocale, t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { textLink } from '../ui/typography'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { SectionHeader } from '../ui/SectionHeader'
import { VideoPlayer, YOUTUBE_LINK_BUTTON } from './VideoPlayer'

const CHANNEL_BADGE = { eu: 'EU', tcg: 'TCG' } as const

/** «6,7 mil viendo» / «6.7K watching»: la cantidad en corto, como la dice YouTube. */
function viewersText(viewers: number | null): string | null {
  return viewers === null ? null : t('meta.live.viewers', { count: new Intl.NumberFormat(getLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(viewers) })
}

/** El punto verde y «En vivo»: lo que está al aire ahora (el verde es «está andando»; el punto late salvo con «reducir movimiento»). */
function LiveBadge({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full bg-black/80 px-2 py-0.5 text-micro font-semibold text-white', className)}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-success motion-safe:animate-pulse" />
      {t('meta.live.badge')}
    </span>
  )
}

/** El nombre de un canal, como link a su página de YouTube. */
const channelLink = (key: 'eu' | 'tcg') => (text: string) => (
  <a href={REPLAYS.channels[key].url} target="_blank" rel="noreferrer" className={textLink}>
    {text}
  </a>
)

/**
 * Las transmisiones en vivo de los canales oficiales, arriba de los replays mientras hay alguna al aire. Cada una se mira acá mismo (el reproductor sin cookies se
 * carga al tocar «reproducir») o en YouTube. Si no se pudo mirar qué hay en vivo, lo dice y deja los links a los canales: una lista vacía por no haber podido
 * mirar no se hace pasar por «no hay nada».
 */
export function LiveStreamsSection({ state }: { state: LiveState }) {
  // La que se abrió queda abierta aunque la lista se actualice y ya no esté (terminó): se cierra cuando quien mira quiere.
  const [opened, setOpened] = useState<LiveStream | null>(null)
  const streams = state.status === 'ready' ? state.streams : []

  return (
    <>
      {streams.length > 0 ? (
        <Card id="replays-live" aria-label={t('meta.live.title')}>
          <SectionHeader icon="play" title={t('meta.live.title')} description={t('meta.live.description', { count: streams.length })} />
          <ul className="m-0 mt-3 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {streams.map((stream) => (
              <li key={stream.id} className="min-w-0">
                <LiveCard stream={stream} onOpen={() => setOpened(stream)} />
              </li>
            ))}
          </ul>
        </Card>
      ) : state.status === 'ready' && !state.ok ? (
        <p className="m-0 text-micro text-soft" role="status">
          {tRich('meta.live.unavailable', { eu: channelLink('eu'), tcg: channelLink('tcg') }, { eu: REPLAYS.channels.eu.name, tcg: REPLAYS.channels.tcg.name })}
        </p>
      ) : null}

      {/* La `key` reinicia el reproductor al pasar de una transmisión a otra. */}
      {opened ? <LiveDialog key={opened.id} stream={opened} onClose={() => setOpened(null)} /> : null}
    </>
  )
}

function LiveCard({ stream, onOpen }: { stream: LiveStream; onOpen: () => void }) {
  const viewers = viewersText(stream.viewers)

  return (
    <article className="group grid h-full min-w-0 content-start overflow-hidden rounded-card border border-border-subtle bg-card-background transition-colors duration-150 hover:border-primary/60">
      <button type="button" className="relative block aspect-video w-full overflow-hidden bg-input focus-visible:outline-none focus-visible:shadow-focus" aria-label={t('meta.live.watchLabel', { title: stream.title })} onClick={onOpen}>
        <LiveThumbnail id={stream.id} className="size-full object-cover" />
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/15 transition-colors duration-150 group-hover:bg-black/35">
          <span className="grid size-11 place-items-center rounded-full bg-primary/90 text-primary-foreground">
            <Icon name="play" size={20} variant="bold" />
          </span>
        </span>
        <LiveBadge className="absolute left-1.5 top-1.5" />
        <span className="absolute right-1.5 top-1.5 rounded-full bg-black/75 px-2 py-0.5 text-micro font-semibold text-white" title={REPLAYS.channels[stream.channel].name}>
          {CHANNEL_BADGE[stream.channel]}
        </span>
      </button>

      <div className="grid content-start gap-3 p-3">
        <button type="button" className="rounded-tag text-left focus-visible:outline-none focus-visible:shadow-focus" onClick={onOpen}>
          <strong className="text-body font-semibold text-foreground">{stream.title}</strong>
        </button>
        {/* El número y la acción en la misma fila, abajo: cuánta gente la mira y el botón para mirarla. */}
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-micro tabular-nums text-muted">{viewers ?? REPLAYS.channels[stream.channel].name}</span>
          <Button variant="primary" size="md" icon="play" onClick={onOpen}>
            {t('meta.live.watch')}
          </Button>
        </div>
      </div>
    </article>
  )
}

/** La miniatura de lo que está al aire (se renueva sola); si YouTube no la tiene, la común. */
function LiveThumbnail({ id, className }: { id: string; className?: string }) {
  return (
    <img
      src={liveThumbnailUrl(id)}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      onError={(event) => {
        const fallback = thumbnailUrl(id)

        if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback
      }}
    />
  )
}

function LiveDialog({ stream, onClose }: { stream: LiveStream; onClose: () => void }) {
  const channel = REPLAYS.channels[stream.channel].name
  const viewers = viewersText(stream.viewers)

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      icon="play"
      kicker={t('meta.live.modal.kicker', { channel })}
      title={stream.title}
      footer={
        <a href={watchUrl(stream.id)} target="_blank" rel="noreferrer" className={YOUTUBE_LINK_BUTTON}>
          <Icon name="link" size={16} />
          {t('meta.replays.modal.watchOnYoutube')}
        </a>
      }
    >
      <div className="grid gap-4">
        <VideoPlayer videoId={stream.id} title={stream.title} playLabel={t('meta.live.modal.play', { title: stream.title })} thumbnail={liveThumbnailUrl(stream.id)} badge={<LiveBadge className="absolute left-2 top-2" />} />
        <p className="m-0 text-micro text-soft">{viewers ? `${channel} · ${viewers}` : channel}</p>
      </div>
    </Modal>
  )
}
