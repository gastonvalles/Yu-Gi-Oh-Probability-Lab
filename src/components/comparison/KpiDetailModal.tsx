import { useEffect } from 'react'

import { getKpiDetailCards } from './kpi-detail-helpers'
import type { DeckCardInstance } from '../../app/model'
import type { CardEditMap } from '../../app/build-comparison-edits'
import type { ApiCardReference, CardRole } from '../../types'
import { CardArt } from '../CardArt'
import { formatInteger } from '../../app/utils'
import { getCardRoleDefinition } from '../../app/deck-groups'

export interface KpiDetailModalProps {
  isOpen: boolean
  role: CardRole
  side: 'A' | 'B'
  mainDeck: DeckCardInstance[]
  editsMap?: CardEditMap
  onCardClick: (card: ApiCardReference, name: string) => void
  onClose: () => void
}

function getRoleLabel(role: CardRole): string {
  const def = getCardRoleDefinition(role)
  return def.label
}

export function KpiDetailModal({
  isOpen,
  role,
  side,
  mainDeck,
  editsMap,
  onCardClick,
  onClose,
}: KpiDetailModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!isOpen) return null

  const result = getKpiDetailCards(mainDeck, role, editsMap)
  const pctStr = result.mainDeckSize > 0
    ? `${(result.percentage * 100).toFixed(1)}%`
    : '0%'

  return (
    <div
      className="fixed inset-0 z-150 grid place-items-center bg-[rgb(var(--background-rgb)/0.76)] px-4 py-5"
      data-testid="kpi-detail-overlay"
      onClick={onClose}
    >
      <div
        className="surface-panel relative flex w-full max-w-lg min-h-0 max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0 shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <div className="absolute right-4 top-4 z-10">
          <button
            type="button"
            aria-label="Cerrar"
            data-testid="kpi-detail-close"
            className="grid h-8 w-8 place-items-center rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-[rgb(var(--foreground-rgb)/0.06)] transition-colors"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          <div className="grid gap-3">
            {/* Header */}
            <div className="grid gap-1 pr-10">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-[0.12em]">Build {side}</p>
              <h3 className="m-0 text-[1.45rem] leading-[0.98] tracking-[-0.03em] text-(--text-main)">
                ¿Qué cartas cuentan como {getRoleLabel(role)}?
              </h3>
              <p className="app-muted m-0 text-[0.76rem]">
                {formatInteger(result.totalCopies)} carta{result.totalCopies === 1 ? '' : 's'} · {pctStr} del Main Deck
              </p>
            </div>

            {/* Card list */}
            {result.cards.length === 0 ? (
              <p className="app-muted m-0 py-6 text-center text-[0.84rem]">No hay cartas en esta categoría.</p>
            ) : (
              <div className="grid gap-px">
                {result.cards.map((card) => (
                  <button
                    key={card.ygoprodeckId}
                    type="button"
                    data-testid="kpi-detail-card-row"
                    className="app-list-item grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 py-1.5 text-left"
                    onClick={() => onCardClick(card.apiCard, card.name)}
                  >
                    <div className="w-[36px]">
                      <CardArt
                        remoteUrl={card.imageUrlSmall}
                        name={card.name}
                        className="block h-auto w-full bg-input"
                        limitCard={card.apiCard}
                        limitBadgeSize="sm"
                      />
                    </div>
                    <div className="grid min-w-0 gap-0.5">
                      <strong className="truncate text-[0.8rem] leading-[1.04] text-(--text-main)">{card.name}</strong>
                      {card.needsReview ? (
                        <span className="inline-flex w-fit items-center rounded bg-amber-400/20 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-300">Revisar</span>
                      ) : null}
                    </div>
                    <span className="app-chip shrink-0 px-1.5 py-0.5 text-[0.62rem]">{formatInteger(card.copies)}x</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
