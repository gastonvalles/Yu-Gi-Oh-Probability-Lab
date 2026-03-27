import { useMemo, useState, type CSSProperties } from 'react'

import { CARD_ROLE_DEFINITIONS } from '../app/deck-groups'
import { formatInteger } from '../app/utils'
import type { CardEntry, CardGroupKey, CardRole } from '../types'
import { CardArt } from './CardArt'
import { StepHero } from './StepHero'

interface DeckRolesPanelProps {
  cards: CardEntry[]
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
}

type RoleFilterKey = 'all' | 'unclassified' | CardGroupKey

interface RoleOverviewItem {
  key: RoleFilterKey
  label: string
  description: string
  cards: CardEntry[]
  copies: number
  styleKey: 'all' | 'unclassified' | CardGroupKey
}

const ROLE_THEME: Record<'all' | 'unclassified' | CardGroupKey, { color: string; rgb: string }> = {
  all: { color: 'var(--primary)', rgb: 'var(--primary-rgb)' },
  unclassified: { color: 'var(--warning)', rgb: 'var(--warning-rgb)' },
  starter: { color: 'var(--starter)', rgb: 'var(--starter-rgb)' },
  extender: { color: 'var(--extender)', rgb: 'var(--extender-rgb)' },
  brick: { color: 'var(--brick)', rgb: 'var(--brick-rgb)' },
  handtrap: { color: 'var(--handtrap)', rgb: 'var(--handtrap-rgb)' },
  boardbreaker: { color: 'var(--boardbreaker)', rgb: 'var(--boardbreaker-rgb)' },
  floodgate: { color: 'var(--floodgate)', rgb: 'var(--floodgate-rgb)' },
  engine: { color: 'var(--primary)', rgb: 'var(--primary-rgb)' },
  'non-engine': { color: 'var(--accent)', rgb: 'var(--accent-rgb)' },
}

function getRoleStyle(groupKey: 'all' | 'unclassified' | CardGroupKey): CSSProperties {
  const theme = ROLE_THEME[groupKey]

  return {
    '--role-color': theme.color,
    '--role-rgb': theme.rgb,
  } as CSSProperties
}

function getRoleFilterCardStyle(
  groupKey: 'all' | 'unclassified' | CardGroupKey,
  active: boolean,
): CSSProperties {
  return {
    ...getRoleStyle(groupKey),
    ...(active
      ? {
          borderColor: 'rgb(var(--role-rgb) / 0.72)',
          background:
            'linear-gradient(180deg, rgb(var(--role-rgb) / 0.16), rgb(var(--card-background-rgb) / 0.98)),' +
            'linear-gradient(180deg, rgb(var(--secondary-rgb) / 0.96), rgb(var(--background-rgb) / 0.98))',
          boxShadow:
            '0 0 0 1px rgb(var(--role-rgb) / 0.12), 0 0 26px rgb(var(--role-rgb) / 0.12)',
        }
      : {}),
  } as CSSProperties
}

function cardMatchesGroup(card: CardEntry, groupKey: CardGroupKey): boolean {
  if (groupKey === 'engine') {
    return card.roles.some((role) => role === 'starter' || role === 'extender' || role === 'brick')
  }

  if (groupKey === 'non-engine') {
    return card.roles.some(
      (role) => role === 'handtrap' || role === 'boardbreaker' || role === 'floodgate' || role === 'brick',
    )
  }

  return card.roles.includes(groupKey)
}

function getCardTypePriority(card: CardEntry): number {
  const cardType = card.apiCard?.cardType?.toLowerCase() ?? ''
  const frameType = card.apiCard?.frameType?.toLowerCase() ?? ''

  if (cardType.includes('spell') || frameType.includes('spell')) {
    return 1
  }

  if (cardType.includes('trap') || frameType.includes('trap')) {
    return 2
  }

  return 0
}

function getCardTypeLabel(card: CardEntry): string {
  const priority = getCardTypePriority(card)

  if (priority === 1) {
    return 'Magia'
  }

  if (priority === 2) {
    return 'Trampa'
  }

  return 'Monstruo'
}

