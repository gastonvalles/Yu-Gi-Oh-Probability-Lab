import { useState } from 'react'

import type { CardEntry } from '../../../types'
import { createCardPoolMatcher } from '../../../app/patterns'
import { formatInteger } from '../../../app/utils'
import { CloseIcon } from '../../ui/IconButton'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface CardPoolEditorProps {
  patternId: string
  conditionId: string
  selectedCardIds: string[]
  derivedMainCards: CardEntry[]
  actions: PatternEditorActions
}

export function CardPoolEditor({
  patternId,
  conditionId,
  selectedCardIds,
  derivedMainCards,
  actions,
}: CardPoolEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const selectedCards = selectedCardIds
    .map((id) => derivedMainCards.find((card) => card.id === id))
    .filter((card): card is CardEntry => Boolean(card))

  const availableCards = derivedMainCards.filter(
    (card) => !selectedCardIds.includes(card.id),
  )

  const handleRemoveCard = (cardId: string) => {
    const nextIds = selectedCardIds.filter((id) => id !== cardId)
    const nextMatcher = createCardPoolMatcher(nextIds)
    actions.setRequirementMatcher(patternId, conditionId, nextMatcher)
  }

  const handleAddCard = (cardId: string) => {
    const nextIds = [...selectedCardIds, cardId]
    const nextMatcher = createCardPoolMatcher(nextIds)
    actions.setRequirementMatcher(patternId, conditionId, nextMatcher)
  }

  if (selectedCardIds.length === 0) {
    return null
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1">
        {selectedCards.map((card) => (
          <span
            key={card.id}
            className="inline-flex items-center gap-1 rounded bg-[rgb(var(--primary-rgb)/0.08)] px-2 py-0.5 text-[0.74rem] text-(--text-main)"
          >
            {card.name}
            <button
              type="button"
              className="inline-flex h-[0.9rem] w-[0.9rem] items-center justify-center text-(--text-soft) transition-colors hover:text-(--text-main)"
              aria-label={`Quitar ${card.name} del pool`}
              onClick={() => handleRemoveCard(card.id)}
            >
              <CloseIcon className="h-[0.68rem] w-[0.68rem]" />
            </button>
          </span>
        ))}
      </div>

      {isExpanded ? (
        <div className="surface-card grid max-h-40 gap-0.5 overflow-y-auto rounded p-1.5">
          {availableCards.length === 0 ? (
            <p className="m-0 px-1 text-[0.72rem] text-(--text-muted)">
              Todas las cartas del deck ya están en el pool.
            </p>
          ) : (
            availableCards.map((card) => (
              <button
                key={card.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[0.76rem] text-(--text-main) transition-colors hover:bg-[rgb(var(--primary-rgb)/0.06)]"
                onClick={() => handleAddCard(card.id)}
              >
                <span className="truncate">{card.name}</span>
                <span className="shrink-0 text-[0.66rem] text-(--text-muted)">
                  {formatInteger(card.copies)}x
                </span>
              </button>
            ))
          )}
        </div>
      ) : (
        <button
          type="button"
          className="justify-self-start text-[0.72rem] text-(--text-muted) underline transition-colors hover:text-(--text-main)"
          onClick={() => setIsExpanded(true)}
        >
          Agregar carta al pool
        </button>
      )}
    </div>
  )
}
