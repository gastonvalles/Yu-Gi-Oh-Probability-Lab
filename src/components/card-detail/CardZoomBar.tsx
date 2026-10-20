import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

/** Los tamaños de la carta en grande, como múltiplo del que entra entera en la pantalla (100 %). */
export const ZOOM_STEPS = [1, 1.5, 2, 3] as const
export type ZoomStep = (typeof ZOOM_STEPS)[number]

/** El paso de zoom de al lado (`by` = 1 acerca, -1 aleja); en la punta se queda donde está. */
export function stepZoom(scale: ZoomStep, by: 1 | -1): ZoomStep {
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, ZOOM_STEPS.indexOf(scale) + by))]!
}

interface CardZoomBarProps {
  scale: ZoomStep
  onScale: (scale: ZoomStep) => void
  /** Si el texto del efecto está a la vista sobre la carta. */
  reading: boolean
  onReading: (reading: boolean) => void
}

/**
 * La barra de abajo de la carta en grande: alejar, el tamaño (tocarlo vuelve al 100 %), acercar y «Leer texto de efecto», que abre el texto de la carta ya resaltado sobre la imagen (en una carta de
 * arte extendido o en una impresión escaneada el de la imagen no se lee). El fondo se queda con los clics (no cierran el zoom).
 */
export function CardZoomBar({ scale, onScale, reading, onReading }: CardZoomBarProps) {
  return (
    <div
      role="group"
      aria-label={t('search.zoom.controls')}
      className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 cursor-auto items-center gap-1 rounded-full border border-border bg-card-background/92 px-2 py-1 shadow-overlay"
      onClick={(event) => event.stopPropagation()}
    >
      <IconButton size="sm" aria-label={t('search.zoom.out')} title={t('search.zoom.out')} disabled={scale === ZOOM_STEPS[0]} onClick={() => onScale(stepZoom(scale, -1))}>
        <Icon name="minus" />
      </IconButton>
      <Button variant="tertiary" size="sm" className="min-w-16 tabular-nums" aria-label={t('search.zoom.reset')} title={t('search.zoom.reset')} disabled={scale === 1} onClick={() => onScale(1)}>
        {Math.round(scale * 100)}%
      </Button>
      <IconButton size="sm" aria-label={t('search.zoom.in')} title={t('search.zoom.in')} disabled={scale === ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => onScale(stepZoom(scale, 1))}>
        <Icon name="plus" />
      </IconButton>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <IconButton size="sm" aria-label={t('search.zoom.read')} title={t('search.zoom.read')} aria-pressed={reading} onClick={() => onReading(!reading)}>
        <Icon name="book" />
      </IconButton>
    </div>
  )
}
