import { useState } from 'react'

import {
  buildDerivedDeckAttackValues,
  buildDerivedDeckAttributes,
  buildDerivedDeckDefenseValues,
  buildDerivedDeckLevels,
  buildDerivedDeckMonsterTypes,
  type DerivedDeckAttribute,
  type DerivedDeckValueOption,
} from '../../app/card-attributes'
import {
  CARD_ORIGIN_DEFINITIONS,
  CARD_ROLE_DEFINITIONS,
} from '../../app/deck-groups'
import { createCardPoolMatcher } from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type {
  CardAttribute,
  CardEntry,
  Matcher,
  PatternRequirement,
  RequirementKind,
} from '../../types'
import { Button } from '../ui/Button'
import { CloseButton, CloseIcon } from '../ui/IconButton'
import {
  buildRequirementSummary,
  getMatcherEditorLabel,
  getMatcherEditorType,
  MATCHER_EDITOR_OPTIONS,
  type MatcherEditorType,
} from './pattern-helpers'
import type { PatternEditorActions } from './pattern-editor-actions'

interface RequirementRowProps {
  index: number
  patternId: string
  requirement: PatternRequirement
  derivedMainCards: CardEntry[]
  actions: PatternEditorActions
}

export function RequirementRow({
  index,
  patternId,
  requirement,
  derivedMainCards,
  actions,
}: RequirementRowProps) {
  const [nextPoolCardId, setNextPoolCardId] = useState('')
  const matcherType = getMatcherEditorType(requirement.matcher)
  const selectedCardIds = getSelectedCardIds(requirement.matcher)
  const selectedCards = selectedCardIds
    .map((cardId) => derivedMainCards.find((card) => card.id === cardId))
    .filter((card): card is CardEntry => Boolean(card))
  const selectedRole = requirement.matcher?.type === 'role' ? requirement.matcher.value : null
  const selectedOrigin = requirement.matcher?.type === 'origin' ? requirement.matcher.value : null
  const selectedAttribute = requirement.matcher?.type === 'attribute' ? requirement.matcher.value : null
  const selectedLevel = requirement.matcher?.type === 'level' ? requirement.matcher.value : null
  const selectedMonsterType = requirement.matcher?.type === 'monster_type' ? requirement.matcher.value : null
  const selectedAtk = requirement.matcher?.type === 'atk' ? requirement.matcher.value : null
  const selectedDef = requirement.matcher?.type === 'def' ? requirement.matcher.value : null

  const roleOptions = CARD_ROLE_DEFINITIONS
    .map((definition) => ({
      copies: countCardsMatchingMatcher(derivedMainCards, definition.key),
      label: definition.label,
      value: definition.key.value,
    }))
    .filter((option) => option.copies > 0 || option.value === selectedRole)
  const originOptions = CARD_ORIGIN_DEFINITIONS
    .map((definition) => ({
      copies: countCardsMatchingMatcher(derivedMainCards, definition.key),
      label: definition.label,
      value: definition.key.value,
    }))
    .filter((option) => option.copies > 0 || option.value === selectedOrigin)
  const attributeOptions = buildDerivedDeckAttributes(derivedMainCards).filter(
    (attribute) => attribute.copies > 0 || attribute.key === selectedAttribute,
  )
  const levelOptions = buildDerivedDeckLevels(derivedMainCards).filter(
    (level) => level.copies > 0 || level.key === selectedLevel,
  )
  const monsterTypeOptions = buildDerivedDeckMonsterTypes(derivedMainCards).filter(
    (monsterType) => monsterType.copies > 0 || monsterType.key === selectedMonsterType,
  )
  const atkOptions = buildDerivedDeckAttackValues(derivedMainCards).filter(
    (atk) => atk.copies > 0 || atk.key === selectedAtk,
  )
  const defOptions = buildDerivedDeckDefenseValues(derivedMainCards).filter(
    (def) => def.copies > 0 || def.key === selectedDef,
  )
  const availablePoolCards = derivedMainCards.filter((card) => !selectedCardIds.includes(card.id))
  const matcherTypeDescription =
    MATCHER_EDITOR_OPTIONS.find((option) => option.value === matcherType)?.description ?? ''
  const matcherDetails = buildMatcherDetails(
    matcherType,
    requirement.matcher,
    selectedCards,
    roleOptions,
    originOptions,
    attributeOptions,
    levelOptions,
    monsterTypeOptions,
    atkOptions,
    defOptions,
  )
  const matcherWarning = buildMatcherWarning(
    matcherType,
    requirement.matcher,
    selectedCards,
    matcherDetails.length > 0,
  )
  const showsDistinctToggle = requirement.quantity > 1 && matcherType !== 'card'

  const setMatcher = (matcher: Matcher | null) => {
    actions.setRequirementMatcher(patternId, requirement.id, matcher)
  }

  const handleMatcherTypeChange = (nextType: MatcherEditorType) => {
    const nextMatcher = buildDefaultMatcherForType(nextType, requirement.matcher, {
      attributeOptions,
      atkOptions,
      defOptions,
      derivedMainCards,
      levelOptions,
      monsterTypeOptions,
      originOptions,
      roleOptions,
      selectedCardIds,
    })

    setMatcher(nextMatcher)

    if (nextType === 'card' && requirement.distinct) {
      actions.setRequirementDistinct(patternId, requirement.id, false)
    }
  }

  return (
    <article tabIndex={0} className="condition-card surface-card grid gap-3 p-2.5 outline-none">
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <strong className="text-[0.78rem] text-(--text-main)">Condición {index + 1}</strong>
            <span className="app-chip px-1.5 py-0.5 text-[0.68rem]">
              {getMatcherEditorLabel(matcherType)}
            </span>
          </div>
          <p className="app-muted m-0 text-[0.76rem] leading-[1.16]">
            {buildRequirementSummary(requirement, selectedCards)}
          </p>
        </div>
        <CloseButton
          size="sm"
          className="shrink-0"
          aria-label={`Borrar condición ${index + 1}`}
          onClick={() => actions.removeRequirement(patternId, requirement.id)}
        />
      </div>

      <div className="grid gap-2 min-[1080px]:grid-cols-[minmax(0,1fr)_100px] min-[1080px]:items-end">
        <label className="grid w-full gap-1">
          <span className="app-muted text-[0.68rem] uppercase tracking-widest">La mano</span>
          <select
            value={requirement.kind}
            onChange={(event) =>
              actions.setRequirementKind(patternId, requirement.id, event.target.value as RequirementKind)
            }
            className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
          >
            <option value="include">Debe incluir</option>
            <option value="exclude">No debe incluir</option>
          </select>
        </label>

        <label className="grid w-full gap-1 min-[1080px]:max-w-25">
          <span className="app-muted text-[0.68rem] uppercase tracking-widest">Cantidad</span>
          <input
            type="number"
            min={1}
            value={requirement.quantity}
            onChange={(event) => actions.setRequirementCount(patternId, requirement.id, event.target.value)}
            className="app-field w-full px-2 py-[0.45rem] text-center text-[0.84rem]"
          />
        </label>
      </div>

      <div className="surface-panel-soft grid gap-2 p-2">
        <div className="grid gap-2 min-[1080px]:grid-cols-[180px_minmax(0,1fr)] min-[1080px]:items-end">
          <label className="grid gap-1">
            <span className="app-muted text-[0.68rem] uppercase tracking-widest">Tipo de matcher</span>
            <select
              value={matcherType}
              onChange={(event) => handleMatcherTypeChange(event.target.value as MatcherEditorType)}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              {MATCHER_EDITOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="app-soft text-[0.72rem] leading-[1.14]">{matcherTypeDescription}</span>
          </label>

          <label className="grid gap-1">
            <span className="app-muted text-[0.68rem] uppercase tracking-widest">Valor del matcher</span>
            {matcherType === 'role' ? (
              <select
                value={selectedRole ?? ''}
                onChange={(event) =>
                  setMatcher(event.target.value ? { type: 'role', value: event.target.value as typeof selectedRole & string } : null)
                }
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="">Elegir rol</option>
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} · {formatInteger(option.copies)}x
                  </option>
                ))}
              </select>
            ) : matcherType === 'origin' ? (
              <select
                value={selectedOrigin ?? ''}
                onChange={(event) =>
                  setMatcher(event.target.value ? { type: 'origin', value: event.target.value as typeof selectedOrigin & string } : null)
                }
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="">Elegir origen</option>
                {originOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} · {formatInteger(option.copies)}x
                  </option>
                ))}
              </select>
            ) : matcherType === 'card' ? (
              <select
                value={requirement.matcher?.type === 'card' ? requirement.matcher.value : selectedCardIds[0] ?? ''}
                onChange={(event) =>
                  setMatcher(event.target.value ? { type: 'card', value: event.target.value } : null)
                }
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="">Elegir carta</option>
                {derivedMainCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name} · {formatInteger(card.copies)}x
                  </option>
                ))}
              </select>
            ) : matcherType === 'card_pool' ? (
              <select
                value={nextPoolCardId}
                onChange={(event) => {
                  const { value } = event.target
                  setNextPoolCardId(value)

                  if (!value) {
                    return
                  }

                  const nextMatcher = createCardPoolMatcher([...selectedCardIds, value])
                  setMatcher(nextMatcher)
                  setNextPoolCardId('')
                }}
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="">Agregar carta al pool</option>
                {availablePoolCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name} · {formatInteger(card.copies)}x
                  </option>
                ))}
              </select>
            ) : matcherType === 'attribute' ? (
              <select
                value={selectedAttribute ?? ''}
                onChange={(event) =>
                  setMatcher(
                    event.target.value
                      ? { type: 'attribute', value: event.target.value as CardAttribute }
                      : null,
                  )
                }
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="">Elegir atributo</option>
                {attributeOptions.map((attribute) => (
                  <option key={attribute.key} value={attribute.key}>
                    {attribute.label} · {formatInteger(attribute.copies)}x
                  </option>
                ))}
              </select>
            ) : matcherType === 'level' ? (
              <select
                value={selectedLevel ?? ''}
                onChange={(event) =>
                  setMatcher(
                    event.target.value
                      ? { type: 'level', value: Number.parseInt(event.target.value, 10) }
                      : null,
                  )
                }
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="">Elegir nivel</option>
                {levelOptions.map((level) => (
                  <option key={level.key} value={level.key}>
                    Nivel {level.label} · {formatInteger(level.copies)}x
                  </option>
                ))}
              </select>
            ) : matcherType === 'monster_type' ? (
              <select
                value={selectedMonsterType ?? ''}
                onChange={(event) =>
                  setMatcher(
                    event.target.value
                      ? { type: 'monster_type', value: event.target.value }
                      : null,
                  )
                }
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="">Elegir tipo de monstruo</option>
                {monsterTypeOptions.map((monsterType) => (
                  <option key={monsterType.key} value={monsterType.key}>
                    {monsterType.label} · {formatInteger(monsterType.copies)}x
                  </option>
                ))}
              </select>
            ) : matcherType === 'atk' ? (
              <select
                value={selectedAtk ?? ''}
                onChange={(event) =>
                  setMatcher(
                    event.target.value
                      ? { type: 'atk', value: Number.parseInt(event.target.value, 10) }
                      : null,
                  )
                }
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="">Elegir ATK</option>
                {atkOptions.map((atk) => (
                  <option key={atk.key} value={atk.key}>
                    {atk.label} ATK · {formatInteger(atk.copies)}x
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedDef ?? ''}
                onChange={(event) =>
                  setMatcher(
                    event.target.value
                      ? { type: 'def', value: Number.parseInt(event.target.value, 10) }
                      : null,
                  )
                }
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="">Elegir DEF</option>
                {defOptions.map((def) => (
                  <option key={def.key} value={def.key}>
                    {def.label} DEF · {formatInteger(def.copies)}x
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        {matcherWarning ? (
          <p className="surface-card-warning m-0 px-2 py-1.5 text-[0.78rem] text-(--warning)">
            {matcherWarning}
          </p>
        ) : matcherDetails.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {matcherDetails.map((detail) => (
              <span
                key={detail}
                className="app-chip inline-flex items-center gap-1.5 px-2 py-1 text-[0.76rem]"
              >
                {detail}
              </span>
            ))}
          </div>
        ) : null}

        {matcherType === 'card_pool' && selectedCards.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedCards.map((card) => (
              <span
                key={card.id}
                className="app-chip inline-flex items-center gap-1.5 px-2 py-1 text-[0.76rem]"
              >
                {card.name}
                <button
                  type="button"
                  className="inline-flex h-[0.9rem] w-[0.9rem] items-center justify-center text-(--text-soft) transition-colors hover:text-(--text-main)"
                  onClick={() => setMatcher(createCardPoolMatcher(selectedCardIds.filter((cardId) => cardId !== card.id)))}
                >
                  <CloseIcon className="h-[0.68rem] w-[0.68rem]" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {showsDistinctToggle ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-2 px-2.5 py-2">
          <div className="grid gap-0.5">
            <span className="app-muted text-[0.68rem] uppercase tracking-widest">Modo de conteo</span>
            <span className="app-soft text-[0.74rem] leading-[1.16]">
              {requirement.distinct
                ? 'Cada nombre distinto cuenta una sola vez.'
                : 'Cada copia robada suma por separado.'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant={requirement.distinct ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => actions.setRequirementDistinct(patternId, requirement.id, false)}
            >
              Por copia
            </Button>
            <Button
              variant={requirement.distinct ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => actions.setRequirementDistinct(patternId, requirement.id, true)}
            >
              Por nombre
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  )
}

function getSelectedCardIds(matcher: Matcher | null): string[] {
  if (!matcher) {
    return []
  }

  if (matcher.type === 'card') {
    return [matcher.value]
  }

  if (matcher.type === 'card_pool') {
    return matcher.value
  }

  return []
}

function buildDefaultMatcherForType(
  type: MatcherEditorType,
  currentMatcher: Matcher | null,
  options: {
    attributeOptions: DerivedDeckAttribute[]
    atkOptions: DerivedDeckValueOption<number>[]
    defOptions: DerivedDeckValueOption<number>[]
    derivedMainCards: CardEntry[]
    levelOptions: DerivedDeckValueOption<number>[]
    monsterTypeOptions: DerivedDeckValueOption<string>[]
    originOptions: Array<{ copies: number; label: string; value: 'engine' | 'non_engine' | 'hybrid' }>
    roleOptions: Array<{ copies: number; label: string; value: CardEntry['roles'][number] }>
    selectedCardIds: string[]
  },
): Matcher | null {
  if (currentMatcher?.type === type) {
    return currentMatcher
  }

  switch (type) {
    case 'role':
      return options.roleOptions[0] ? { type: 'role', value: options.roleOptions[0].value } : null
    case 'origin':
      return options.originOptions[0] ? { type: 'origin', value: options.originOptions[0].value } : null
    case 'card':
      if (currentMatcher?.type === 'card_pool' && currentMatcher.value.length > 0) {
        return { type: 'card', value: currentMatcher.value[0] }
      }

      return options.selectedCardIds[0] || options.derivedMainCards[0]?.id
        ? {
            type: 'card',
            value: options.selectedCardIds[0] ?? options.derivedMainCards[0]?.id ?? '',
          }
        : null
    case 'card_pool':
      if (currentMatcher?.type === 'card') {
        return createCardPoolMatcher([currentMatcher.value])
      }

      return createCardPoolMatcher(options.selectedCardIds)
    case 'attribute':
      return options.attributeOptions[0] ? { type: 'attribute', value: options.attributeOptions[0].key } : null
    case 'level':
      return options.levelOptions[0] ? { type: 'level', value: options.levelOptions[0].key } : null
    case 'monster_type':
      return options.monsterTypeOptions[0]
        ? { type: 'monster_type', value: options.monsterTypeOptions[0].key }
        : null
    case 'atk':
      return options.atkOptions[0] ? { type: 'atk', value: options.atkOptions[0].key } : null
    case 'def':
      return options.defOptions[0] ? { type: 'def', value: options.defOptions[0].key } : null
    default:
      return null
  }
}

function buildMatcherWarning(
  matcherType: MatcherEditorType,
  matcher: Matcher | null,
  selectedCards: CardEntry[],
  hasMatches: boolean,
): string | null {
  if (!matcher) {
    return 'Esta condición todavía no tiene matcher definido.'
  }

  if (matcherType === 'card' && selectedCards.length === 0) {
    return 'La carta específica elegida ya no existe en el Main Deck.'
  }

  if (matcherType === 'card_pool' && selectedCards.length === 0) {
    return 'El pool está vacío. Agregá al menos una carta.'
  }

  if (hasMatches) {
    return null
  }

  if (matcherType === 'role' && matcher.type === 'role') {
    return `No hay cartas con rol ${CARD_ROLE_DEFINITIONS.find((entry) => entry.key.value === matcher.value)?.label ?? matcher.value} en el Main Deck.`
  }

  if (matcherType === 'origin' && matcher.type === 'origin') {
    return `No hay cartas con origen ${CARD_ORIGIN_DEFINITIONS.find((entry) => entry.key.value === matcher.value)?.label ?? matcher.value} en el Main Deck.`
  }

  if (matcherType === 'attribute' && matcher.type === 'attribute') {
    return `No hay monstruos con atributo ${matcher.value} en el Main Deck.`
  }

  if (matcherType === 'level' && matcher.type === 'level') {
    return `No hay monstruos de Nivel ${formatInteger(matcher.value)} en el Main Deck.`
  }

  if (matcherType === 'monster_type' && matcher.type === 'monster_type') {
    return `No hay monstruos de tipo ${matcher.value} en el Main Deck.`
  }

  if (matcherType === 'atk' && matcher.type === 'atk') {
    return `No hay monstruos con ${formatInteger(matcher.value)} ATK en el Main Deck.`
  }

  if (matcherType === 'def' && matcher.type === 'def') {
    return `No hay monstruos con ${formatInteger(matcher.value)} DEF en el Main Deck.`
  }

  return null
}

function buildMatcherDetails(
  matcherType: MatcherEditorType,
  matcher: Matcher | null,
  selectedCards: CardEntry[],
  roleOptions: Array<{ copies: number; label: string; value: string }>,
  originOptions: Array<{ copies: number; label: string; value: string }>,
  attributeOptions: DerivedDeckAttribute[],
  levelOptions: DerivedDeckValueOption<number>[],
  monsterTypeOptions: DerivedDeckValueOption<string>[],
  atkOptions: DerivedDeckValueOption<number>[],
  defOptions: DerivedDeckValueOption<number>[],
): string[] {
  if (!matcher) {
    return []
  }

  if (matcherType === 'role' && matcher.type === 'role') {
    const option = roleOptions.find((entry) => entry.value === matcher.value)
    return option ? [`Rol ${option.label} · ${formatInteger(option.copies)}x en el deck`] : []
  }

  if (matcherType === 'origin' && matcher.type === 'origin') {
    const option = originOptions.find((entry) => entry.value === matcher.value)
    return option ? [`Origen ${option.label} · ${formatInteger(option.copies)}x en el deck`] : []
  }

  if (matcherType === 'card' && selectedCards[0]) {
    return [`${selectedCards[0].name} · ${formatInteger(selectedCards[0].copies)}x en el deck`]
  }

  if (matcherType === 'card_pool' && selectedCards.length > 0) {
    const totalCopies = selectedCards.reduce((total, card) => total + card.copies, 0)
    return [
      `${formatInteger(selectedCards.length)} carta${selectedCards.length === 1 ? '' : 's'} en el pool`,
      `${formatInteger(totalCopies)} copia${totalCopies === 1 ? '' : 's'} totales disponibles`,
    ]
  }

  if (matcherType === 'attribute' && matcher.type === 'attribute') {
    const option = attributeOptions.find((entry) => entry.key === matcher.value)
    return option ? [`${option.label} · ${formatInteger(option.copies)}x en el Main Deck`] : []
  }

  if (matcherType === 'level' && matcher.type === 'level') {
    const option = levelOptions.find((entry) => entry.key === matcher.value)
    return option ? [`Nivel ${option.label} · ${formatInteger(option.copies)}x en el Main Deck`] : []
  }

  if (matcherType === 'monster_type' && matcher.type === 'monster_type') {
    const option = monsterTypeOptions.find((entry) => entry.key === matcher.value)
    return option ? [`${option.label} · ${formatInteger(option.copies)}x en el Main Deck`] : []
  }

  if (matcherType === 'atk' && matcher.type === 'atk') {
    const option = atkOptions.find((entry) => entry.key === matcher.value)
    return option ? [`${option.label} ATK · ${formatInteger(option.copies)}x en el Main Deck`] : []
  }

  if (matcherType === 'def' && matcher.type === 'def') {
    const option = defOptions.find((entry) => entry.key === matcher.value)
    return option ? [`${option.label} DEF · ${formatInteger(option.copies)}x en el Main Deck`] : []
  }

  return []
}

function countCardsMatchingMatcher(cards: CardEntry[], matcher: Extract<Matcher, { type: 'role' | 'origin' }>): number {
  if (matcher.type === 'role') {
    return cards
      .filter((card) => card.roles.includes(matcher.value))
      .reduce((total, card) => total + card.copies, 0)
  }

  return cards
    .filter((card) => matchesOrigin(card.origin, matcher.value))
    .reduce((total, card) => total + card.copies, 0)
}

function matchesOrigin(
  origin: CardEntry['origin'],
  target: 'engine' | 'non_engine' | 'hybrid',
): boolean {
  if (origin === null) {
    return false
  }

  if (target === 'engine') {
    return origin === 'engine' || origin === 'hybrid'
  }

  if (target === 'non_engine') {
    return origin === 'non_engine' || origin === 'hybrid'
  }

  return origin === 'hybrid'
}
