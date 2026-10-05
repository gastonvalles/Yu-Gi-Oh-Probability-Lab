import { memo, useCallback, useMemo, useState } from 'react'

import type { CardEntry, CardRole, CardType, Matcher } from '../../../types'
import { CARD_ORIGIN_DEFINITIONS, CARD_ROLE_DEFINITIONS } from '../../../app/deck-groups'
import {
  buildDerivedDeckAttributes,
  buildDerivedDeckAttackValues,
  buildDerivedDeckDefenseValues,
  buildDerivedDeckLevels,
  buildDerivedDeckMonsterTypes,
} from '../../../app/card-attributes'
import { buildDeckArchetypes } from '../../../app/card-archetypes'
import { getRemainingCopies } from '../../../app/pattern-card-usage'
import { createCardPoolMatcher } from '../../../app/patterns'
import { formatCopies } from '../../../app/utils'
import { Button } from '../../ui/Button'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface CategoryPickerProps {
  patternId: string
  conditionId: string
  currentMatcher: Matcher | null
  derivedMainCards: CardEntry[]
  /** Copias que las otras condiciones de la regla ya se llevan (esas cartas no se vuelven a ofrecer). */
  usedCopies: ReadonlyMap<string, number>
  actions: PatternEditorActions
  onClose: () => void
}

/** Roles fijados como atajo arriba del selector. */
const SHORTCUT_ROLES: readonly CardRole[] = ['starter', 'extender', 'brick']

const CARD_TYPE_OPTIONS: Array<{ value: CardType; label: string }> = [
  { value: 'monster', label: 'Monstruo' },
  { value: 'spell', label: 'Magia' },
  { value: 'trap', label: 'Trampa' },
]

/** Una opción del selector: elige un criterio (`matcher`) o, en selección múltiple, suma sus cartas al pool. */
interface PickerItem {
  id: string
  label: string
  copies: number
  matcher: Matcher | null
  /** Cartas que aporta al pool (sólo las que todavía tienen copias libres). */
  cardIds: string[]
}

interface PickerSection {
  key: string
  label: string
  items: PickerItem[]
  /** Se puede usar en selección múltiple (aporta cartas concretas). */
  poolable: boolean
  defaultOpen: boolean
}

