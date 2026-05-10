import { useMemo, useState } from 'react'

import type { CardEntry, CardRole, CardType, Matcher } from '../../../types'
import {
  CARD_ORIGIN_DEFINITIONS,
  CARD_ROLE_DEFINITIONS,
} from '../../../app/deck-groups'
import {
  buildDerivedDeckAttributes,
  buildDerivedDeckAttackValues,
  buildDerivedDeckDefenseValues,
  buildDerivedDeckLevels,
  buildDerivedDeckMonsterTypes,
} from '../../../app/card-attributes'
import { createCardPoolMatcher } from '../../../app/patterns'
import { formatInteger } from '../../../app/utils'
import { Button } from '../../ui/Button'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface CategoryPickerProps {
  patternId: string
  conditionId: string
  currentMatcher: Matcher | null
  derivedMainCards: CardEntry[]
  actions: PatternEditorActions
  onClose: () => void
}

/** Roles pinned as shortcuts at the top of the picker. */
const SHORTCUT_ROLES: readonly CardRole[] = ['starter', 'extender', 'brick']

const CARD_TYPE_OPTIONS: Array<{ value: CardType; label: string }> = [
  { value: 'monster', label: 'Monstruo' },
  { value: 'spell', label: 'Magia' },
  { value: 'trap', label: 'Trampa' },
]

