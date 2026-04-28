import { useState, useEffect, type CSSProperties } from 'react'
import type { DeckCardInstance } from '../../app/model'
import type { CardOrigin, CardRole, GroupKey } from '../../types'
import {
  CARD_ORIGIN_DEFINITIONS,
  getCardRoleDefinition,
  getDeckGroupTheme,
  serializeGroupKey,
} from '../../app/deck-groups'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { formatInteger } from '../../app/utils'

interface BuildBCardEditorProps {
  card: DeckCardInstance
  currentEdit: { origin: CardOrigin; roles: CardRole[] } | undefined
  allCards: DeckCardInstance[]
  onSave: (ygoprodeckId: number, origin: CardOrigin, roles: CardRole[]) => void
  onNavigate: (card: DeckCardInstance) => void
  onClose: () => void
}

function getStyleVars(groupKey: GroupKey): CSSProperties {
  const theme = getDeckGroupTheme(groupKey)
  return { '--role-color': theme.color, '--role-rgb': theme.rgb } as CSSProperties
}

const ORIGIN_BLURB: Record<CardOrigin, string> = {
  engine: 'Core y plan principal.',
  non_engine: 'Interacción y soporte externo.',
  hybrid: 'Cruza ambos espacios.',
}

const ROLE_SECTIONS = [
  {
    title: 'Plan de Juego',
    roles: ['starter', 'extender', 'enabler', 'searcher', 'draw', 'combo_piece', 'payoff', 'recovery'] as CardRole[],
  },
  {
    title: 'Interacción',
    roles: ['handtrap', 'disruption', 'boardbreaker', 'floodgate', 'removal'] as CardRole[],
  },
  {
    title: 'Utility',
    roles: ['brick', 'garnet', 'tech'] as CardRole[],
  },
] as const

