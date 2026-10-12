import { createPortal } from 'react-dom'

import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { CloseButton } from '../ui/IconButton'

interface CardZoomProps {
  card: ApiCardReference
  name: string
  onClose: () => void
}

/**
 * La carta en grande, sola sobre el fondo (como al tocarla en el detalle del celular). Se cierra tocando
 * en cualquier lado, con la X o con Escape; si hay un modal abajo, Escape cierra primero este.
 */
export function CardZoom({ card, name, onClose }: CardZoomProps) {
  useBodyScrollLock(true)
  useEscapeKey(onClose)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('search.zoom.aria', { name })}
      className="fixed inset-0 z-250 grid cursor-zoom-out place-items-center bg-background/90 p-4 backdrop-blur-[8px] animate-dialog-enter motion-reduce:animate-none"
      onClick={onClose}
    >
      <div className="relative aspect-[421/614] h-[min(94dvh,calc((100vw-2rem)*614/421))] max-w-full overflow-hidden rounded-lg shadow-[0_24px_50px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.12),0_0_40px_rgb(var(--primary-rgb)/0.3)]">
        <CardArt remoteUrl={card.imageUrl ?? card.imageUrlSmall ?? null} name={name} className="block h-full w-full bg-input object-contain" limitCard={card} limitBadgeSize="lg" />
      </div>
      <CloseButton
        tone="flat"
        size="lg"
        aria-label={t('common.close')}
        className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] z-10"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      />
    </div>,
    document.body,
  )
}
