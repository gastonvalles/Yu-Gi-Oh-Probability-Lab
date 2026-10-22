import type { RefObject } from 'react'

import type { DeckDragOverlayState } from '../../app/use-deck-pointer-drag'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'

interface DeckModeDragOverlayProps {
  overlay: DeckDragOverlayState | null
  overlayRef: RefObject<HTMLDivElement | null>
}

interface DragGhostProps {
  ghostRef: RefObject<HTMLDivElement | null>
  width: number
  height: number
  image: string | null
  name: string
  limitCard?: ApiCardReference | null
}

/** El fantasma de la carta que se arrastra, del tamaño de la carta: lo mueve por `transform` quien arrastra. Lo comparten el builder y el creador de tier lists, así se ven igual. */
export function DragGhost({ ghostRef, width, height, image, name, limitCard = null }: DragGhostProps) {
  return (
    <div
      ref={ghostRef}
      className="pointer-events-none fixed left-0 top-0 z-[120] opacity-70"
      style={{
        width,
        height,
        willChange: 'transform',
      }}
      aria-hidden="true"
    >
      <CardArt
        remoteUrl={image}
        name={name}
        className="block h-full w-full bg-[var(--input)] object-contain shadow-[0_12px_28px_rgba(0,0,0,0.42)]"
        limitCard={limitCard}
      />
    </div>
  )
}

export function DeckModeDragOverlay({
  overlay,
  overlayRef,
}: DeckModeDragOverlayProps) {
  if (!overlay) {
    return null
  }

  return (
    <DragGhost
      ghostRef={overlayRef}
      width={overlay.width}
      height={overlay.height}
      image={overlay.card.imageUrlSmall ?? overlay.card.imageUrl}
      name={overlay.name}
      limitCard={overlay.card}
    />
  )
}