export function CategoryPicker({
  patternId,
  conditionId,
  currentMatcher,
  derivedMainCards,
  actions,
  onClose,
}: CategoryPickerProps) {
  const [poolSelection, setPoolSelection] = useState<Set<string>>(() => {
    if (currentMatcher?.type === 'card_pool') {
      return new Set(currentMatcher.value)
    }
    if (currentMatcher?.type === 'card') {
      return new Set([currentMatcher.value])
    }
    return new Set()
  })
  const [isPoolMode, setIsPoolMode] = useState(false)

  const select = (matcher: Matcher) => {
    actions.setRequirementMatcher(patternId, conditionId, matcher)
    onClose()
  }

  const handleTogglePoolCard = (cardId: string) => {
    setPoolSelection((prev) => {
      const next = new Set(prev)
      if (next.has(cardId)) {
        next.delete(cardId)
      } else {
        next.add(cardId)
      }
      return next
    })
  }

  const handleConfirmPool = () => {
    const ids = [...poolSelection]
    const matcher = createCardPoolMatcher(ids)
    if (matcher) {
      actions.setRequirementMatcher(patternId, conditionId, matcher)
    }
    onClose()
  }

  const handleCardClick = (cardId: string) => {
    if (isPoolMode) {
      handleTogglePoolCard(cardId)
    } else {
      select({ type: 'card', value: cardId })
    }
  }

  const roleCounts = useMemo(() => buildRoleCounts(derivedMainCards), [derivedMainCards])
  const originCounts = useMemo(() => buildOriginCounts(derivedMainCards), [derivedMainCards])
  const attributes = useMemo(() => buildDerivedDeckAttributes(derivedMainCards).filter((a) => a.copies > 0), [derivedMainCards])
  const levels = useMemo(() => buildDerivedDeckLevels(derivedMainCards).filter((l) => l.copies > 0), [derivedMainCards])
  const monsterTypes = useMemo(() => buildDerivedDeckMonsterTypes(derivedMainCards).filter((t) => t.copies > 0), [derivedMainCards])
  const atkValues = useMemo(() => buildDerivedDeckAttackValues(derivedMainCards).filter((a) => a.copies > 0), [derivedMainCards])
  const defValues = useMemo(() => buildDerivedDeckDefenseValues(derivedMainCards).filter((d) => d.copies > 0), [derivedMainCards])

  const cardTypeCounts = useMemo(() => buildCardTypeCounts(derivedMainCards), [derivedMainCards])

  const shortcutRoles = SHORTCUT_ROLES
    .map((role) => roleCounts.find((r) => r.value === role))
    .filter((r): r is RoleCount => r !== undefined)

  const remainingRoles = roleCounts.filter(
    (r) => !SHORTCUT_ROLES.includes(r.value) && r.copies > 0,
  )
  const visibleOrigins = originCounts.filter((o) => o.copies > 0)

  const hasMonsterProps = attributes.length > 0 || levels.length > 0 || monsterTypes.length > 0 || atkValues.length > 0 || defValues.length > 0
  const isEmpty = shortcutRoles.length === 0 && remainingRoles.length === 0 && visibleOrigins.length === 0 && derivedMainCards.length === 0 && !hasMonsterProps

  return (
    <div className="category-picker surface-panel-soft grid max-h-[min(60vh,420px)] gap-2.5 overflow-y-auto rounded-md p-3">
      {/* Shortcuts + Pool toggle */}
      <div className="grid gap-1.5">
        <span className="app-muted text-[0.65rem] uppercase tracking-widest">Acceso rápido</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {shortcutRoles.map((role) => (
            <ShortcutButton
              key={role.value}
              label={role.label}
              copies={role.copies}
              onClick={() => {
                if (isPoolMode) return
                select({ type: 'role', value: role.value })
              }}
              disabled={isPoolMode}
            />
          ))}
          <button
            type="button"
            className={[
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[0.8rem] font-medium transition-colors',
              isPoolMode
                ? 'bg-[rgb(var(--primary-rgb)/0.16)] text-accent ring-1 ring-accent/40'
                : 'surface-card text-(--text-muted) hover:text-(--text-main) hover:bg-[rgb(var(--primary-rgb)/0.08)]',
            ].join(' ')}
            onClick={() => setIsPoolMode(!isPoolMode)}
          >
            {isPoolMode ? '✓ Selección múltiple' : '⊕ Seleccionar varias'}
          </button>
        </div>
      </div>

      {/* Pool confirmation bar */}
      {isPoolMode ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-[rgb(var(--primary-rgb)/0.08)] px-3 py-2">
          <span className="text-[0.76rem] text-(--text-main)">
            {poolSelection.size > 0
              ? `${poolSelection.size} carta${poolSelection.size > 1 ? 's' : ''} seleccionada${poolSelection.size > 1 ? 's' : ''}`
              : 'Tocá cartas de cualquier grupo para armar el pool'}
          </span>
          {poolSelection.size > 0 ? (
            <Button variant="primary" size="sm" onClick={handleConfirmPool}>
              Confirmar
            </Button>
          ) : null}
        </div>
      ) : null}

      {isEmpty ? (
        <p className="m-0 text-[0.78rem] text-(--text-muted)">No hay cartas en el deck.</p>
      ) : (
        <div className="grid gap-2.5">
          {/* Card type (Monster / Spell / Trap) */}
          {cardTypeCounts.length > 0 ? (
            <PickerGroup label="Tipo de carta">
              {cardTypeCounts.map((ct) => (
                <PickerOption
                  key={ct.value}
                  label={ct.label}
                  detail={`${formatInteger(ct.copies)}x`}
                  onClick={() => {
                    if (isPoolMode) return
                    select({ type: 'card_type', value: ct.value })
                  }}
                  disabled={isPoolMode}
                />
              ))}
            </PickerGroup>
          ) : null}

          {/* Roles */}
          {remainingRoles.length > 0 ? (
            <PickerGroup label="Roles">
              {remainingRoles.map((role) => (
                <PickerOption
                  key={role.value}
                  label={role.label}
                  detail={`${formatInteger(role.copies)}x`}
                  onClick={() => {
                    if (isPoolMode) return
                    select({ type: 'role', value: role.value })
                  }}
                  disabled={isPoolMode}
                />
              ))}
            </PickerGroup>
          ) : null}

          {/* Origins */}
          {visibleOrigins.length > 0 ? (
            <PickerGroup label="Origen">
              {visibleOrigins.map((origin) => (
                <PickerOption
                  key={origin.value}
                  label={origin.label}
                  detail={`${formatInteger(origin.copies)}x`}
                  onClick={() => {
                    if (isPoolMode) return
                    select({ type: 'origin', value: origin.value })
                  }}
                  disabled={isPoolMode}
                />
              ))}
            </PickerGroup>
          ) : null}

          {/* Individual cards */}
          {derivedMainCards.length > 0 ? (
            <PickerGroup label="Cartas">
              {derivedMainCards.map((card) => (
                isPoolMode ? (
                  <PoolCardOption
                    key={card.id}
                    label={card.name}
                    copies={card.copies}
                    isSelected={poolSelection.has(card.id)}
                    onToggle={() => handleTogglePoolCard(card.id)}
                  />
                ) : (
                  <PickerOption
                    key={card.id}
                    label={card.name}
                    detail={`${formatInteger(card.copies)}x`}
                    onClick={() => handleCardClick(card.id)}
                  />
                )
              ))}
            </PickerGroup>
          ) : null}

          {/* Attributes */}
          {attributes.length > 0 ? (
            <PickerGroup label="Atributo">
              {attributes.map((attr) => (
                isPoolMode ? (
                  <PoolGroupOption
                    key={attr.key}
                    label={attr.label}
                    copies={attr.copies}
                    cardIds={attr.cardIds}
                    poolSelection={poolSelection}
                    onToggleCards={handleToggleGroupCards}
                  />
                ) : (
                  <PickerOption
                    key={attr.key}
                    label={attr.label}
                    detail={`${formatInteger(attr.copies)}x`}
                    onClick={() => select({ type: 'attribute', value: attr.key })}
                  />
                )
              ))}
            </PickerGroup>
          ) : null}

          {/* Levels */}
          {levels.length > 0 ? (
            <PickerGroup label="Nivel">
              {levels.map((level) => (
                isPoolMode ? (
                  <PoolGroupOption
                    key={level.key}
                    label={`Nivel ${level.label}`}
                    copies={level.copies}
                    cardIds={level.cardIds}
                    poolSelection={poolSelection}
                    onToggleCards={handleToggleGroupCards}
                  />
                ) : (
                  <PickerOption
                    key={level.key}
                    label={`Nivel ${level.label}`}
                    detail={`${formatInteger(level.copies)}x`}
                    onClick={() => select({ type: 'level', value: level.key })}
                  />
                )
              ))}
            </PickerGroup>
          ) : null}

          {/* Monster types */}
          {monsterTypes.length > 0 ? (
            <PickerGroup label="Tipo de monstruo">
              {monsterTypes.map((mt) => (
                isPoolMode ? (
                  <PoolGroupOption
                    key={mt.key}
                    label={mt.label}
                    copies={mt.copies}
                    cardIds={mt.cardIds}
                    poolSelection={poolSelection}
                    onToggleCards={handleToggleGroupCards}
                  />
                ) : (
                  <PickerOption
                    key={mt.key}
                    label={mt.label}
                    detail={`${formatInteger(mt.copies)}x`}
                    onClick={() => select({ type: 'monster_type', value: mt.key })}
                  />
                )
              ))}
            </PickerGroup>
          ) : null}

          {/* ATK */}
          {atkValues.length > 0 ? (
            <PickerGroup label="ATK">
              {atkValues.map((atk) => (
                isPoolMode ? (
                  <PoolGroupOption
                    key={atk.key}
                    label={`${atk.label} ATK`}
                    copies={atk.copies}
                    cardIds={atk.cardIds}
                    poolSelection={poolSelection}
                    onToggleCards={handleToggleGroupCards}
                  />
                ) : (
                  <PickerOption
                    key={atk.key}
                    label={`${atk.label} ATK`}
                    detail={`${formatInteger(atk.copies)}x`}
                    onClick={() => select({ type: 'atk', value: atk.key })}
                  />
                )
              ))}
            </PickerGroup>
          ) : null}

          {/* DEF */}
          {defValues.length > 0 ? (
            <PickerGroup label="DEF">
              {defValues.map((def) => (
                isPoolMode ? (
                  <PoolGroupOption
                    key={def.key}
                    label={`${def.label} DEF`}
                    copies={def.copies}
                    cardIds={def.cardIds}
                    poolSelection={poolSelection}
                    onToggleCards={handleToggleGroupCards}
                  />
                ) : (
                  <PickerOption
                    key={def.key}
                    label={`${def.label} DEF`}
                    detail={`${formatInteger(def.copies)}x`}
                    onClick={() => select({ type: 'def', value: def.key })}
                  />
                )
              ))}
            </PickerGroup>
          ) : null}
        </div>
      )}
    </div>
  )

  function handleToggleGroupCards(cardIds: string[]) {
    setPoolSelection((prev) => {
      const next = new Set(prev)
      const allSelected = cardIds.every((id) => next.has(id))
      if (allSelected) {
        cardIds.forEach((id) => next.delete(id))
      } else {
        cardIds.forEach((id) => next.add(id))
      }
      return next
    })
  }
}


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ShortcutButton({
  label,
  copies,
  onClick,
  disabled,
}: {
  label: string
  copies: number
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={[
        'surface-card inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.8rem] font-medium transition-colors',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'text-(--text-main) hover:bg-[rgb(var(--primary-rgb)/0.1)]',
      ].join(' ')}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
      <span className="text-[0.68rem] text-(--text-muted)">{formatInteger(copies)}x</span>
    </button>
  )
}

function PickerGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group grid gap-1 rounded-md border border-transparent open:border-(--border-subtle) open:bg-[rgb(var(--card-background-rgb)/0.5)] open:p-2">
      <summary className="app-muted flex cursor-pointer list-none items-center gap-1.5 rounded px-1 py-0.5 text-[0.65rem] uppercase tracking-widest transition-colors select-none hover:bg-[rgb(var(--primary-rgb)/0.06)] [&::-webkit-details-marker]:hidden">
        <span className="text-[0.6rem] transition-transform group-open:rotate-90">›</span>
        {label}
      </summary>
      <div className="grid gap-0.5">{children}</div>
    </details>
  )
}

function PickerOption({
  label,
  detail,
  onClick,
  disabled,
}: {
  label: string
  detail: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[0.78rem] transition-colors',
        disabled
          ? 'text-(--text-muted) opacity-40 cursor-not-allowed'
          : 'text-(--text-main) hover:bg-[rgb(var(--primary-rgb)/0.06)]',
      ].join(' ')}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-[0.68rem] text-(--text-muted)">{detail}</span>
    </button>
  )
}

function PoolCardOption({
  label,
  copies,
  isSelected,
  onToggle,
}: {
  label: string
  copies: number
  isSelected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[0.78rem] transition-colors',
        isSelected
          ? 'bg-[rgb(var(--primary-rgb)/0.12)] text-accent'
          : 'text-(--text-main) hover:bg-[rgb(var(--primary-rgb)/0.06)]',
      ].join(' ')}
      onClick={onToggle}
    >
      <span className="flex items-center gap-1.5 truncate">
        <span className={[
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[0.6rem]',
          isSelected
            ? 'border-accent bg-accent text-white'
            : 'border-(--border-subtle) bg-transparent',
        ].join(' ')}>
          {isSelected ? '✓' : ''}
        </span>
        {label}
      </span>
      <span className="shrink-0 text-[0.68rem] text-(--text-muted)">{formatInteger(copies)}x</span>
    </button>
  )
}

