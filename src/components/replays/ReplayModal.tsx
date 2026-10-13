import { useState } from 'react'

import type { MetaDeck } from '../../app/meta'
import { REPLAYS, embedUrl, replayLabel, thumbnailUrl, watchUrl, type ReplayEntry } from '../../app/replays'
import { t } from '../../i18n'
import { Badge } from '../ui/Badge'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { choiceChip } from '../ui/surfaces'

const LINK_BUTTON =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-control bg-lavender px-4 py-1.5 text-body font-semibold leading-tight text-foreground transition-colors duration-150 hover:bg-lavender-hover focus-visible:outline-none focus-visible:shadow-focus pointer-coarse:min-h-10'

interface ReplayModalProps {
  entry: ReplayEntry | null
  onClose: () => void
  /** El detalle del deck de un jugador (si su deck está entre los de torneo): quien muestra el replay decide cómo se abre. */
  onOpenDeck: (deck: MetaDeck) => void
}

/**
 * Un replay sin salir de la app. El reproductor de YouTube (sin cookies) se carga recién al tocar "Reproducir": hasta
 * entonces sólo se ve la miniatura, así que abrir la ventana no le avisa nada a YouTube. Si el video no se puede incrustar,
 * queda el link para verlo en YouTube.
 */
export function ReplayModal({ entry, onClose, onOpenDeck }: ReplayModalProps) {
  // La `key` reinicia el reproductor al pasar de un replay a otro.
  return entry ? <ReplayDialog key={entry.video.id} entry={entry} onClose={onClose} onOpenDeck={onOpenDeck} /> : null
}

function ReplayDialog({ entry, onClose, onOpenDeck }: { entry: ReplayEntry; onClose: () => void; onOpenDeck: (deck: MetaDeck) => void }) {
  const [playing, setPlaying] = useState(false)
  const { video, event, stage, players } = entry
  const label = replayLabel(entry)
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
          {t('meta.replays.modal.watchOnYoutube')}
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
              aria-label={t('meta.replays.modal.play', { label })}
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

        <ul className="m-0 grid list-none gap-2 p-0" aria-label={t('meta.replays.modal.decksLabel')}>
          {players.map((player, index) => (
            <li key={index} className="flex min-w-0 items-center gap-x-3 text-body">
              <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-foreground">
                <Icon name="user" size={15} className="text-soft" />
                {player.name}
              </span>
              {player.deck ? (
                <>
                  {/* Lo que se achica es el nombre del deck (con puntos suspensivos): el puesto y el botón no bajan de renglón. */}
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground" title={player.deck.name}>
                    {player.deck.name}
                  </span>
                  {player.deck.placement ? (
                    <Badge tone="info" size="sm" icon="trophy">
                      {player.deck.placement}
                    </Badge>
                  ) : null}
                  <button
                    type="button"
                    className={cx(choiceChip, 'h-7 shrink-0 gap-1 px-2.5 text-micro')}
                    aria-label={t('meta.replays.viewDeckLabel', { deck: player.deck.name })}
                    onClick={() => onOpenDeck(player.deck!)}
                  >
                    <Icon name="layers" size={13} />
                    {t('meta.replays.viewDeck')}
                  </button>
                </>
              ) : (
                <span className="text-muted">{t('meta.replays.modal.noDeck')}</span>
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
