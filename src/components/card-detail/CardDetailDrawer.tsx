import { useEffect } from 'react'

import type { DeckZone } from '../../app/model'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetail } from './CardDetail'

interface CardDetailDrawerProps {
  card: ApiCardSearchResult | null
  deckFormat: DeckFormat
  isOpen: boolean
  showActions?: boolean
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

export function CardDetailDrawer({
  card,
  deckFormat,
  isOpen,
  showActions = true,
  onAddToZone,
  onClose,
}: CardDetailDrawerProps) {
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
    <div className="fixed inset-0 z-[170] grid place-items-center bg-[rgb(var(--background-rgb)/0.8)] px-4 py-5" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${card.name}`}
        className="surface-panel z-10 flex w-full max-w-[70rem] max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden rounded-[1rem] border border-(--border-subtle) p-0 shadow-none"
        onClick={(event) => event.stopPropagation()}
      >
        <CardDetail
          card={card}
          deckFormat={deckFormat}
          layoutMode="mobile"
          showActions={showActions}
          onAddToZone={onAddToZone}
          onClose={onClose}
        />
      </div>
    </div>
  )
}
