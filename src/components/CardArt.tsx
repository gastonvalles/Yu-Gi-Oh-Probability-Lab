import { memo, useEffect, useRef, useState } from 'react'

import { buildInitials } from '../app/utils'
import type { ApiCardReference } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { CardLimitBadge, type CardLimitBadgeSize } from './CardLimitBadge'
import { Skeleton } from './ui/Skeleton'

interface CardArtProps {
  remoteUrl: string | null
  name: string
  className?: string
  limitCard?: ApiCardReference | ApiCardSearchResult | null
  limitBadgeSize?: CardLimitBadgeSize
}

/**
 * Arte de una carta con esqueleto mientras carga e iniciales si no hay imagen.
 * Las imágenes de YGOPRODeck las cachea el navegador (HTTP): no hace falta una capa propia.
 */
export const CardArt = memo(function CardArt({
  remoteUrl,
  name,
  className = '',
  limitCard = null,
  limitBadgeSize = 'md',
}: CardArtProps) {
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const [hasImageError, setHasImageError] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    setHasImageError(false)

    // Si la imagen ya estaba en caché, `onLoad` pudo dispararse antes de montar el handler.
    const image = imageRef.current
    setIsImageLoaded(Boolean(remoteUrl && image && image.complete && image.naturalWidth > 0))
  }, [remoteUrl])

  if (remoteUrl && !hasImageError) {
    return (
      <div className="relative block h-full w-full">
        {!isImageLoaded ? (
          <Skeleton
            radius="none"
            className={['absolute inset-0', className].join(' ').trim()}
          />
        ) : null}
        <img
          ref={imageRef}
          className={[
            'rounded-none! transition-opacity duration-150',
            isImageLoaded ? 'opacity-100' : 'opacity-0',
            className,
          ].join(' ').trim()}
          data-card-art
          src={remoteUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setIsImageLoaded(true)}
          onError={() => setHasImageError(true)}
        />
        <CardLimitBadge card={limitCard} size={limitBadgeSize} />
      </div>
    )
  }

  return (
    <div className="relative block h-full w-full">
      <div
        data-card-art
        className={[
          'rounded-none! grid place-items-center bg-input font-bold text-warning',
          className,
        ].join(' ')}
        aria-hidden="true"
      >
        <span>{buildInitials(name)}</span>
      </div>
      <CardLimitBadge card={limitCard} size={limitBadgeSize} />
    </div>
  )
})
