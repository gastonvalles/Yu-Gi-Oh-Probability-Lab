import { useState } from 'react'

import { buildMetaDeckHash } from '../../app/meta-handtraps'
import { REPLAYS, embedUrl, thumbnailUrl, watchUrl, type ReplayEntry } from '../../app/replays'
import { Badge } from '../ui/Badge'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'

const LINK_BUTTON =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-control bg-lavender px-4 py-1.5 text-body font-semibold leading-tight text-foreground transition-colors duration-150 hover:bg-lavender-hover focus-visible:outline-none focus-visible:shadow-focus pointer-coarse:min-h-10'

interface ReplayModalProps {
  entry: ReplayEntry | null
  onClose: () => void
}

/**
 * Un replay sin salir de la app. El reproductor de YouTube (sin cookies) se carga recién al tocar "Reproducir": hasta
 * entonces sólo se ve la miniatura, así que abrir la ventana no le avisa nada a YouTube. Si el video no se puede incrustar,
 * queda el link para verlo en YouTube.
 */
export function ReplayModal({ entry, onClose }: ReplayModalProps) {
  // La `key` reinicia el reproductor al pasar de un replay a otro.
  return entry ? <ReplayDialog key={entry.video.id} entry={entry} onClose={onClose} /> : null
}

function ReplayDialog({ entry, onClose }: { entry: ReplayEntry; onClose: () => void }) {
  const [playing, setPlaying] = useState(false)
  const { video, event, stage, players } = entry
  const label = `${players[0].name} vs. ${players[1].name}`
  const kicker = [event, stage?.label].filter(Boolean).join(' · ')

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      icon="play"
      kicker={kicker || undefined}
      title={label}
      footer={
        <a href={watchUrl(video.id)} target="_blank" rel="noreferrer" className={LINK_BUTTON}>
          <Icon name="link" size={16} />
          Ver en YouTube
        </a>
      }
    >
      <div className="grid gap-4">
        <div className="relative aspect-video w-full overflow-hidden rounded-card bg-black">
          {playing ? (
            <iframe
              src={embedUrl(video.id)}
              title={video.title}
              className="absolute inset-0 size-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button
              type="button"
              className="group absolute inset-0 block size-full focus-visible:outline-none focus-visible:shadow-focus"
              aria-label={`Reproducir ${label}`}
              onClick={() => setPlaying(true)}
            >
              <img src={thumbnailUrl(video.id)} alt="" decoding="async" className="size-full object-cover" />
              <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/25 transition-colors duration-150 group-hover:bg-black/40">
                <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-brand">
                  <Icon name="play" size={28} variant="bold" />
                </span>
              </span>
              <span className="absolute bottom-2 right-2 rounded-tag bg-black/80 px-1.5 py-0.5 text-micro font-semibold tabular-nums text-white">{video.duration}</span>
            </button>
          )}
        </div>

        <ul className="m-0 grid list-none gap-2 p-0" aria-label="Los decks de los jugadores">
          {players.map((player, index) => (
            <li key={index} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-body">
              <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-foreground">
                <Icon name="user" size={15} className="text-soft" />
                {player.name}
              </span>
              {player.deck ? (
                <>
                  <a href={buildMetaDeckHash(player.deck.id)} className="min-w-0 truncate font-semibold text-primary-soft underline-offset-2 hover:underline" title={`Abrir ${player.deck.name} en la pestaña Meta`}>
                    {player.deck.name}
                  </a>
                  {player.deck.placement ? (
                    <Badge tone="info" size="sm" icon="trophy">
                      {player.deck.placement}
                    </Badge>
                  ) : null}
                </>
              ) : (
                <span className="text-muted">Su deck no está entre los del Meta.</span>
              )}
            </li>
          ))}
        </ul>

        <p className="m-0 text-micro text-soft">
          {REPLAYS.channels[video.channel].name} · {video.duration}
        </p>
      </div>
    </Modal>
  )
}