type SelectionState = 'none' | 'some' | 'all'

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function CategoryPicker({
  patternId,
  conditionId,
  currentMatcher,
  derivedMainCards: allCards,
  usedCopies,
  actions,
  onClose,
}: CategoryPickerProps) {
  // Sólo se eligen cartas del deck (las ausentes llegan con 0 copias, para mostrar su nombre).
  const cards = useMemo(() => allCards.filter((card) => card.copies > 0), [allCards])
  const [query, setQuery] = useState('')
  const [isMulti, setIsMulti] = useState(false)
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => {
    if (currentMatcher?.type === 'card_pool') {
      return new Set(currentMatcher.value)
    }
    if (currentMatcher?.type === 'card') {
      return new Set([currentMatcher.value])
    }
    return new Set()
  })

  const sections = useMemo(() => buildSections(cards, usedCopies), [cards, usedCopies])
  const hiddenCards = useMemo(
    () => cards.filter((card) => getRemainingCopies(card, usedCopies) === 0).map((card) => card.name),
    [cards, usedCopies],
  )
  const shortcuts = useMemo(
    () => SHORTCUT_ROLES.flatMap((role) => buildRoleCounts(cards).filter((entry) => entry.value === role && entry.copies > 0)),
    [cards],
  )

  const needle = fold(query.trim())
  const visibleSections = useMemo(
    () =>
      sections
        .filter((section) => !isMulti || section.poolable)
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) => (!needle || fold(item.label).includes(needle)) && (!isMulti || item.cardIds.length > 0),
          ),
        }))
        .filter((section) => section.items.length > 0),
    [sections, isMulti, needle],
  )

  const handleSelect = useCallback(
    (matcher: Matcher) => {
      actions.setRequirementMatcher(patternId, conditionId, matcher)
      onClose()
    },
    [actions, conditionId, onClose, patternId],
  )

  const handlePress = useCallback(
    (item: PickerItem) => {
      if (!isMulti) {
        if (item.matcher) {
          handleSelect(item.matcher)
        }
        return
      }

      setSelection((current) => {
        const next = new Set(current)
        const allSelected = item.cardIds.every((id) => next.has(id))
        item.cardIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
        return next
      })
    },
    [handleSelect, isMulti],
  )

  const handleConfirm = () => {
    const matcher = createCardPoolMatcher([...selection])

    if (matcher) {
      actions.setRequirementMatcher(patternId, conditionId, matcher)
    }
    onClose()
  }

  return (
    <div className="cpick">
      <header className="cpick-head">
        <h3>¿Qué querés contar?</h3>
        <input
          type="search"
          className="cpick-search"
          value={query}
          placeholder="Buscar carta, rol, arquetipo…"
          aria-label="Buscar"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="cpick-chips">
          {!isMulti
            ? shortcuts.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  className="cpick-chip"
                  onClick={() => handleSelect({ type: 'role', value: role.value })}
                >
                  {role.label}
                  <span>{formatCopies(role.copies)}</span>
                </button>
              ))
            : null}
          <button
            type="button"
            className="cpick-chip"
            data-active={isMulti ? 'true' : 'false'}
            aria-pressed={isMulti}
            onClick={() => setIsMulti((current) => !current)}
          >
            {isMulti ? '✓ Varias cartas' : 'Elegir varias cartas'}
          </button>
        </div>
      </header>

      <div className="cpick-body">
        {visibleSections.length === 0 ? (
          <p className="cpick-empty">{cards.length === 0 ? 'No hay cartas en el deck.' : 'Nada coincide con la búsqueda.'}</p>
        ) : (
          visibleSections.map((section) => (
            <PickerGroup key={section.key} label={section.label} forceOpen={needle !== '' || isMulti || section.defaultOpen}>
              {section.items.map((item) => (
                <PickerRow
                  key={item.id}
                  item={item}
                  multi={isMulti}
                  state={isMulti ? getSelectionState(item, selection) : 'none'}
                  onPress={handlePress}
                />
              ))}
              {section.key === 'cards' && hiddenCards.length > 0 ? (
                <p className="cpick-note">Ya usadas en otra condición: {hiddenCards.join(', ')}.</p>
              ) : null}
            </PickerGroup>
          ))
        )}
      </div>

      {isMulti ? (
        <footer className="cpick-foot">
          <span>
            {selection.size > 0
              ? `${selection.size} carta${selection.size > 1 ? 's' : ''} seleccionada${selection.size > 1 ? 's' : ''}`
              : 'Tocá cartas de cualquier grupo para armar el pool'}
          </span>
          {selection.size > 0 ? (
            <Button variant="tertiary" size="sm" onClick={() => setSelection(new Set())}>
              Limpiar
            </Button>
          ) : null}
          <Button variant="primary" size="sm" disabled={selection.size === 0} onClick={handleConfirm}>
            Confirmar
          </Button>
        </footer>
      ) : null}
    </div>
  )
}

function getSelectionState(item: PickerItem, selection: ReadonlySet<string>): SelectionState {
  const selected = item.cardIds.filter((id) => selection.has(id)).length

  if (selected === 0) {
    return 'none'
  }

  return selected === item.cardIds.length ? 'all' : 'some'
}

