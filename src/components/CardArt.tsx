import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'

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
  /**
   * Sin el fundido de cuando carga, y si la imagen ya está en la memoria del navegador, sin el esqueleto: se ve desde el primer cuadro. Para una carta que React vuelve a montar en otro lugar
   * y tiene que aparecer ahí de una: la que se suelta en otra fila del creador de tier lists.
   */
  instant?: boolean
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
  instant = false,
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

  // Lo mismo, antes de dibujar (el efecto de arriba corre después): la imagen ya cargada no pasa por el esqueleto. El fundido no se puede saltear así (otro efecto del mismo cuadro puede
  // obligar a calcular los estilos con la imagen todavía transparente), por eso con `instant` la imagen no lo lleva.
  useLayoutEffect(() => {
    const image = imageRef.current

    if (instant && image?.complete && image.naturalWidth > 0) setIsImageLoaded(true)
  }, [instant])

  if (src && !hasImageError) {
    return (
      <div className={frame} {...frameProps}>
        {/* `absolute!`: el `relative` del esqueleto gana a un `absolute` suelto; si no, empuja la imagen una carta más abajo y, en una carta que no recorta (la que se reparte), la barra de la mesa aparece. */}
        {!isImageLoaded ? (
          <Skeleton
            radius="none"
            still
            className={['absolute! inset-0', className].join(' ').trim()}
          />
        ) : null}
        <img
          ref={imageRef}
          className={[
            instant ? 'rounded-none!' : 'rounded-none! transition-opacity duration-150',
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
