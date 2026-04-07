import { startTransition, useEffect, useState } from 'react'

import type { DeckZone } from '../../app/model'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetail, CardDetailSkeleton } from './CardDetail'

interface CardDetailModalProps {
  card: ApiCardSearchResult | null
  deckFormat: DeckFormat
  isOpen: boolean
  showActions?: boolean
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

export function CardDetailModal({
  card,
  deckFormat,
  isOpen,
  showActions = true,
  onAddToZone,
  onClose,
}: CardDetailModalProps) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

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
    <div className="fixed inset-0 z-[170] grid place-items-center bg-[rgb(var(--background-rgb)/0.76)] px-4 py-5" onClick={onClose}>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${card.name}`}
        className="surface-panel relative z-10 flex w-full max-w-[70rem] max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0 shadow-[0_32px_80px_rgba(0,0,0,0.48)]"
        onClick={(event) => event.stopPropagation()}
      >
        {isReady ? (
          <CardDetail
            card={card}
            deckFormat={deckFormat}
            layoutMode="desktop"
            showActions={showActions}
            onAddToZone={onAddToZone}
            onClose={onClose}
          />
        ) : (
          <CardDetailSkeleton
            layoutMode="desktop"
            showActions={showActions}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}
