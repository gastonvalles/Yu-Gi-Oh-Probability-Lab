import { useMemo } from 'react'

import { buildDeckRoleSummary, CARD_ROLE_DEFINITIONS } from '../app/deck-groups'
import { formatInteger } from '../app/utils'
import type { CardEntry, CardRole } from '../types'
import { CardArt } from './CardArt'

interface DeckRolesPanelProps {
  cards: CardEntry[]
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
}

export function DeckRolesPanel({ cards, onToggleRole }: DeckRolesPanelProps) {
  const sortedCards = useMemo(
    () => [...cards].sort((left, right) => right.copies - left.copies || left.name.localeCompare(right.name)),
    [cards],
  )
  const summaryItems = useMemo(() => buildDeckRoleSummary(cards), [cards])
  const scrollListClassName =
    'grid gap-2 overflow-y-auto overflow-x-hidden pr-1 max-h-[62vh] min-[1180px]:max-h-[720px]'

  return (
    <section className="surface-panel p-2.5">
      <div className="grid gap-2">
        <div className="surface-card grid gap-1 px-2 py-1.5">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Paso 2</p>
          <div className="flex items-start justify-between gap-3 max-[760px]:flex-col max-[760px]:items-stretch">
            <div className="min-w-0">
              <h2 className="m-0 text-[1rem] leading-none">¿Qué hace cada carta en tu deck?</h2>
              <p className="app-muted m-[0.28rem_0_0] max-w-[74ch] text-[0.78rem] leading-[1.18]">
                Marcá para qué sirve cada carta cuando la robás. Después vas a poder medir cosas reales como abrir starter, non-engine o evitar bricks.
              </p>
            </div>

            <span className="app-chip-accent self-start px-2 py-1 text-[0.76rem] whitespace-nowrap">
              Cartas únicas: {formatInteger(sortedCards.length)}
            </span>
          </div>
        </div>

        <details className="surface-card p-2">
          <summary className="cursor-pointer text-[0.76rem] text-[var(--text-main)]">Qué significa cada rol</summary>
          <div className="mt-2 grid gap-1.5 min-[920px]:grid-cols-2">
            {CARD_ROLE_DEFINITIONS.map((definition) => (
              <p key={definition.key} className="app-muted m-0 text-[0.76rem] leading-[1.18]">
                <strong className="text-[var(--text-main)]">{definition.label}:</strong> {definition.description}
              </p>
            ))}
          </div>
          <p className="app-muted m-[0.4rem_0_0] text-[0.76rem] leading-[1.18]">
            `Non-engine` se calcula solo a partir de Handtraps, Boardbreakers y Floodgates.
          </p>
        </details>

        {summaryItems.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {summaryItems.map((group) => (
              <span
                key={group.key}
                className="app-chip-accent inline-flex items-center gap-1.5 px-2 py-1 text-[0.76rem]"
              >
                {group.label}
                <strong>{formatInteger(group.copies)}</strong>
              </span>
            ))}
          </div>
        ) : (
          <p className="surface-card m-0 px-2 py-1.5 text-[0.78rem] text-[var(--text-muted)]">
            Todavía no marcaste ningún rol. Empezá por los starters del deck.
          </p>
        )}

        {sortedCards.length === 0 ? (
          <p className="surface-card m-0 px-2 py-2 text-[0.8rem] text-[var(--text-muted)]">
            Primero armá o importá tu Main Deck. Después vas a poder clasificar cada carta.
          </p>
        ) : (
          <div className="surface-panel-soft p-2">
            <div className={scrollListClassName}>
              {sortedCards.map((card) => (
                <article
                  key={card.id}
                  className="surface-card grid gap-2 p-2 max-[760px]:grid-cols-[76px_minmax(0,1fr)] min-[761px]:grid-cols-[62px_minmax(0,1fr)]"
                >
                  <div className="max-[760px]:w-[76px] min-[761px]:max-w-[62px]">
                    <CardArt
                      remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
                      name={card.name}
                      className="block aspect-[0.72] w-full border border-[var(--border-subtle)] bg-[#050505] object-cover"
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <strong className="block truncate">{card.name}</strong>
                        <small className="app-muted text-[0.72rem]">
                          {formatInteger(card.copies)} copia{card.copies === 1 ? '' : 's'} en Main Deck
                        </small>
                      </div>

                      <span className="app-chip px-2 py-1 text-[0.72rem] max-[760px]:hidden">
                        Podés marcar más de un rol
                      </span>
                    </div>

                    <div className="max-[760px]:hidden flex flex-wrap gap-1.5">
                      {CARD_ROLE_DEFINITIONS.map((definition) => {
                        const active = card.roles.includes(definition.key)

                        return (
                          <button
                            key={definition.key}
                            type="button"
                            className={[
                              'px-2 py-1 text-[0.76rem] transition-colors',
                              active
                                ? 'app-button app-button-primary text-white'
                                : 'app-button text-[var(--text-muted)]',
                            ].join(' ')}
                            onClick={() => onToggleRole(card.apiCard?.ygoprodeckId ?? 0, definition.key)}
                          >
                            {definition.label}
                          </button>
                        )
                      })}
                    </div>

                    <div className="min-[761px]:hidden grid grid-cols-2 gap-1.5">
                      {CARD_ROLE_DEFINITIONS.map((definition) => {
                        const active = card.roles.includes(definition.key)

                        return (
                          <button
                            key={definition.key}
                            type="button"
                            className={[
                              'app-button px-2 py-1 text-[0.78rem] text-left',
                              active ? 'app-button-primary text-white' : 'text-[var(--text-muted)]',
                            ].join(' ')}
                            onClick={() => onToggleRole(card.apiCard?.ygoprodeckId ?? 0, definition.key)}
                          >
                            {definition.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
