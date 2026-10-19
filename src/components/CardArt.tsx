import { memo, useEffect, useRef, useState } from 'react'

import { cardImageSrc } from '../app/card-image-source'
import { buildInitials } from '../app/utils'
import type { ApiCardReference } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { CardGlare, TILT_IN_PLACE, tiltInPlaceHandlers } from './card-detail/card-tilt'
import { CardLimitBadge, type CardLimitBadgeSize } from './CardLimitBadge'
import { Skeleton } from './ui/Skeleton'

interface CardArtProps {
  remoteUrl: string | null
  /** Si la imagen no carga (por ejemplo, el escaneo de una impresión que no existe), esta: la de YGOPRODeck de siempre. Antes de caer a las iniciales. */
  fallbackUrl?: string | null
  name: string
  className?: string
  limitCard?: ApiCardReference | ApiCardSearchResult | null
  limitBadgeSize?: CardLimitBadgeSize
  /** La carta se inclina en 3D hacia el puntero (el mouse al pasar, el dedo al tocarla) y lleva su brillo, como la del detalle: en toda grilla o lista donde las cartas se ven una al lado de otra. */
  tilt?: boolean
}

/**
 * Arte de una carta con esqueleto mientras carga e iniciales si no hay imagen.
 * Las imágenes pasan por nuestro proxy (`cardImageSrc`) y las cachea el navegador (HTTP): no hace falta una capa propia.
 * Orden de intentos: la imagen por el proxy, la misma directa, `fallbackUrl` (también por el proxy y directa) y, si ninguna, las iniciales.
 */
export const CardArt = memo(function CardArt({
  remoteUrl,
  fallbackUrl = null,
  name,
  className = '',
  limitCard = null,
  limitBadgeSize = 'md',
  tilt = false,
}: CardArtProps) {
  const frame = ['relative block h-full w-full', tilt ? TILT_IN_PLACE : ''].join(' ').trim()
  const frameProps = tilt ? tiltInPlaceHandlers : {}
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const [hasImageError, setHasImageError] = useState(false)
  // Si el proxy falla, se prueba una vez con la URL original de YGOPRODeck antes de darla por perdida.
  const [useRemote, setUseRemote] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const currentUrl = useFallback ? fallbackUrl : remoteUrl
  const src = currentUrl && !useRemote ? cardImageSrc(currentUrl) : currentUrl

  useEffect(() => {
    setHasImageError(false)
    setUseRemote(false)
    setUseFallback(false)

    // Si la imagen ya estaba en caché, `onLoad` pudo dispararse antes de montar el handler.
    const image = imageRef.current
    setIsImageLoaded(Boolean(remoteUrl && image && image.complete && image.naturalWidth > 0))
  }, [remoteUrl])

  if (src && !hasImageError) {
    return (
      <div className={frame} {...frameProps}>
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
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setIsImageLoaded(true)}
          onError={() => {
            if (src !== currentUrl) {
              setUseRemote(true)
            } else if (!useFallback && fallbackUrl && fallbackUrl !== remoteUrl) {
              setUseFallback(true)
              setUseRemote(false)
              setIsImageLoaded(false)
            } else {
              setHasImageError(true)
            }
          }}
        />
        <CardLimitBadge card={limitCard} size={limitBadgeSize} />
        {tilt ? <CardGlare /> : null}
      </div>
    )
  }

  return (
    <div className={frame} {...frameProps}>
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
      {tilt ? <CardGlare /> : null}
    </div>
  )
})