function buildOverviewItem(
  key: RoleFilterKey,
  label: string,
  description: string,
  cards: CardEntry[],
  styleKey: 'all' | 'unclassified' | CardGroupKey,
): RoleOverviewItem {
  return {
    key,
    label,
    description,
    cards,
    copies: cards.reduce((total, card) => total + card.copies, 0),
    styleKey,
  }
}

function getEmptyStateCopy(filterKey: RoleFilterKey): { title: string; description: string; tone: string } {
  if (filterKey === 'unclassified') {
    return {
      title: 'Todo el Main Deck ya tiene rol asignado.',
      description: 'Podés repasar cualquier grupo desde arriba o ajustar cartas puntuales cuando cambie tu lista.',
      tone: 'surface-card-success text-(--accent)',
    }
  }

  if (filterKey === 'all') {
    return {
      title: 'Todavía no hay cartas para clasificar.',
      description: 'Primero armá o importá tu Main Deck. Después vas a poder marcar cada rol.',
      tone: 'surface-card text-(--text-muted)',
    }
  }

  return {
    title: 'Este grupo todavía está vacío.',
    description: 'Marcá cartas en la cola de clasificación para empezar a poblar este rol.',
    tone: 'surface-card text-(--text-muted)',
  }
}

function DisclosureSummary({
  pill,
  title,
}: {
  pill: string
  title: string
}) {
  return (
    <summary className="section-disclosure-summary">
      <span className="section-disclosure-title">
        <span className="step-hero-pill px-2 py-[0.18rem] text-[0.64rem] font-semibold uppercase tracking-widest">
          {pill}
        </span>
        <strong className="text-[0.78rem] font-semibold text-(--text-main)">{title}</strong>
      </span>
      <span className="details-arrow section-disclosure-arrow text-[0.74rem] text-(--text-soft)">▶</span>
    </summary>
  )
}

