import { useLayoutEffect, useRef, useState } from 'react'

import { buildHoverPreviewDetailLine, buildHoverPreviewStatLine, getHoverPreviewPosition } from '../app/deck-utils'
import type { HoverPreviewState } from '../app/model'
import { CardArt } from './CardArt'

interface HoverPreviewProps {
  preview: HoverPreviewState | null
}

export function HoverPreview({ preview }: HoverPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!preview || !previewRef.current) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      if (!previewRef.current) {
        return
      }

      const anchorRect = preview.anchor.getBoundingClientRect()
      const nextPosition = getHoverPreviewPosition(
        anchorRect,
        previewRef.current.offsetWidth,
        previewRef.current.offsetHeight,
      )

      setPosition(nextPosition)
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [preview])

  if (!preview) {
    return null
  }

  return (
    <aside
      ref={previewRef}
      className="pointer-events-none fixed z-50 w-[min(560px,calc(100vw-24px))] border border-[#8a4f1e] bg-[#2d2d2d] p-3"
      style={position ? { top: position.top, left: position.left } : undefined}
      aria-hidden="true"
    >
      <div className="grid grid-cols-[116px_minmax(0,1fr)] gap-4">
        <div>
          <CardArt
            remoteUrl={preview.card.imageUrl}
            name={preview.name}
            className="block aspect-[0.72] w-[116px] bg-[#1a1a1a] object-cover"
          />
        </div>

        <div className="grid min-w-0 gap-1 text-[#f0f0f0]">
          <strong className="text-base">{preview.name}</strong>
          <p className="m-0 break-words leading-[1.35]">{buildHoverPreviewDetailLine(preview.card)}</p>
          {buildHoverPreviewStatLine(preview.card) ? (
            <p className="m-0 break-words leading-[1.35]">{buildHoverPreviewStatLine(preview.card)}</p>
          ) : null}
          {preview.card.description ? (
            <p className="m-0 whitespace-pre-wrap break-words leading-[1.35] text-[#d8d8d8]">
              {preview.card.description}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
