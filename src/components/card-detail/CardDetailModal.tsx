import { startTransition, useEffect, useState } from 'react'

import type { DeckZone } from '../../app/model'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetail, CardDetailSkeleton } from './CardDetail'

type CardDetailLayoutMode = 'desktop' | 'mobile'

interface CardDetailModalProps {
  card: ApiCardSearchResult | null
  deckFormat: DeckFormat
  isOpen: boolean
  layoutMode?: CardDetailLayoutMode
  showActions?: boolean
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

const LAYOUT_CLASSES: Record<CardDetailLayoutMode, { backdrop: string; panel: string }> = {
  desktop: {
    backdrop: 'bg-[rgb(var(--background-rgb)/0.76)]',
    panel: 'relative shadow-[0_32px_80px_rgba(0,0,0,0.48)]',
  },
  mobile: {
    backdrop: 'bg-[rgb(var(--background-rgb)/0.8)]',
    panel: 'shadow-none',
  },
}

export function CardDetailModal({
  card,
  deckFormat,
  isOpen,
  layoutMode = 'desktop',
  showActions = true,
  onAddToZone,
  onClose,
}: CardDetailModalProps) {
  const [isReady, setIsReady] = useState(false)
  const layoutClasses = LAYOUT_CLASSES[layoutMode]

  useBodyScrollLock(isOpen)
  useEscapeKey(onClose, isOpen)

  useEffect(() => {
    if (!isOpen || !card) {
      setIsReady(false)
      return
    }

    if (typeof window === 'undefined') {
      setIsReady(true)
      return
    }

    let frameA = 0
    let frameB = 0

    setIsReady(false)
    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        startTransition(() => {
          setIsReady(true)
        })
      })
    })

    return () => {
      window.cancelAnimationFrame(frameA)
      window.cancelAnimationFrame(frameB)
    }
  }, [card, isOpen])

  if (!isOpen || !card) {
    return null
  }

  return (
    <div
      className={`fixed inset-0 z-170 grid place-items-center px-4 py-5 ${layoutClasses.backdrop}`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${card.name}`}
        className={`surface-panel z-10 flex w-full max-w-280 max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0 ${layoutClasses.panel}`}
        onClick={(event) => event.stopPropagation()}
      >
        {isReady ? (
          <CardDetail
            card={card}
            deckFormat={deckFormat}
            layoutMode={layoutMode}
            showActions={showActions}
            onAddToZone={onAddToZone}
            onClose={onClose}
          />
        ) : (
          <CardDetailSkeleton
            layoutMode={layoutMode}
            showActions={showActions}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}
