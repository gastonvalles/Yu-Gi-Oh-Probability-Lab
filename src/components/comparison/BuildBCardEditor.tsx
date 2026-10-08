import { useEffect, useState } from 'react'

import type { DeckCardInstance } from '../../app/model'
import type { CardOrigin, CardRole } from '../../types'
import { buildCardSummary } from '../card-detail/card-summary'
import { ClassificationOverlay } from '../classification/ClassificationOverlay'

interface BuildBCardEditorProps {
  card: DeckCardInstance
  currentEdit: { origin: CardOrigin; roles: CardRole[] } | undefined
  allCards: DeckCardInstance[]
  onSave: (ygoprodeckId: number, origin: CardOrigin, roles: CardRole[]) => void
  onNavigate: (card: DeckCardInstance) => void
  onClose: () => void
}

/** Clasificar una carta de la Build B: se arma de a poco y se guarda al pasar a otra carta o cerrar. */
export function BuildBCardEditor({ card, currentEdit, allCards, onSave, onNavigate, onClose }: BuildBCardEditorProps) {
  const [origin, setOrigin] = useState<CardOrigin>(currentEdit?.origin ?? card.origin ?? 'engine')
  const [roles, setRoles] = useState<CardRole[]>(currentEdit?.roles ?? [...card.roles])

  useEffect(() => {
    setOrigin(currentEdit?.origin ?? card.origin ?? 'engine')
    setRoles(currentEdit?.roles ?? [...card.roles])
  }, [card.instanceId, card.origin, card.roles, currentEdit])

  const toggleRole = (role: CardRole) => {
    setRoles((previous) => (previous.includes(role) ? previous.filter((current) => current !== role) : [...previous, role]))
  }

  const save = () => {
    if (roles.length > 0) onSave(card.apiCard.ygoprodeckId, origin, roles)
  }

  const goTo = (next: DeckCardInstance) => {
    save()
    onNavigate(next)
  }

  // Las copias de una misma carta cuentan como una sola al recorrer la lista.
  const uniqueCards = allCards.filter((candidate, index, all) => all.findIndex((other) => other.apiCard.ygoprodeckId === candidate.apiCard.ygoprodeckId) === index)
  const currentIndex = uniqueCards.findIndex((candidate) => candidate.apiCard.ygoprodeckId === card.apiCard.ygoprodeckId)
  const previousCard = uniqueCards.length > 1 ? uniqueCards[(currentIndex - 1 + uniqueCards.length) % uniqueCards.length] : null
  const nextCard = uniqueCards.length > 1 ? uniqueCards[(currentIndex + 1) % uniqueCards.length] : null
  const summary = buildCardSummary(card.apiCard)

  return (
    <ClassificationOverlay
      name={card.name}
      card={card.apiCard}
      lines={[`${summary.typeLine}${summary.statLine ? ` · ${summary.statLine}` : ''} · Build B`]}
      origin={origin}
      roles={roles}
      onSetOrigin={setOrigin}
      onToggleRole={toggleRole}
      position={currentIndex + 1}
      total={uniqueCards.length}
      onPrevious={previousCard ? () => goTo(previousCard) : undefined}
      onNext={nextCard ? () => goTo(nextCard) : undefined}
      onClose={() => {
        save()
        onClose()
      }}
    />
  )
}
