import { useEffect } from 'react'

import type { DeckZone } from '../../app/model'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetail } from './CardDetail'

interface CardDetailDrawerProps {
  card: ApiCardSearchResult | null
  deckFormat: DeckFormat
  isOpen: boolean
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

export function CardDetailDrawer({
  card,
  deckFormat,
  isOpen,
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
    <div className="fixed inset-0 z-[170]">
      <button
        type="button"
        aria-label="Cerrar detalle"
        className="absolute inset-0 h-full w-full bg-[rgb(var(--background-rgb)/0.8)]"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${card.name}`}
        className="absolute inset-x-0 bottom-0 z-10 grid h-[min(90dvh,46rem)] max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-t-[1rem] border border-b-0 border-[#353840] bg-[#26272b] p-0 shadow-[0_-20px_48px_rgba(0,0,0,0.42)]"
      >
        <div className="flex justify-center pt-2">
          <span className="h-1 w-12 rounded-full bg-[rgb(var(--foreground-rgb)/0.16)]" aria-hidden="true" />
        </div>

        <CardDetail
          card={card}
          deckFormat={deckFormat}
          layoutMode="mobile"
          onAddToZone={onAddToZone}
          onClose={onClose}
        />
      </aside>
    </div>
  )
}
