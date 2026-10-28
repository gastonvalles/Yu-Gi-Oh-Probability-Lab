import { useState } from 'react'

import { liveThumbnailUrl, parseAgo, type LiveStream, type PastStream } from '../../app/live-streams'
import { REPLAYS, thumbnailUrl, watchUrl } from '../../app/replays'
import type { LiveState } from '../../app/use-live-streams'
import { Presence, useLeaving } from '../../app/use-presence'
import { getLocale, t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { Button } from '../ui/Button'
import { Carousel } from '../ui/Carousel'
import { cx } from '../ui/cx'
import { textLink } from '../ui/typography'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { SectionHeader } from '../ui/SectionHeader'
import { surface } from '../ui/surfaces'
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

/** «hace 2 días» / «2 days ago»: lo que dice YouTube de cuándo fue («Streamed 2 days ago»), en el idioma de quien mira; null si no se entiende. */
function agoText(published: string | null): string | null {
  const ago = parseAgo(published)

  return ago === null ? null : new Intl.RelativeTimeFormat(getLocale(), { numeric: 'always' }).format(-ago.value, ago.unit)
}

/** Lo que se abrió para mirar: una transmisión al aire o una que ya terminó. */
type Opened = { live: true; stream: LiveStream } | { live: false; stream: PastStream }

/** El nombre de un canal, como link a su página de YouTube. */
const channelLink = (key: 'eu' | 'tcg') => (text: string) => (
  <a href={REPLAYS.channels[key].url} target="_blank" rel="noreferrer" className={textLink}>
    {text}
  </a>
)

/**
 * Las transmisiones en vivo de los canales oficiales, arriba de los replays mientras hay alguna al aire, y debajo las últimas que ya terminaron (torneos enteros, día por día: se pueden ver después de que se van del aire).
 * Cada grupo es un bloque en el lienzo: su encabezado y un carrusel de tarjetas con la siguiente asomando (nada de tarjetas dentro de una tarjeta). Cada una se mira acá mismo (el reproductor sin cookies se
 * carga al tocar «reproducir») o en YouTube. Si no se pudo mirar qué hay en vivo, lo dice y deja los links a los canales: una lista vacía por no haber podido
 * mirar no se hace pasar por «no hay nada».
 */
export function LiveStreamsSection({ state }: { state: LiveState }) {
  // La que se abrió queda abierta aunque la lista se actualice y ya no esté (terminó): se cierra cuando quien mira quiere.
  const [opened, setOpened] = useState<Opened | null>(null)
  const streams = state.status === 'ready' ? state.streams : []
  const past = state.status === 'ready' ? state.past : []

  return (
    <>
      {streams.length > 0 ? (
        <div id="replays-live" className="grid gap-3">
          <SectionHeader title={t('meta.live.title')} description={t('meta.live.description', { count: streams.length })} />
          <Carousel label={t('meta.live.title')} bleed>
            {streams.map((stream) => (
              <LiveCard key={stream.id} stream={stream} onOpen={() => setOpened({ live: true, stream })} />
            ))}
          </Carousel>
        </div>
      ) : state.status === 'ready' && !state.ok ? (
        <p className="m-0 text-micro text-soft" role="status">
          {tRich('meta.live.unavailable', { eu: channelLink('eu'), tcg: channelLink('tcg') }, { eu: REPLAYS.channels.eu.name, tcg: REPLAYS.channels.tcg.name })}
        </p>
      ) : null}

      {past.length > 0 ? (
        <div id="replays-recent" className="grid gap-3">
          <SectionHeader title={t('meta.live.past.title')} description={t('meta.live.past.description')} />
          <Carousel label={t('meta.live.past.title')} bleed>
            {past.map((stream) => (
              <PastCard key={stream.id} stream={stream} onOpen={() => setOpened({ live: false, stream })} />
            ))}
          </Carousel>
        </div>
      ) : null}

      {/* La `key` reinicia el reproductor al pasar de una transmisión a otra. Al cerrarse sigue montado mientras sale (`Presence`). */}
      <Presence>{opened ? <LiveDialog key={opened.stream.id} opened={opened} onClose={() => setOpened(null)} /> : null}</Presence>
    </>
  )
}

function LiveCard({ stream, onOpen }: { stream: LiveStream; onOpen: () => void }) {
  const viewers = viewersText(stream.viewers)

  return (
    <article className={cx(surface.card, 'group flex min-w-0 flex-col overflow-hidden transition-colors duration-150 hover:border-info/60 has-focus-visible:border-info/60')}>
      <button type="button" className="relative block aspect-video w-full overflow-hidden bg-input focus-visible:outline-none focus-visible:shadow-focus" aria-label={t('meta.live.watchLabel', { title: stream.title })} onClick={onOpen}>
        <LiveThumbnail id={stream.id} className="size-full object-cover" />
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/15 transition-colors duration-150 group-hover:bg-black/35">
          <span className="grid size-11 place-items-center rounded-full bg-primary text-white">
            <Icon name="play" size={20} variant="bold" />
          </span>
        </span>
        <LiveBadge className="absolute left-1.5 top-1.5" />
        <span className="absolute right-1.5 top-1.5 rounded-full bg-black/75 px-2 py-0.5 text-micro font-semibold text-white" title={REPLAYS.channels[stream.channel].name}>
          {CHANNEL_BADGE[stream.channel]}
        </span>
      </button>

      <div className="grid flex-1 grid-rows-[1fr_auto] gap-3 p-3">
        <strong className="text-body font-semibold text-foreground">{stream.title}</strong>
        {/* El número y la acción en la misma fila, abajo: cuánta gente la mira y el botón para mirarla. */}
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-micro tabular-nums text-muted">{viewers ?? REPLAYS.channels[stream.channel].name}</span>
          <Button variant="outline" size="md" icon="play" onClick={onOpen}>
            {t('meta.live.watch')}
          </Button>
        </div>
      </div>
    </article>
  )
}

/** Una transmisión que ya terminó: la miniatura con cuánto dura, su título y, abajo, cuándo fue y el botón para verla. */
function PastCard({ stream, onOpen }: { stream: PastStream; onOpen: () => void }) {
  const when = agoText(stream.published)

  return (
    <article className={cx(surface.card, 'group flex min-w-0 flex-col overflow-hidden transition-colors duration-150 hover:border-info/60 has-focus-visible:border-info/60')}>
      <button type="button" className="relative block aspect-video w-full overflow-hidden bg-input focus-visible:outline-none focus-visible:shadow-focus" aria-label={t('meta.live.past.watchLabel', { title: stream.title })} onClick={onOpen}>
        <img src={thumbnailUrl(stream.id)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/15 transition-colors duration-150 group-hover:bg-black/35">
          <span className="grid size-11 place-items-center rounded-full bg-primary text-white">
            <Icon name="play" size={20} variant="bold" />
          </span>
        </span>
        <span className="absolute right-1.5 top-1.5 rounded-full bg-black/75 px-2 py-0.5 text-micro font-semibold text-white" title={REPLAYS.channels[stream.channel].name}>
          {CHANNEL_BADGE[stream.channel]}
        </span>
        {stream.duration ? <span className="absolute bottom-1.5 right-1.5 rounded-tag bg-black/80 px-1.5 py-0.5 text-micro font-semibold tabular-nums text-white">{stream.duration}</span> : null}
      </button>

      <div className="grid flex-1 grid-rows-[1fr_auto] gap-3 p-3">
        <strong className="text-body font-semibold text-foreground">{stream.title}</strong>
        {/* Cuándo fue y la acción en la misma fila, abajo. */}
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-micro text-muted">{when ?? REPLAYS.channels[stream.channel].name}</span>
          <Button variant="outline" size="md" icon="play" onClick={onOpen}>
            {t('meta.live.past.watch')}
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

function LiveDialog({ opened, onClose }: { opened: Opened; onClose: () => void }) {
  const { stream } = opened
  const channel = REPLAYS.channels[stream.channel].name
  const viewers = opened.live ? viewersText(opened.stream.viewers) : null
  const detail = opened.live ? (viewers ? `${channel} · ${viewers}` : channel) : [channel, opened.stream.duration, agoText(opened.stream.published)].filter(Boolean).join(' · ')
  const leaving = useLeaving()

  return (
    <Modal
      isOpen={!leaving}
      onClose={onClose}
      size="md"
      icon="play"
      kicker={t(opened.live ? 'meta.live.modal.kicker' : 'meta.live.past.modal.kicker', { channel })}
      title={stream.title}
      footer={
        <a href={watchUrl(stream.id)} target="_blank" rel="noreferrer" className={YOUTUBE_LINK_BUTTON}>
          <Icon name="link" size={16} />
          {t('meta.replays.modal.watchOnYoutube')}
        </a>
      }
    >
      <div className="grid gap-4">
        <VideoPlayer
          videoId={stream.id}
          title={stream.title}
          playLabel={t(opened.live ? 'meta.live.modal.play' : 'meta.live.past.modal.play', { title: stream.title })}
          thumbnail={opened.live ? liveThumbnailUrl(stream.id) : thumbnailUrl(stream.id)}
          badge={opened.live ? <LiveBadge className="absolute left-2 top-2" /> : undefined}
        />
        <p className="m-0 text-micro text-soft">{detail}</p>
      </div>
    </Modal>
  )
}