export function DeckRolesPanel({ cards, onToggleRole }: DeckRolesPanelProps) {
  const [activeFilter, setActiveFilter] = useState<RoleFilterKey>(() =>
    cards.some((card) => card.roles.length === 0) ? 'unclassified' : 'all',
  )
  const sortedCards = useMemo(
    () =>
      [...cards].sort((left, right) => {
        const typeDelta = getCardTypePriority(left) - getCardTypePriority(right)

        return typeDelta !== 0
          ? typeDelta
          : right.copies - left.copies || left.name.localeCompare(right.name)
      }),
    [cards],
  )
  const unclassifiedCards = useMemo(
    () => sortedCards.filter((card) => card.roles.length === 0),
    [sortedCards],
  )
  const overviewItems = useMemo(() => {
    const roleItems = CARD_ROLE_DEFINITIONS.map((definition) =>
      buildOverviewItem(
        definition.key,
        definition.label,
        definition.description,
        sortedCards.filter((card) => cardMatchesGroup(card, definition.key)),
        definition.key,
      ),
    )

    return [
      buildOverviewItem(
        'all',
        'Todo el Main',
        'Vista general de todas las cartas que ya cargaste en el deck.',
        sortedCards,
        'all',
      ),
      buildOverviewItem(
        'unclassified',
        'Sin clasificar',
        'Empezá por estas cartas: todavía no tienen rol asignado.',
        unclassifiedCards,
        'unclassified',
      ),
      ...roleItems,
    ]
  }, [sortedCards, unclassifiedCards])
  const activeOverview =
    overviewItems.find((item) => item.key === activeFilter) ?? overviewItems[0] ?? null
  const filteredCards = activeOverview?.cards ?? []
  const roleDefinitionByKey = useMemo(
    () => new Map(CARD_ROLE_DEFINITIONS.map((definition) => [definition.key, definition])),
    [],
  )
  const roleReferenceSections = [
    {
      key: 'engine' as const,
      label: 'Engine',
      description: 'Son las cartas que forman el motor del deck: arrancan, extienden o aparecen como piezas incómodas del propio engine.',
      roles: ['starter', 'extender', 'brick'] as const,
      styleKey: 'engine' as const,
    },
    {
      key: 'non-engine' as const,
      label: 'Non-engine',
      description: 'Son las cartas de interacción, utilidad o castigo al robo. Acá también entran los bricks porque no querés verlos solos.',
      roles: ['handtrap', 'boardbreaker', 'floodgate', 'brick'] as const,
      styleKey: 'non-engine' as const,
    }
  ]
  const emptyStateCopy = getEmptyStateCopy(activeFilter)
  const scrollListClassName =
    'grid gap-2 overflow-y-auto overflow-x-hidden pr-1 max-h-[68vh] min-[1180px]:max-h-[760px] min-[1320px]:min-h-0 min-[1320px]:max-h-none min-[1680px]:grid-cols-2'

  return (
    <section className="surface-panel grid h-full min-h-0 gap-3 p-2.5 min-[1320px]:grid-rows-[auto_auto_minmax(0,1fr)]">
      <div className="grid h-full min-h-0 gap-3">
        <StepHero
          step="Paso 2"
          pill="Grouping"
          title="Agrupá el deck por función real"
          description="Clasificá las cartas de tu lista. Cada rol representa una función específica en el deck."
        />

        <details className="details-toggle section-disclosure surface-panel-soft p-2.5">
          <DisclosureSummary pill="Roles" title="" />

          <div className="mt-2 grid gap-2 min-[980px]:grid-cols-2">
            {roleReferenceSections.map((section) => (
              <article
                key={section.key}
                className="role-reference-group grid gap-2 p-2.5"
                style={getRoleStyle(section.styleKey)}
              >
                <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <span className="role-reference-mark shrink-0" />
                    <strong className="text-[0.9rem] leading-none text-(--text-main)">
                      {section.label}
                    </strong>
                  </div>
                  <p className="app-muted m-0 text-[0.73rem] leading-[1.14]">
                    {section.description}
                  </p>
                </div>

                <div className="grid gap-1.5">
                  {section.roles.map((roleKey) => {
                    const definition = roleDefinitionByKey.get(roleKey)

                    if (!definition) {
                      return null
                    }

                    return (
                      <article
                        key={`${section.key}-${definition.key}`}
                        className="role-reference-card grid gap-1 px-2 py-2"
                        style={getRoleStyle(definition.key)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="role-reference-mark shrink-0" />
                          <strong className="block text-[0.8rem] leading-none text-(--text-main)">
                            {definition.label}
                          </strong>
                        </div>
                        <p className="app-muted m-0 text-[0.72rem] leading-[1.14]">
                          {definition.description}
                          {definition.key === 'brick' ? ' Cuenta dentro de ambos grupos lógicos.' : ''}
                        </p>
                      </article>
                    )
                  })}
                </div>
              </article>
            ))}
          </div>
        </details>

        {sortedCards.length === 0 ? (
          <p className="surface-card m-0 px-2 py-2 text-[0.8rem] text-(--text-muted)">
            Primero armá o importá tu Main Deck. Después vas a poder clasificar cada carta.
          </p>
        ) : (
          <div className="grid min-h-0 gap-3 min-[1320px]:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] min-[1320px]:items-start">
            <div className="surface-panel-soft grid gap-2.5 p-2.5 min-[1320px]:h-full min-[1320px]:min-h-0 min-[1320px]:grid-rows-[auto_minmax(0,1fr)]">
              <div className="min-w-0">
                <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Cola de clasificación</p>
                <h3 className="m-[0.2rem_0_0] text-[1rem] leading-none">
                  {activeOverview?.label ?? 'Cartas del Main Deck'}
                </h3>
                <p className="app-muted m-[0.28rem_0_0] max-w-[64ch] text-[0.76rem] leading-[1.16]">
                  {activeOverview?.description ?? 'Revisá tus cartas y marcá el rol que cumplen cuando las robás.'}
                </p>
              </div>

              {filteredCards.length === 0 ? (
                <p className={[emptyStateCopy.tone, 'm-0 px-2.5 py-2 text-[0.8rem]'].join(' ')}>
                  <strong className="block text-(--text-main)">{emptyStateCopy.title}</strong>
                  <span className="mt-1 block">{emptyStateCopy.description}</span>
                </p>
              ) : (
                <div className={scrollListClassName}>
                  {filteredCards.map((card) => (
                    <article
                      key={card.id}
                      className="surface-card grid gap-2 p-2 max-[859px]:grid-cols-[56px_minmax(0,1fr)] min-[860px]:grid-cols-[56px_minmax(0,1fr)]"
                    >
                      <div className="w-14">
                        <CardArt
                          remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
                          name={card.name}
                          className="block aspect-[0.72] w-full border border-(--border-subtle) bg-(--input) object-cover"
                          limitCard={card.apiCard}
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <div className="min-w-0">
                          <strong className="block truncate text-[0.92rem] leading-[1.1] text-(--text-main)">
                            {card.name}
                          </strong>
                          <small className="app-muted mt-[0.12rem] block text-[0.72rem]">
                            {formatInteger(card.copies)} copia{card.copies === 1 ? '' : 's'} en Main Deck · {getCardTypeLabel(card)}
                          </small>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {CARD_ROLE_DEFINITIONS.map((definition) => {
                            const active = card.roles.includes(definition.key)

                            return (
                              <button
                                key={definition.key}
                                type="button"
                                className={[
                                  'role-option-button px-1.75 py-[0.34rem] text-[0.68rem] leading-none whitespace-nowrap',
                                  active ? 'role-option-button-active' : '',
                                ].join(' ')}
                                style={getRoleStyle(definition.key)}
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
              )}
            </div>

            <details className="details-toggle section-disclosure surface-panel-soft self-start p-2.5">
              <DisclosureSummary pill="Grupos" title="" />

              <div className="mt-2 grid gap-2.5">
                <div className="grid grid-cols-2 gap-2 min-[1500px]:grid-cols-3">
                  {overviewItems.map((item) => {
                    const previewCards = item.cards.slice(0, 4)
                    const active = activeOverview?.key === item.key

                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={[
                          'app-role-filter-card grid gap-1.5 p-2.5 text-left min-[760px]:gap-2 min-[760px]:p-3',
                          active ? 'app-role-filter-card-active' : '',
                        ].join(' ')}
                        style={getRoleFilterCardStyle(item.styleKey, active)}
                        onClick={() => setActiveFilter(item.key)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="app-muted block text-[0.68rem] uppercase tracking-widest">
                              {item.label}
                            </span>
                            <strong className="mt-1 block text-[1.12rem] leading-none text-(--text-main) min-[760px]:text-[1.36rem]">
                              {formatInteger(item.cards.length)}
                            </strong>
                            <small className="app-soft text-[0.72rem]">
                              {formatInteger(item.copies)} copia{item.copies === 1 ? '' : 's'}
                            </small>
                          </div>

                          {active ? (
                            <span
                              className="app-role-chip hidden px-1.5 py-0.5 text-[0.66rem] min-[760px]:inline-flex"
                              style={getRoleStyle(item.styleKey)}
                            >
                              Viendo
                            </span>
                          ) : null}
                        </div>

                        <p className="app-muted m-0 hidden min-h-[2.3rem] text-[0.73rem] leading-[1.12] min-[760px]:block">
                          {item.description}
                        </p>

                        <div className="flex min-h-8.5 items-end min-[760px]:min-h-11">
                          {previewCards.length > 0 ? (
                            previewCards.map((card, index) => (
                              <div
                                key={card.id}
                                className={[
                                  'w-6 shrink-0 overflow-hidden border border-(--border-subtle) bg-(--input) min-[760px]:w-8.5',
                                  index === 0 ? '' : '-ml-1.5 min-[760px]:-ml-2.5',
                                ].join(' ')}
                              >
                                <CardArt
                                  remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
                                  name={card.name}
                                  className="block aspect-[0.72] w-full object-cover"
                                />
                              </div>
                            ))
                          ) : (
                            <div className="app-soft flex h-8.5 w-full items-center justify-center border border-dashed border-(--border-subtle) text-[0.68rem] min-[760px]:h-11 min-[760px]:text-[0.72rem]">
                              Vacío por ahora
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </section>
  )
}