function PoolGroupOption({
  label,
  copies,
  cardIds,
  poolSelection,
  onToggleCards,
}: {
  label: string
  copies: number
  cardIds: string[]
  poolSelection: Set<string>
  onToggleCards: (cardIds: string[]) => void
}) {
  const selectedCount = cardIds.filter((id) => poolSelection.has(id)).length
  const allSelected = selectedCount === cardIds.length && cardIds.length > 0

  return (
    <button
      type="button"
      className={[
        'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[0.78rem] transition-colors',
        allSelected
          ? 'bg-[rgb(var(--primary-rgb)/0.12)] text-accent'
          : selectedCount > 0
            ? 'bg-[rgb(var(--primary-rgb)/0.06)] text-(--text-main)'
            : 'text-(--text-main) hover:bg-[rgb(var(--primary-rgb)/0.06)]',
      ].join(' ')}
      onClick={() => onToggleCards(cardIds)}
    >
      <span className="flex items-center gap-1.5 truncate">
        <span className={[
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[0.6rem]',
          allSelected
            ? 'border-accent bg-accent text-white'
            : selectedCount > 0
              ? 'border-accent bg-transparent text-accent'
              : 'border-(--border-subtle) bg-transparent',
        ].join(' ')}>
          {allSelected ? '✓' : selectedCount > 0 ? '−' : ''}
        </span>
        {label}
      </span>
      <span className="shrink-0 text-[0.68rem] text-(--text-muted)">
        {selectedCount > 0 ? `${selectedCount}/${cardIds.length}` : `${formatInteger(copies)}x`}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RoleCount {
  value: CardRole
  label: string
  copies: number
}

function buildRoleCounts(cards: CardEntry[]): RoleCount[] {
  return CARD_ROLE_DEFINITIONS.map((definition) => {
    const copies = cards
      .filter((card) => card.roles.includes(definition.key.value))
      .reduce((total, card) => total + card.copies, 0)

    return {
      value: definition.key.value,
      label: definition.label,
      copies,
    }
  })
}

interface OriginCount {
  value: 'engine' | 'non_engine' | 'hybrid'
  label: string
  copies: number
}

function buildOriginCounts(cards: CardEntry[]): OriginCount[] {
  return CARD_ORIGIN_DEFINITIONS.map((definition) => {
    const originValue = definition.key.value
    const copies = cards
      .filter((card) => matchesOrigin(card.origin, originValue))
      .reduce((total, card) => total + card.copies, 0)

    return {
      value: originValue,
      label: definition.label,
      copies,
    }
  })
}

function matchesOrigin(
  origin: CardEntry['origin'],
  target: 'engine' | 'non_engine' | 'hybrid',
): boolean {
  if (origin === null) return false
  if (target === 'engine') return origin === 'engine' || origin === 'hybrid'
  if (target === 'non_engine') return origin === 'non_engine' || origin === 'hybrid'
  return origin === 'hybrid'
}

interface CardTypeCount {
  value: CardType
  label: string
  copies: number
}

function buildCardTypeCounts(cards: CardEntry[]): CardTypeCount[] {
  return CARD_TYPE_OPTIONS
    .map((option) => {
      const copies = cards
        .filter((card) => {
          const ct = card.apiCard?.cardType.toLowerCase() ?? ''
          return ct.includes(option.value)
        })
        .reduce((total, card) => total + card.copies, 0)

      return { ...option, copies }
    })
    .filter((entry) => entry.copies > 0)
}
