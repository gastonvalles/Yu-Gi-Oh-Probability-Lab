import type { MetaDeck } from '../../app/meta'
import { REPLAYS, replayLabel, thumbnailUrl, watchUrl, type ReplayEntry } from '../../app/replays'
import { t } from '../../i18n'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { VideoPlayer, YOUTUBE_LINK_BUTTON } from './VideoPlayer'

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
        <a href={watchUrl(video.id)} target="_blank" rel="noreferrer" className={YOUTUBE_LINK_BUTTON}>
          <Icon name="link" size={16} />
          {t('meta.replays.modal.watchOnYoutube')}
        </a>
      }
    >
      <div className="grid gap-4">
        <VideoPlayer
          videoId={video.id}
          title={video.title}
          playLabel={t('meta.replays.modal.play', { label })}
          thumbnail={thumbnailUrl(video.id)}
          badge={<span className="absolute bottom-2 right-2 rounded-tag bg-black/80 px-1.5 py-0.5 text-micro font-semibold tabular-nums text-white">{video.duration}</span>}
        />

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
                  <Button variant="secondary" icon="layers" aria-label={t('meta.replays.viewDeckLabel', { deck: player.deck.name })} onClick={() => onOpenDeck(player.deck!)}>
                    {t('meta.replays.viewDeck')}
                  </Button>
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