export function BuildBCardEditor({ card, currentEdit, allCards, onSave, onNavigate, onClose }: BuildBCardEditorProps) {
  const [origin, setOrigin] = useState<CardOrigin>(
    currentEdit?.origin ?? card.origin ?? 'engine',
  )
  const [roles, setRoles] = useState<CardRole[]>(
    currentEdit?.roles ?? (card.roles.length > 0 ? [...card.roles] : []),
  )

  useEffect(() => {
    setOrigin(currentEdit?.origin ?? card.origin ?? 'engine')
    setRoles(currentEdit?.roles ?? (card.roles.length > 0 ? [...card.roles] : []))
  }, [card.instanceId, currentEdit])

  const toggleRole = (role: CardRole) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )
  }

  const autoSaveAndClose = () => {
    if (roles.length > 0) onSave(card.apiCard.ygoprodeckId, origin, roles)
    onClose()
  }

  const handleSaveAndNavigate = (next: DeckCardInstance) => {
    if (roles.length > 0) onSave(card.apiCard.ygoprodeckId, origin, roles)
    onNavigate(next)
  }

  const currentIndex = allCards.findIndex((c) => c.instanceId === card.instanceId)
  const prevCard = allCards.length > 1
    ? allCards[(currentIndex - 1 + allCards.length) % allCards.length]
    : null
  const nextCard = allCards.length > 1
    ? allCards[(currentIndex + 1) % allCards.length]
    : null
  const position = currentIndex + 1
  const total = allCards.length

  return (
    <div
      className="fixed inset-0 z-150 grid place-items-center bg-[rgb(var(--background-rgb)/0.76)] px-4 py-5"
      onClick={autoSaveAndClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Editar ${card.name}`}
        className="surface-panel relative flex w-full max-w-280 min-h-0 max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0 shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* X close button (same as ClassificationModal) */}
        <div className="absolute right-4 top-4 z-10 min-[1101px]:right-6 min-[1101px]:top-5">
          <button
            type="button"
            aria-label="Cerrar detalle"
            className="grid h-8 w-8 place-items-center rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-[rgb(var(--foreground-rgb)/0.06)] transition-colors"
            onClick={autoSaveAndClose}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 min-[1101px]:px-6 min-[1101px]:pb-5 min-[1101px]:pt-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid gap-2.5 min-[1101px]:gap-3">
            <div className="grid w-full min-w-0 gap-3">
              <div className="grid gap-3 min-[1101px]:grid-cols-[18rem_minmax(0,1fr)] min-[1101px]:items-stretch">
                {/* Card art column */}
                <div className="grid content-start gap-2">
                  <div className="w-full min-[1101px]:w-[18rem]">
                    <CardArt
                      remoteUrl={card.apiCard.imageUrl ?? card.apiCard.imageUrlSmall}
                      name={card.name}
                      className="block h-auto w-full bg-input"
                      limitCard={card.apiCard}
                    />
                  </div>
                </div>

                {/* Editor panel */}
                <div className="flex min-h-full flex-col gap-2.5">
                  <div className="grid gap-1 pr-12">
                    <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-[0.12em]">
                      Build B — Carta {formatInteger(position)} de {formatInteger(total)}
                    </p>
                    <h3 className="m-0 wrap-break-word text-[2rem] leading-[0.94] tracking-[-0.03em] text-(--text-main) min-[1101px]:text-[2.3rem]">
                      {card.name}
                    </h3>
                    <p className="app-muted m-0 text-[0.9rem] leading-[1.05] min-[1101px]:text-[0.98rem]">
                      Editar clasificación para Build B
                    </p>
                  </div>

                  {/* Origin selector — same as Step 2 */}
                  <section className="grid gap-2">
                    <p className="app-kicker m-0 text-[0.64rem] uppercase tracking-widest">¿Qué es?</p>
                    <div className="grid gap-1.5 min-[860px]:grid-cols-3">
                      {CARD_ORIGIN_DEFINITIONS.map((definition) => {
                        const active = origin === definition.key.value
                        const muted = origin !== null && !active
                        return (
                          <button
                            key={serializeGroupKey(definition.key)}
                            type="button"
                            aria-pressed={active}
                            className={[
                              'classification-origin-option grid gap-1 p-2 text-left',
                              active ? 'classification-origin-option-active' : '',
                              muted ? 'classification-origin-option-muted' : '',
                            ].join(' ')}
                            style={getStyleVars(definition.key)}
                            onClick={() => setOrigin(definition.key.value)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="role-reference-mark shrink-0" />
                              <strong className="text-[0.8rem] leading-none text-(--text-main)">{definition.label}</strong>
                            </div>
                            <span className="app-muted text-[0.66rem] leading-[1.08]">{ORIGIN_BLURB[definition.key.value]}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>

                  {/* Role toggles — same as Step 2 */}
                  <section className="grid gap-2">
                    <p className="app-kicker m-0 text-[0.64rem] uppercase tracking-widest">¿Qué roles cumple?</p>
                    <div className="grid gap-2 min-[1101px]:grid-cols-3 min-[1101px]:items-stretch">
                      {ROLE_SECTIONS.map((section) => {
                        const selectedCount = section.roles.reduce(
                          (t, r) => t + (roles.includes(r) ? 1 : 0), 0,
                        )
                        return (
                          <article key={section.title} className="surface-card grid h-full grid-rows-[auto_minmax(0,1fr)] gap-1.5 p-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <strong className="text-[0.8rem] leading-none text-(--text-main)">{section.title}</strong>
                              <span className="app-chip px-1.5 py-0.5 text-[0.62rem]">
                                {formatInteger(selectedCount)} / {formatInteger(section.roles.length)}
                              </span>
                            </div>
                            <div className="grid content-start gap-1.5 min-[720px]:grid-cols-2">
                              {section.roles.map((role) => {
                                const definition = getCardRoleDefinition(role)
                                const active = roles.includes(role)
                                return (
                                  <button
                                    key={serializeGroupKey(definition.key)}
                                    type="button"
                                    aria-pressed={active}
                                    className={[
                                      'role-option-button min-w-0 w-full max-w-full px-2 py-[0.44rem] text-left text-[0.68rem] leading-[1.08] whitespace-normal',
                                      active ? 'role-option-button-active' : '',
                                    ].join(' ')}
                                    style={getStyleVars(definition.key)}
                                    onClick={() => toggleRole(role)}
                                  >
                                    {definition.label}
                                  </button>
                                )
                              })}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>

                  {/* Navigation — right-aligned, same as Step 2 */}
                  <div className="mt-auto flex justify-end gap-2 pt-1">
                    <Button variant="primary" size="sm" onClick={() => prevCard && handleSaveAndNavigate(prevCard)} disabled={!prevCard}>
                      Anterior
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => nextCard && handleSaveAndNavigate(nextCard)} disabled={!nextCard}>
                      Siguiente
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
