import { startTransition, useEffect, useState } from 'react'

import type { DeckZone } from '../../app/model'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { Modal } from '../ui/Modal'
import { CardDetail, CardDetailSkeleton } from './CardDetail'
import type { DeckCopyActions } from './DeckCopyControls'

type CardDetailLayoutMode = 'desktop' | 'mobile'

interface CardDetailModalProps {
  card: ApiCardSearchResult | null
  deckFormat: DeckFormat
  isOpen: boolean
  layoutMode?: CardDetailLayoutMode
  showActions?: boolean
  deckCopy?: DeckCopyActions | null
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

export function CardDetailModal({
  card,
  deckFormat,
  isOpen,
  layoutMode = 'desktop',
  showActions = true,
  deckCopy = null,
  onAddToZone,
  onClose,
}: CardDetailModalProps) {
  const [isReady, setIsReady] = useState(false)

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

  if (!card) {
    return null
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      bare
      flush
      hideCloseButton
      ariaLabel={`Detalle de ${card.name}`}
      className={layoutMode === 'mobile' ? 'card-detail-modal-mobile' : undefined}
    >
      {isReady ? (
        <CardDetail
          card={card}
          deckFormat={deckFormat}
          layoutMode={layoutMode}
          showActions={showActions}
          deckCopy={deckCopy}
          onAddToZone={onAddToZone}
          onClose={onClose}
        />
      ) : (
        <CardDetailSkeleton layoutMode={layoutMode} showActions={showActions} onClose={onClose} />
      )}
    </Modal>
  )
}
