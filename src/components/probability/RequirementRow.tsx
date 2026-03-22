import { useState } from 'react'

import {
  buildDerivedDeckAttackValues,
  buildDerivedDeckAttributes,
  buildDerivedDeckDefenseValues,
  buildDerivedDeckLevels,
  buildDerivedDeckMonsterTypes,
  getMonsterRequirementSourceLabel,
  isMonsterRequirementSource,
  type DerivedDeckAttribute,
  type DerivedDeckValueOption,
} from '../../app/card-attributes'
import { formatInteger } from '../../app/utils'
import type { DerivedDeckGroup } from '../../app/deck-groups'
import type {
  CardAttribute,
  CardEntry,
  CardGroupKey,
  PatternRequirement,
  RequirementKind,
  RequirementSource,
} from '../../types'
import { Button } from '../ui/Button'
import { buildRequirementSummary } from './pattern-helpers'
import type { PatternEditorActions } from './pattern-editor-actions'

interface RequirementRowProps {
  index: number
  patternId: string
  requirement: PatternRequirement
  derivedMainCards: CardEntry[]
  derivedGroups: DerivedDeckGroup[]
  actions: PatternEditorActions
}

export function RequirementRow({
  index,
  patternId,
  requirement,
  derivedMainCards,
  derivedGroups,
  actions,
}: RequirementRowProps) {
  const [nextCardId, setNextCardId] = useState('')
  const availableCards = derivedMainCards.filter((card) => !requirement.cardIds.includes(card.id))
  const availableGroups = derivedGroups.filter((group) => group.copies > 0 || group.key === requirement.groupKey)
  const availableAttributes = buildDerivedDeckAttributes(derivedMainCards).filter(
    (attribute) => attribute.copies > 0 || attribute.key === requirement.attribute,
  )
  const availableLevels = buildDerivedDeckLevels(derivedMainCards).filter(
    (level) => level.copies > 0 || level.key === requirement.level,
  )
  const availableMonsterTypes = buildDerivedDeckMonsterTypes(derivedMainCards).filter(
    (monsterType) => monsterType.copies > 0 || monsterType.key === requirement.monsterType,
  )
  const availableAtkValues = buildDerivedDeckAttackValues(derivedMainCards).filter(
    (atk) => atk.copies > 0 || atk.key === requirement.atk,
  )
  const availableDefValues = buildDerivedDeckDefenseValues(derivedMainCards).filter(
    (def) => def.copies > 0 || def.key === requirement.def,
  )
  const selectedCards = requirement.cardIds
    .map((cardId) => derivedMainCards.find((card) => card.id === cardId))
    .filter((card): card is CardEntry => Boolean(card))
  const selectedGroup =
    requirement.source === 'group' && requirement.groupKey
      ? derivedGroups.find((group) => group.key === requirement.groupKey) ?? null
      : null
  const selectedMonsterFilterOption = getSelectedMonsterFilterOption(
    requirement,
    availableAttributes,
    availableLevels,
    availableMonsterTypes,
    availableAtkValues,
    availableDefValues,
  )
  const selectedMonsterFilter =
    isMonsterRequirementSource(requirement.source) && selectedMonsterFilterOption
      ? {
          copies: selectedMonsterFilterOption.copies,
          label: getMonsterRequirementSourceLabel(requirement) ?? selectedMonsterFilterOption.label,
        }
      : null
  const showsDistinctToggle = requirement.count > 1

  return (
    <article tabIndex={0} className="condition-card surface-card grid gap-2 p-2.5 outline-none">
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-1">
          <strong className="text-[0.78rem] text-(--text-main)">Condición {index + 1}</strong>
          <p className="app-muted m-0 text-[0.76rem] leading-[1.16]">
            {buildRequirementSummary(requirement, selectedCards, selectedGroup, selectedMonsterFilter)}
          </p>
        </div>
        <button
          type="button"
          className="app-icon-button shrink-0 text-[1rem] leading-none"
          aria-label={`Borrar condición ${index + 1}`}
          onClick={() => actions.removeRequirement(patternId, requirement.id)}
        >
          ×
        </button>
      </div>

      <div className="grid gap-2 min-[960px]:grid-cols-[minmax(0,1.3fr)_84px_128px_minmax(0,1fr)] min-[960px]:items-end">
        <label className="grid w-full gap-1">
          <span className="app-muted text-[0.68rem] uppercase tracking-widest">Regla</span>
          <select
            value={requirement.kind}
            onChange={(event) =>
              actions.setRequirementKind(patternId, requirement.id, event.target.value as RequirementKind)
            }
            className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
          >
            <option value="include">Debo robar</option>
            <option value="exclude">No debo robar</option>
          </select>
        </label>

        <label className="grid w-full gap-1 min-[960px]:max-w-21">
          <span className="app-muted text-[0.68rem] uppercase tracking-widest">Cantidad</span>
          <input
            type="number"
            min={1}
            value={requirement.count}
            onChange={(event) => actions.setRequirementCount(patternId, requirement.id, event.target.value)}
            className="app-field w-full px-2 py-[0.45rem] text-center text-[0.84rem]"
          />
        </label>

        <label className="grid w-full gap-1 min-[960px]:max-w-32">
          <span className="app-muted text-[0.68rem] uppercase tracking-widest">Fuente</span>
          <select
            value={requirement.source}
            onChange={(event) =>
              actions.setRequirementSource(patternId, requirement.id, event.target.value as RequirementSource)
            }
            className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
          >
            <option value="group">Grupo</option>
            <option value="attribute">Atributo</option>
            <option value="level">Nivel</option>
            <option value="type">Tipo</option>
            <option value="atk">ATK</option>
            <option value="def">DEF</option>
            <option value="cards">Cartas</option>
          </select>
        </label>

        <label className="grid w-full gap-1">
          <span className="app-muted text-[0.68rem] uppercase tracking-widest">Objetivo</span>
          {requirement.source === 'group' ? (
            <select
              value={requirement.groupKey ?? ''}
              onChange={(event) =>
                actions.setRequirementGroup(
                  patternId,
                  requirement.id,
                  (event.target.value || null) as CardGroupKey | null,
                )
              }
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="">Elegir grupo</option>
              {availableGroups.map((group) => (
                <option key={group.key} value={group.key}>
                  {group.label} · {formatInteger(group.copies)}x
                </option>
              ))}
            </select>
          ) : requirement.source === 'attribute' ? (
            <select
              value={requirement.attribute ?? ''}
              onChange={(event) =>
                actions.setRequirementAttribute(
                  patternId,
                  requirement.id,
                  (event.target.value || null) as CardAttribute | null,
                )
              }
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="">Elegir atributo</option>
              {availableAttributes.map((attribute) => (
                <option key={attribute.key} value={attribute.key}>
                  {attribute.label} · {formatInteger(attribute.copies)}x
                </option>
              ))}
            </select>
          ) : requirement.source === 'level' ? (
            <select
              value={requirement.level ?? ''}
              onChange={(event) => actions.setRequirementLevel(patternId, requirement.id, event.target.value)}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="">Elegir nivel</option>
              {availableLevels.map((level) => (
                <option key={level.key} value={level.key}>
                  Nivel {level.label} · {formatInteger(level.copies)}x
                </option>
              ))}
            </select>
          ) : requirement.source === 'type' ? (
            <select
              value={requirement.monsterType ?? ''}
              onChange={(event) =>
                actions.setRequirementMonsterType(patternId, requirement.id, event.target.value || null)
              }
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="">Elegir tipo</option>
              {availableMonsterTypes.map((monsterType) => (
                <option key={monsterType.key} value={monsterType.key}>
                  {monsterType.label} · {formatInteger(monsterType.copies)}x
                </option>
              ))}
            </select>
          ) : requirement.source === 'atk' ? (
            <select
              value={requirement.atk ?? ''}
              onChange={(event) => actions.setRequirementAtk(patternId, requirement.id, event.target.value)}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="">Elegir ATK</option>
              {availableAtkValues.map((atk) => (
                <option key={atk.key} value={atk.key}>
                  {atk.label} ATK · {formatInteger(atk.copies)}x
                </option>
              ))}
            </select>
          ) : requirement.source === 'def' ? (
            <select
              value={requirement.def ?? ''}
              onChange={(event) => actions.setRequirementDef(patternId, requirement.id, event.target.value)}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="">Elegir DEF</option>
              {availableDefValues.map((def) => (
                <option key={def.key} value={def.key}>
                  {def.label} DEF · {formatInteger(def.copies)}x
                </option>
              ))}
            </select>
          ) : (
            <select
              value={nextCardId}
              onChange={(event) => {
                const { value } = event.target
                setNextCardId(value)

                if (!value) {
                  return
                }

                actions.addRequirementCard(patternId, requirement.id, value)
                setNextCardId('')
              }}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="">Elegir carta</option>
              {availableCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} · {formatInteger(card.copies)}x
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      {requirement.source === 'group' ? (
        !selectedGroup || selectedGroup.copies === 0 ? (
          <p className="surface-card-warning m-0 px-2 py-1.5 text-[0.78rem] text-(--warning)">
            Este grupo todavía está vacío. Volvé al paso 2 y marcá roles para llenarlo.
          </p>
        ) : null
      ) : isMonsterRequirementSource(requirement.source) ? (
        !selectedMonsterFilter ? (
          <p className="surface-card-warning m-0 px-2 py-1.5 text-[0.78rem] text-(--warning)">
            Este filtro no tiene monstruos cargados en el Main Deck.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <span className="app-chip inline-flex items-center gap-1.5 px-2 py-1 text-[0.76rem]">
              Monstruos {selectedMonsterFilter.label} · {formatInteger(selectedMonsterFilter.copies)}x
            </span>
          </div>
        )
      ) : selectedCards.length === 0 ? (
        <p className="surface-card-danger m-0 px-2 py-1.5 text-[0.78rem] text-(--destructive)">
          Todavía no elegiste cartas para esta condición.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {selectedCards.map((card) => (
            <span
              key={card.id}
              className="app-chip inline-flex items-center gap-1.5 px-2 py-1 text-[0.76rem]"
            >
              {card.name}
              <button
                type="button"
                className="text-[0.72rem] text-(--text-soft) transition-colors hover:text-(--text-main)"
                onClick={() => actions.removeRequirementCard(patternId, requirement.id, card.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {showsDistinctToggle ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-2 px-2.5 py-2">
          <div className="grid gap-0.5">
            <span className="app-muted text-[0.68rem] uppercase tracking-widest">Copias repetidas</span>
            <span className="app-soft text-[0.74rem] leading-[1.16]">
              {requirement.distinct
                ? 'Dos copias iguales cuentan como un solo nombre.'
                : 'Dos copias iguales cuentan como dos cartas.'}
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

function getSelectedMonsterFilterOption(
  requirement: PatternRequirement,
  availableAttributes: DerivedDeckAttribute[],
  availableLevels: DerivedDeckValueOption<number>[],
  availableMonsterTypes: DerivedDeckValueOption<string>[],
  availableAtkValues: DerivedDeckValueOption<number>[],
  availableDefValues: DerivedDeckValueOption<number>[],
) {
  switch (requirement.source) {
    case 'attribute':
      return availableAttributes.find((attribute) => attribute.key === requirement.attribute) ?? null
    case 'level':
      return availableLevels.find((level) => level.key === requirement.level) ?? null
    case 'type':
      return availableMonsterTypes.find((monsterType) => monsterType.key === requirement.monsterType) ?? null
    case 'atk':
      return availableAtkValues.find((atk) => atk.key === requirement.atk) ?? null
    case 'def':
      return availableDefValues.find((def) => def.key === requirement.def) ?? null
    default:
      return null
  }
}
