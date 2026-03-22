import { useEffect, useState } from 'react'

import { getCachedImageUrl } from '../image-cache'
import { buildInitials } from '../app/utils'

const resolvedImageUrls = new Map<string, string | null>()

interface CardArtProps {
  remoteUrl: string | null
  name: string
  className?: string
}

export function CardArt({ remoteUrl, name, className = '' }: CardArtProps) {
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
      <img
        className={className}
        src={resolvedUrl}
        alt={name}
        loading="lazy"
        draggable={false}
      />
    )
  }

  return (
    <div
      className={[
        'grid place-items-center bg-[var(--input)] font-bold text-[var(--warning)]',
        className,
      ].join(' ')}
      aria-hidden="true"
    >
      <span>{buildInitials(name)}</span>
    </div>
  )
}
