import { useState, type ReactNode } from 'react'

import { embedUrl } from '../../app/replays'
import { Icon } from '../ui/Icon'

/** El botón-link «Ver en YouTube» del pie de las ventanas de video. */
export const YOUTUBE_LINK_BUTTON =
  'inline-flex min-h-9 pointer-coarse:min-h-11 items-center justify-center gap-2 rounded-control bg-lavender px-4 py-1.5 text-body font-semibold leading-tight text-foreground transition-colors duration-150 hover:bg-lavender-hover focus-visible:outline-none focus-visible:shadow-focus pointer-coarse:min-h-10'

interface VideoPlayerProps {
  videoId: string
  title: string
  /** Lo que lee un lector de pantalla en el botón de reproducir («Reproducir {label}»). */
  playLabel: string
  /** La miniatura que se ve hasta tocar «reproducir». */
  thumbnail: string
  /** Lo que va abajo a la derecha de la miniatura (la duración; «en vivo»). */
  badge?: ReactNode
}

/**
 * El reproductor de YouTube (sin cookies) de un video, en 16:9. Se carga recién al tocar «reproducir»: hasta entonces sólo se ve la miniatura,
 * así que abrir la ventana no le avisa nada a YouTube.
 */
export function VideoPlayer({ videoId, title, playLabel, thumbnail, badge }: VideoPlayerProps) {
  const [playing, setPlaying] = useState(false)

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card bg-black">
      {playing ? (
        <iframe
          src={embedUrl(videoId)}
          title={title}
          className="absolute inset-0 size-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" className="group absolute inset-0 block size-full focus-visible:outline-none focus-visible:shadow-focus" aria-label={playLabel} onClick={() => setPlaying(true)}>
          <img src={thumbnail} alt="" decoding="async" className="size-full object-cover" />
          <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/25 transition-colors duration-150 group-hover:bg-black/40">
            <span className="grid size-16 place-items-center rounded-full bg-warning-solid text-white">
              <Icon name="play" size={28} variant="bold" />
            </span>
          </span>
          {badge}
        </button>
      )}
    </div>
  )
}
