import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import {
  areGroupKeysEqual,
  cardMatchesGroup,
  CARD_GROUP_DEFINITIONS,
  CARD_ORIGIN_DEFINITIONS,
  CARD_ROLE_DEFINITIONS,
  getDeckGroupTheme,
  serializeGroupKey,
} from '../app/deck-groups'
import {
  countCardsMissingOrigin,
  countCardsMissingRoles,
  isCardFullyClassified,
} from '../app/role-step'
import { formatInteger } from '../app/utils'
import type { CardEntry, CardGroupKey, CardOrigin, CardRole } from '../types'
import { CardArt } from './CardArt'
import { StepHero } from './StepHero'

interface DeckRolesPanelProps {
  cards: CardEntry[]
  onSetOrigin: (ygoprodeckId: number, origin: CardOrigin) => void
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
}

type ClassificationFilterKey = 'all' | 'unclassified' | CardGroupKey

interface ClassificationOverviewItem {
  key: ClassificationFilterKey
  label: string
  description: string
  cards: CardEntry[]
  copies: number
  styleKey: 'all' | 'unclassified' | CardGroupKey
}

const PANEL_THEME: Record<'all' | 'unclassified', { color: string; rgb: string }> = {
  all: { color: 'var(--primary)', rgb: 'var(--primary-rgb)' },
  unclassified: { color: 'var(--warning)', rgb: 'var(--warning-rgb)' },
}

const ROLE_REFERENCE_SECTIONS = [
  {
    title: 'Flow del plan',
    description: 'Describen cómo la carta arranca, habilita o convierte tu línea principal.',
    roles: ['starter', 'extender', 'enabler', 'searcher', 'draw', 'combo_piece', 'payoff', 'recovery'] as const,
  },
  {
    title: 'Interacción',
    description: 'Describen cómo la carta rompe, interrumpe o restringe al rival.',
    roles: ['handtrap', 'disruption', 'boardbreaker', 'floodgate', 'removal'] as const,
  },
  {
    title: 'Riesgo y slots flex',
    description: 'Describen cartas incómodas, condicionales o de metajuego.',
    roles: ['brick', 'garnet', 'tech'] as const,
  },
] as const

function getClassificationStyle(
  groupKey: 'all' | 'unclassified' | CardGroupKey,
): CSSProperties {
  const theme = groupKey === 'all' || groupKey === 'unclassified'
    ? PANEL_THEME[groupKey]
    : getDeckGroupTheme(groupKey)

  return {
    '--role-color': theme.color,
    '--role-rgb': theme.rgb,
  } as CSSProperties
}

