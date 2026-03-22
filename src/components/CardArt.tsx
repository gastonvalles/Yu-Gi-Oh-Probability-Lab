import { useEffect, useState } from 'react'

import { getCachedImageUrl } from '../image-cache'
import { buildInitials } from '../app/utils'
import type { ApiCardReference } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { CardLimitBadge, type CardLimitBadgeSize } from './CardLimitBadge'

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

  useEffect(() => {
    let cancelled = false

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

  if (resolvedUrl) {
    return (
      <div className="relative block h-full w-full">
        <img
          className={className}
          src={resolvedUrl}
          alt={name}
          loading="lazy"
          draggable={false}
        />
        <CardLimitBadge card={limitCard} size={limitBadgeSize} />
      </div>
    )
  }

  return (
    <div className="relative block h-full w-full">
      <div
        className={[
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
