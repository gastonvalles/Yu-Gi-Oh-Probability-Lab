import { useEffect, useRef, useState } from 'react'

import { getCachedImageUrl } from '../image-cache'
import { buildInitials } from '../app/utils'
import type { ApiCardReference } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { CardLimitBadge, type CardLimitBadgeSize } from './CardLimitBadge'
import { Skeleton } from './ui/Skeleton'

const resolvedImageUrls = new Map<string, string | null>()

interface CardArtProps {
  remoteUrl: string | null
  name: string
  className?: string
  limitCard?: ApiCardReference | ApiCardSearchResult | null
  limitBadgeSize?: CardLimitBadgeSize
}

export function CardArt({
  remoteUrl,
  name,
  className = '',
  limitCard = null,
  limitBadgeSize = 'md',
}: CardArtProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(remoteUrl)
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const [hasImageError, setHasImageError] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    let cancelled = false

    setIsImageLoaded(false)
    setHasImageError(false)
    setResolvedUrl(remoteUrl)

    if (!remoteUrl) {
      return
    }

    const cachedUrl = resolvedImageUrls.get(remoteUrl)

    if (cachedUrl !== undefined) {
      if (cachedUrl && !cancelled) {
        setResolvedUrl(cachedUrl)
      }

      return
    }

    void getCachedImageUrl(remoteUrl).then((localUrl) => {
      resolvedImageUrls.set(remoteUrl, localUrl)

      if (!cancelled && localUrl) {
        setResolvedUrl(localUrl)
      }
    })

    return () => {
      cancelled = true
    }
  }, [remoteUrl])

  if (resolvedUrl && !hasImageError) {
    return (
      <div className="relative block h-full w-full">
        {!isImageLoaded ? (
          <Skeleton
            radius="none"
            className={['absolute inset-0', className].join(' ').trim()}
          />
        ) : null}
        <img
          ref={(node) => {
            imageRef.current = node

            if (node?.complete && node.naturalWidth > 0) {
              setIsImageLoaded(true)
            }
          }}
          className={[
            'card-art-media transition-opacity duration-200',
            isImageLoaded ? 'opacity-100' : 'opacity-0',
            className,
          ].join(' ').trim()}
          src={resolvedUrl}
          alt={name}
          loading="lazy"
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
        className={[
          'card-art-media',
          'grid place-items-center bg-[var(--input)] font-bold text-[var(--warning)]',
          className,
        ].join(' ')}
        aria-hidden="true"
      >
        <span>{buildInitials(name)}</span>
      </div>
      <CardLimitBadge card={limitCard} size={limitBadgeSize} />
    </div>
  )
}