function getClassificationFilterCardStyle(
  groupKey: 'all' | 'unclassified' | CardGroupKey,
  active: boolean,
): CSSProperties {
  return {
    ...getClassificationStyle(groupKey),
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

function areClassificationFilterKeysEqual(
  left: ClassificationFilterKey,
  right: ClassificationFilterKey,
): boolean {
  if (typeof left === 'string' || typeof right === 'string') {
    return left === right
  }

  return areGroupKeysEqual(left, right)
}

function getClassificationFilterReactKey(groupKey: ClassificationFilterKey): string {
  return typeof groupKey === 'string' ? groupKey : serializeGroupKey(groupKey)
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
  key: ClassificationFilterKey,
  label: string,
  description: string,
  cards: CardEntry[],
  styleKey: 'all' | 'unclassified' | CardGroupKey,
): ClassificationOverviewItem {
  return {
    key,
    label,
    description,
    cards,
    copies: cards.reduce((total, card) => total + card.copies, 0),
    styleKey,
  }
}

function getEmptyStateCopy(filterKey: ClassificationFilterKey): {
  title: string
  description: string
  tone: string
} {
  if (filterKey === 'unclassified') {
    return {
      title: 'Todas las cartas del Main Deck ya tienen origen y rol.',
      description: 'Podés repasar cualquier grupo desde arriba o ajustar cartas puntuales cuando cambie tu build.',
      tone: 'surface-card-success text-(--accent)',
    }
  }

  if (filterKey === 'all') {
    return {
      title: 'Todavía no hay cartas para clasificar.',
      description: 'Primero armá o importá tu Main Deck. Después vas a poder marcar origen y roles.',
      tone: 'surface-card text-(--text-muted)',
    }
  }

  return {
    title: 'Este grupo todavía está vacío.',
    description: 'Marcá orígenes y roles en la cola de clasificación para empezar a poblarlo.',
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

function getCardClassificationCopy(card: CardEntry): string {
  const originLabel =
    card.origin === 'engine'
      ? 'Engine'
      : card.origin === 'non_engine'
        ? 'Non-engine'
        : card.origin === 'hybrid'
          ? 'Hybrid / Flex'
          : 'Sin origen'
  const roleCount = card.roles.length

  if (isCardFullyClassified(card)) {
    return `${originLabel} · ${formatInteger(roleCount)} rol${roleCount === 1 ? '' : 'es'}`
  }

  if (card.needsReview && card.origin !== null && roleCount > 0) {
    return `${originLabel} · pendiente de revisión`
  }

  if (card.origin === null && roleCount === 0) {
    return 'Falta origen y falta al menos un rol.'
  }

  if (card.origin === null) {
    return `${formatInteger(roleCount)} rol${roleCount === 1 ? '' : 'es'} · falta origen`
  }

  return `${originLabel} · falta al menos un rol`
}

function renderReferenceRoles(roleKeys: readonly CardRole[]) {
  return roleKeys.map((roleKey) => {
    const definition = CARD_ROLE_DEFINITIONS.find((role) => role.key.value === roleKey)

    if (!definition) {
      return null
    }

    return (
      <article
        key={serializeGroupKey(definition.key)}
        className="role-reference-card grid gap-1 px-2 py-2"
        style={getClassificationStyle(definition.key)}
      >
        <div className="flex items-center gap-2">
          <span className="role-reference-mark shrink-0" />
          <strong className="block text-[0.8rem] leading-none text-(--text-main)">
            {definition.label}
          </strong>
        </div>
        <p className="app-muted m-0 text-[0.72rem] leading-[1.14]">{definition.description}</p>
      </article>
    )
  })
}

export function DeckRolesPanel({
  cards,
  onSetOrigin,
  onToggleRole,
}: DeckRolesPanelProps) {
  const [activeFilter, setActiveFilter] = useState<ClassificationFilterKey>(() =>
    cards.some((card) => !isCardFullyClassified(card)) ? 'unclassified' : 'all',
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
    () => sortedCards.filter((card) => !isCardFullyClassified(card)),
    [sortedCards],
  )
  const missingOriginCount = useMemo(() => countCardsMissingOrigin(sortedCards), [sortedCards])
  const missingRoleCount = useMemo(() => countCardsMissingRoles(sortedCards), [sortedCards])
  const overviewItems = useMemo(() => {
    const groupItems = CARD_GROUP_DEFINITIONS.map((definition) =>
      buildOverviewItem(
        definition.key,
        definition.label,
        definition.description,
        sortedCards.filter((card) => cardMatchesGroup(card, definition.key)),
        definition.key,
      ),
    ).filter((item) => item.cards.length > 0 || areClassificationFilterKeysEqual(item.key, activeFilter))

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
        'Sin completar',
        'Empezá por estas cartas: todavía les falta origen, rol o tienen clasificación pendiente de revisión.',
        unclassifiedCards,
        'unclassified',
      ),
      ...groupItems,
    ]
  }, [activeFilter, sortedCards, unclassifiedCards])
  const activeOverview =
    overviewItems.find((item) => areClassificationFilterKeysEqual(item.key, activeFilter)) ??
    overviewItems[0] ??
    null
  const filteredCards = activeOverview?.cards ?? []
  const emptyStateCopy = getEmptyStateCopy(activeFilter)
  const scrollListClassName =
    'grid gap-2 overflow-y-auto overflow-x-hidden pr-1 max-h-[68vh] min-[1180px]:max-h-[760px] min-[1320px]:min-h-0 min-[1320px]:max-h-none'

  useEffect(() => {
    if (overviewItems.some((item) => areClassificationFilterKeysEqual(item.key, activeFilter))) {
      return
    }

    setActiveFilter(unclassifiedCards.length > 0 ? 'unclassified' : 'all')
  }, [activeFilter, overviewItems, unclassifiedCards.length])

  return (
    <section className="surface-panel grid h-full min-h-0 gap-3 p-2.5 min-[1320px]:grid-rows-[auto_auto_minmax(0,1fr)]">
      <div className="grid h-full min-h-0 gap-3">
        <StepHero
          step="Paso 2"
          pill="Categorization"
          title="Clasificá por origen y función"
          description="Cada carta del Main Deck necesita dos decisiones separadas: de qué espacio del deck viene y qué rol cumple cuando la robás."
        />

        <details className="details-toggle section-disclosure surface-panel-soft p-2.5">
          <DisclosureSummary pill="Modelo" title="" />

          <div className="mt-2 grid gap-3">
            <div className="grid gap-2">
              <div>
                <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Origen</p>
                <p className="app-muted m-[0.22rem_0_0] max-w-[72ch] text-[0.74rem] leading-[1.16]">
                  Responde si la carta pertenece al motor principal del deck o si ocupa un espacio externo/flexible.
                </p>
              </div>

              <div className="grid gap-2 min-[980px]:grid-cols-3">
                {CARD_ORIGIN_DEFINITIONS.map((definition) => (
                  <article
                    key={serializeGroupKey(definition.key)}
                    className="role-reference-group grid gap-2 p-2.5"
                    style={getClassificationStyle(definition.key)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="role-reference-mark shrink-0" />
                      <strong className="text-[0.9rem] leading-none text-(--text-main)">
                        {definition.label}
                      </strong>
                    </div>
                    <p className="app-muted m-0 text-[0.73rem] leading-[1.14]">{definition.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <div>
                <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Roles</p>
                <p className="app-muted m-[0.22rem_0_0] max-w-[72ch] text-[0.74rem] leading-[1.16]">
                  Responden qué hace la carta dentro de tu mano, tu línea o tu plan de turno.
                </p>
              </div>

              <div className="grid gap-2 min-[1180px]:grid-cols-3">
                {ROLE_REFERENCE_SECTIONS.map((section) => (
                  <article key={section.title} className="role-reference-group grid gap-2 p-2.5">
                    <div className="grid gap-1">
                      <strong className="text-[0.88rem] leading-none text-(--text-main)">
                        {section.title}
                      </strong>
                      <p className="app-muted m-0 text-[0.73rem] leading-[1.14]">{section.description}</p>
                    </div>

                    <div className="grid gap-1.5">{renderReferenceRoles(section.roles)}</div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </details>

        {sortedCards.length === 0 ? (
          <p className="surface-card m-0 px-2 py-2 text-[0.8rem] text-(--text-muted)">
            Primero armá o importá tu Main Deck. Después vas a poder clasificar cada carta.
          </p>
        ) : (
          <div className="grid min-h-0 gap-3 min-[1320px]:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] min-[1320px]:items-start">
            <div className="surface-panel-soft grid gap-2.5 p-2.5 min-[1320px]:h-full min-[1320px]:min-h-0 min-[1320px]:grid-rows-[auto_minmax(0,1fr)]">
              <div className="grid gap-2">
                <div className="min-w-0">
                  <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Cola de clasificación</p>
                  <h3 className="m-[0.2rem_0_0] text-[1rem] leading-none">
                    {activeOverview?.label ?? 'Cartas del Main Deck'}
                  </h3>
                  <p className="app-muted m-[0.28rem_0_0] max-w-[64ch] text-[0.76rem] leading-[1.16]">
                    {activeOverview?.description ?? 'Revisá tus cartas y separá origen de función.'}
                  </p>
                </div>

                <div className="grid gap-2 min-[920px]:grid-cols-3">
                  <article className="surface-card px-2.5 py-2">
                    <span className="app-muted block text-[0.68rem] uppercase tracking-widest">Total</span>
                    <strong className="mt-1 block text-[1rem] leading-none text-(--text-main)">
                      {formatInteger(sortedCards.length)}
                    </strong>
                    <small className="app-soft text-[0.72rem]">
                      {formatInteger(sortedCards.reduce((total, card) => total + card.copies, 0))} copias
                    </small>
                  </article>

                  <article className="surface-card-warning px-2.5 py-2 text-(--warning)">
                    <span className="block text-[0.68rem] uppercase tracking-widest">Sin origen</span>
                    <strong className="mt-1 block text-[1rem] leading-none text-(--text-main)">
                      {formatInteger(missingOriginCount)}
                    </strong>
                    <small className="text-[0.72rem] text-(--text-soft)">Falta pertenencia al deck.</small>
                  </article>

                  <article className="surface-card-warning px-2.5 py-2 text-(--warning)">
                    <span className="block text-[0.68rem] uppercase tracking-widest">Sin rol</span>
                    <strong className="mt-1 block text-[1rem] leading-none text-(--text-main)">
                      {formatInteger(missingRoleCount)}
                    </strong>
                    <small className="text-[0.72rem] text-(--text-soft)">Falta función táctica.</small>
                  </article>
                </div>
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

                      <div className="grid gap-2">
                        <div className="min-w-0">
                          <strong className="block truncate text-[0.92rem] leading-[1.1] text-(--text-main)">
                            {card.name}
                          </strong>
                          <small className="app-muted mt-[0.12rem] block text-[0.72rem]">
                            {formatInteger(card.copies)} copia{card.copies === 1 ? '' : 's'} en Main Deck · {getCardTypeLabel(card)}
                          </small>
                          <span
                            className={[
                              'mt-1 inline-flex px-2 py-0.75 text-[0.7rem]',
                              isCardFullyClassified(card)
                                ? 'surface-card-success text-(--accent)'
                                : 'surface-card-warning text-(--warning)',
                            ].join(' ')}
                          >
                            {getCardClassificationCopy(card)}
                          </span>
                        </div>

                        <div className="grid gap-1.5">
                          <span className="app-muted text-[0.68rem] uppercase tracking-widest">Origen</span>
                          <div className="flex flex-wrap gap-1">
                            {CARD_ORIGIN_DEFINITIONS.map((definition) => {
                              const active = card.origin === definition.key.value

                              return (
                                <button
                                  key={serializeGroupKey(definition.key)}
                                  type="button"
                                  className={[
                                    'role-option-button px-1.75 py-[0.34rem] text-[0.68rem] leading-none whitespace-nowrap',
                                    active ? 'role-option-button-active' : '',
                                  ].join(' ')}
                                  style={getClassificationStyle(definition.key)}
                                  onClick={() => onSetOrigin(card.apiCard?.ygoprodeckId ?? 0, definition.key.value)}
                                >
                                  {definition.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <div className="grid gap-1.5">
                          <span className="app-muted text-[0.68rem] uppercase tracking-widest">Roles</span>
                          <div className="flex flex-wrap gap-1">
                            {CARD_ROLE_DEFINITIONS.map((definition) => {
                              const active = card.roles.includes(definition.key.value)

                              return (
                                <button
                                  key={serializeGroupKey(definition.key)}
                                  type="button"
                                  className={[
                                    'role-option-button px-1.75 py-[0.34rem] text-[0.68rem] leading-none whitespace-nowrap',
                                    active ? 'role-option-button-active' : '',
                                  ].join(' ')}
                                  style={getClassificationStyle(definition.key)}
                                  onClick={() => onToggleRole(card.apiCard?.ygoprodeckId ?? 0, definition.key.value)}
                                >
                                  {definition.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <details className="details-toggle section-disclosure surface-panel-soft self-start p-2.5">
              <DisclosureSummary pill="Filtros" title="" />

              <div className="mt-2 grid gap-2.5">
                <div className="grid grid-cols-2 gap-2 min-[1500px]:grid-cols-3">
                  {overviewItems.map((item) => {
                    const previewCards = item.cards.slice(0, 4)
                    const active = activeOverview ? areClassificationFilterKeysEqual(activeOverview.key, item.key) : false

                    return (
                      <button
                        key={getClassificationFilterReactKey(item.key)}
                        type="button"
                        className={[
                          'app-role-filter-card grid gap-1.5 p-2.5 text-left min-[760px]:gap-2 min-[760px]:p-3',
                          active ? 'app-role-filter-card-active' : '',
                        ].join(' ')}
                        style={getClassificationFilterCardStyle(item.styleKey, active)}
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
                              style={getClassificationStyle(item.styleKey)}
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