function buildSections(cards: CardEntry[], used: ReadonlyMap<string, number>): PickerSection[] {
  const available = new Set(cards.filter((card) => getRemainingCopies(card, used) > 0).map((card) => card.id))
  const free = (cardIds: string[]) => cardIds.filter((id) => available.has(id))
  const group = (
    key: string,
    label: string,
    rows: Array<{ key: string | number; label: string; copies: number; cardIds?: string[] }>,
    toMatcher: ((row: { key: string | number }) => Matcher) | null,
    defaultOpen = false,
  ): PickerSection => ({
    key,
    label,
    poolable: rows.every((row) => row.cardIds !== undefined),
    defaultOpen,
    items: rows.map((row) => ({
      id: `${key}:${row.key}`,
      label: row.label,
      copies: row.copies,
      matcher: toMatcher ? toMatcher(row) : null,
      cardIds: free(row.cardIds ?? []),
    })),
  })

  const roleCounts = buildRoleCounts(cards).filter((role) => role.copies > 0 && !SHORTCUT_ROLES.includes(role.value))
  const sections: PickerSection[] = [
    {
      key: 'cards',
      label: 'Cartas',
      poolable: true,
      defaultOpen: true,
      items: cards
        .filter((card) => available.has(card.id))
        .map((card) => ({
          id: `card:${card.id}`,
          label: card.name,
          copies: getRemainingCopies(card, used),
          matcher: { type: 'card', value: card.id } as Matcher,
          cardIds: [card.id],
        })),
    },
    group(
      'archetype',
      'Arquetipo',
      buildDeckArchetypes(cards).map((archetype) => ({ key: archetype.name, label: archetype.name, copies: archetype.copies, cardIds: archetype.cardIds })),
      (row) => ({ type: 'archetype', value: String(row.key) }),
      true,
    ),
    group(
      'card_type',
      'Tipo de carta',
      buildCardTypeCounts(cards).map((entry) => ({ key: entry.value, label: entry.label, copies: entry.copies })),
      (row) => ({ type: 'card_type', value: row.key as CardType }),
    ),
    group(
      'role',
      'Roles',
      roleCounts.map((role) => ({ key: role.value, label: role.label, copies: role.copies })),
      (row) => ({ type: 'role', value: row.key as CardRole }),
    ),
    group(
      'origin',
      'Origen',
      buildOriginCounts(cards).filter((origin) => origin.copies > 0).map((origin) => ({ key: origin.value, label: origin.label, copies: origin.copies })),
      (row) => ({ type: 'origin', value: row.key as 'engine' | 'non_engine' | 'hybrid' }),
    ),
    group(
      'attribute',
      'Atributo',
      buildDerivedDeckAttributes(cards).filter((a) => a.copies > 0).map((a) => ({ key: a.key, label: a.label, copies: a.copies, cardIds: a.cardIds })),
      (row) => ({ type: 'attribute', value: row.key } as Matcher),
    ),
    group(
      'level',
      'Nivel',
      buildDerivedDeckLevels(cards).filter((l) => l.copies > 0).map((l) => ({ key: l.key, label: `Nivel ${l.label}`, copies: l.copies, cardIds: l.cardIds })),
      (row) => ({ type: 'level', value: row.key } as Matcher),
    ),
    group(
      'monster_type',
      'Tipo de monstruo',
      buildDerivedDeckMonsterTypes(cards).filter((t) => t.copies > 0).map((t) => ({ key: t.key, label: t.label, copies: t.copies, cardIds: t.cardIds })),
      (row) => ({ type: 'monster_type', value: row.key } as Matcher),
    ),
    group(
      'atk',
      'ATK',
      buildDerivedDeckAttackValues(cards).filter((a) => a.copies > 0).map((a) => ({ key: a.key, label: `${a.label} ATK`, copies: a.copies, cardIds: a.cardIds })),
      (row) => ({ type: 'atk', value: row.key } as Matcher),
    ),
    group(
      'def',
      'DEF',
      buildDerivedDeckDefenseValues(cards).filter((d) => d.copies > 0).map((d) => ({ key: d.key, label: `${d.label} DEF`, copies: d.copies, cardIds: d.cardIds })),
      (row) => ({ type: 'def', value: row.key } as Matcher),
    ),
  ]

  return sections.filter((section) => section.items.length > 0)
}

function PickerGroup({ label, forceOpen, children }: { label: string; forceOpen: boolean; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = forceOpen || isOpen

  return (
    <section className="cpick-group" data-open={open ? 'true' : 'false'}>
      <button type="button" className="cpick-group-head" aria-expanded={open} onClick={() => setIsOpen((current) => !current)}>
        <span className="cpick-caret" aria-hidden="true">›</span>
        {label}
      </button>
      {/* Las filas se montan sólo con el grupo abierto: abrir el selector es liviano aunque el deck sea grande. */}
      {open ? <div className="cpick-list">{children}</div> : null}
    </section>
  )
}

const PickerRow = memo(function PickerRow({
  item,
  multi,
  state,
  onPress,
}: {
  item: PickerItem
  multi: boolean
  state: SelectionState
  onPress: (item: PickerItem) => void
}) {
  return (
    <button type="button" className="cpick-row" data-state={state} onClick={() => onPress(item)}>
      {multi ? (
        <span className="cpick-check" aria-hidden="true">
          {state === 'all' ? '✓' : state === 'some' ? '−' : ''}
        </span>
      ) : null}
      <span className="cpick-label">{item.label}</span>
      <span className="cpick-detail">{formatCopies(item.copies)}</span>
    </button>
  )
})

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
