import { useMemo } from 'react'

import type { CardEntry, CardRole, Matcher } from '../../../types'
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
import { formatInteger } from '../../../app/utils'
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

export function CategoryPicker({
  patternId,
  conditionId,
  currentMatcher,
  derivedMainCards,
  actions,
  onClose,
}: CategoryPickerProps) {
  const select = (matcher: Matcher) => {
    actions.setRequirementMatcher(patternId, conditionId, matcher)
    onClose()
  }

  const roleCounts = useMemo(() => buildRoleCounts(derivedMainCards), [derivedMainCards])
  const originCounts = useMemo(() => buildOriginCounts(derivedMainCards), [derivedMainCards])
  const attributes = useMemo(() => buildDerivedDeckAttributes(derivedMainCards).filter((a) => a.copies > 0), [derivedMainCards])
  const levels = useMemo(() => buildDerivedDeckLevels(derivedMainCards).filter((l) => l.copies > 0), [derivedMainCards])
  const monsterTypes = useMemo(() => buildDerivedDeckMonsterTypes(derivedMainCards).filter((t) => t.copies > 0), [derivedMainCards])
  const atkValues = useMemo(() => buildDerivedDeckAttackValues(derivedMainCards).filter((a) => a.copies > 0), [derivedMainCards])
  const defValues = useMemo(() => buildDerivedDeckDefenseValues(derivedMainCards).filter((d) => d.copies > 0), [derivedMainCards])

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
      {/* Shortcuts */}
      <div className="grid gap-1">
        <span className="app-muted text-[0.65rem] uppercase tracking-widest">Acceso rápido</span>
        <div className="flex flex-wrap gap-1.5">
          {shortcutRoles.map((role) => (
            <ShortcutButton
              key={role.value}
              label={role.label}
              copies={role.copies}
              onClick={() => select({ type: 'role', value: role.value })}
            />
          ))}
        </div>
      </div>

      {isEmpty ? (
        <p className="m-0 text-[0.78rem] text-(--text-muted)">No hay cartas en el deck.</p>
      ) : (
        <div className="grid gap-2.5">
          {/* Roles */}
          {remainingRoles.length > 0 ? (
            <PickerGroup label="Roles">
              {remainingRoles.map((role) => (
                <PickerOption
                  key={role.value}
                  label={role.label}
                  detail={`${formatInteger(role.copies)}x`}
                  onClick={() => select({ type: 'role', value: role.value })}
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
                  onClick={() => select({ type: 'origin', value: origin.value })}
                />
              ))}
            </PickerGroup>
          ) : null}

          {/* Individual cards */}
          {derivedMainCards.length > 0 ? (
            <PickerGroup label="Cartas">
              {derivedMainCards.map((card) => (
                <PickerOption
                  key={card.id}
                  label={card.name}
                  detail={`${formatInteger(card.copies)}x`}
                  onClick={() => select({ type: 'card', value: card.id })}
                />
              ))}
            </PickerGroup>
          ) : null}

          {/* Attributes */}
          {attributes.length > 0 ? (
            <PickerGroup label="Atributo">
              {attributes.map((attr) => (
                <PickerOption
                  key={attr.key}
                  label={attr.label}
                  detail={`${formatInteger(attr.copies)}x`}
                  onClick={() => select({ type: 'attribute', value: attr.key })}
                />
              ))}
            </PickerGroup>
          ) : null}

          {/* Levels */}
          {levels.length > 0 ? (
            <PickerGroup label="Nivel">
              {levels.map((level) => (
                <PickerOption
                  key={level.key}
                  label={`Nivel ${level.label}`}
                  detail={`${formatInteger(level.copies)}x`}
                  onClick={() => select({ type: 'level', value: level.key })}
                />
              ))}
            </PickerGroup>
          ) : null}

          {/* Monster types */}
          {monsterTypes.length > 0 ? (
            <PickerGroup label="Tipo de monstruo">
              {monsterTypes.map((mt) => (
                <PickerOption
                  key={mt.key}
                  label={mt.label}
                  detail={`${formatInteger(mt.copies)}x`}
                  onClick={() => select({ type: 'monster_type', value: mt.key })}
                />
              ))}
            </PickerGroup>
          ) : null}

          {/* ATK */}
          {atkValues.length > 0 ? (
            <PickerGroup label="ATK">
              {atkValues.map((atk) => (
                <PickerOption
                  key={atk.key}
                  label={`${atk.label} ATK`}
                  detail={`${formatInteger(atk.copies)}x`}
                  onClick={() => select({ type: 'atk', value: atk.key })}
                />
              ))}
            </PickerGroup>
          ) : null}

          {/* DEF */}
          {defValues.length > 0 ? (
            <PickerGroup label="DEF">
              {defValues.map((def) => (
                <PickerOption
                  key={def.key}
                  label={`${def.label} DEF`}
                  detail={`${formatInteger(def.copies)}x`}
                  onClick={() => select({ type: 'def', value: def.key })}
                />
              ))}
            </PickerGroup>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ShortcutButton({
  label,
  copies,
  onClick,
}: {
  label: string
  copies: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="surface-card inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.8rem] font-medium text-(--text-main) transition-colors hover:bg-[rgb(var(--primary-rgb)/0.1)]"
      onClick={onClick}
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
}: {
  label: string
  detail: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[0.78rem] text-(--text-main) transition-colors hover:bg-[rgb(var(--primary-rgb)/0.06)]"
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-[0.68rem] text-(--text-muted)">{detail}</span>
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
