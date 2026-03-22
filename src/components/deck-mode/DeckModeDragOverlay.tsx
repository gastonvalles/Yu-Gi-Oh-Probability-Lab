import type { RefObject } from 'react'

import type { DeckDragOverlayState } from '../../app/use-deck-pointer-drag'
import { CardArt } from '../CardArt'

interface DeckModeDragOverlayProps {
  overlay: DeckDragOverlayState | null
  overlayRef: RefObject<HTMLDivElement | null>
}

export function DeckModeDragOverlay({
  overlay,
  overlayRef,
}: DeckModeDragOverlayProps) {
  if (!overlay) {
    return null
  }

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none fixed left-0 top-0 z-[120] opacity-70"
      style={{
        width: overlay.width,
        height: overlay.height,
        willChange: 'transform',
      }}
      aria-hidden="true"
    >
      <CardArt
        remoteUrl={overlay.card.imageUrlSmall ?? overlay.card.imageUrl}
        name={overlay.name}
        className="block h-full w-full bg-[var(--input)] object-cover shadow-[0_12px_28px_rgba(0,0,0,0.42)]"
      />
    </div>
  )
}
