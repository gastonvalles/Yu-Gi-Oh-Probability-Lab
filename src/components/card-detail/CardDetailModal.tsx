import { useEffect } from 'react'

import type { DeckZone } from '../../app/model'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetail } from './CardDetail'

interface CardDetailModalProps {
  card: ApiCardSearchResult | null
  deckFormat: DeckFormat
  isOpen: boolean
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

export function CardDetailModal({
  card,
  deckFormat,
  isOpen,
  onAddToZone,
  onClose,
}: CardDetailModalProps) {
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

  if (!isOpen || !card) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-[rgb(var(--background-rgb)/0.76)] px-4 py-5">
      <button
        type="button"
        aria-label="Cerrar detalle"
        className="absolute inset-0 h-full w-full"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${card.name}`}
        className="relative z-10 flex w-full max-w-[70rem] max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden rounded-[1rem] border border-[#353840] bg-[#26272b] p-0 shadow-[0_32px_80px_rgba(0,0,0,0.48)]"
      >
        <CardDetail
          card={card}
          deckFormat={deckFormat}
          layoutMode="desktop"
          onAddToZone={onAddToZone}
          onClose={onClose}
        />
      </div>
    </div>
  )
}
