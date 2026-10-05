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
import { cx } from '../../ui/cx'
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

const CHIP =
  'inline-flex min-h-[2.3rem] items-center gap-[0.4rem] rounded-full border border-border bg-secondary/80 px-[0.85rem] text-[0.86rem] font-semibold text-foreground transition-[background,border-color] [-webkit-tap-highlight-color:transparent] active:scale-[0.97] data-[active=true]:border-success/65 data-[active=true]:bg-success/14 data-[active=true]:text-accent [&_span]:text-[0.74rem] [&_span]:font-medium [&_span]:text-muted'

/** Fila: el estado (ninguna / algunas / todas las cartas elegidas) llega por data-state. */
const ROW =
  'group flex min-h-[2.8rem] items-center gap-[0.65rem] rounded-[0.9rem] border border-transparent bg-transparent px-3 text-left text-[0.92rem] text-white [-webkit-tap-highlight-color:transparent] [contain-intrinsic-size:auto_44px] [content-visibility:auto] hover:bg-primary/10 active:bg-primary/20 data-[state=all]:border-success/50 data-[state=all]:bg-success/12 data-[state=all]:text-accent data-[state=some]:border-success/25'

const CHECK =
  'inline-grid size-[1.35rem] flex-none place-items-center rounded-full border-[1.5px] border-border-strong text-[0.8rem] font-extrabold leading-none group-data-[state=all]:border-success group-data-[state=all]:bg-success group-data-[state=all]:text-[#06140e] group-data-[state=some]:border-success/70 group-data-[state=some]:text-accent'

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
    () => {
      const counts = buildRoleCounts(cards)
      return SHORTCUT_ROLES.flatMap((role) => counts.filter((entry) => entry.value === role && entry.copies > 0))
    },
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

  // Acordeón: una sola pestaña abierta a la vez. Al buscar se abre la primera con resultados.
  const [openKey, setOpenKey] = useState<string | null>(null)
  const activeKey = visibleSections.some((section) => section.key === openKey)
    ? openKey
    : needle !== ''
      ? (visibleSections[0]?.key ?? null)
      : null
  const toggleSection = useCallback(
    (key: string) => setOpenKey((current) => (current === key ? null : key)),
    [],
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
    <div className="flex h-full min-h-0 flex-col [background:radial-gradient(120%_50%_at_50%_0%,rgb(var(--primary-rgb)/0.16),transparent_70%),rgb(var(--background-rgb))]">
      <header className="grid flex-none gap-[0.65rem] pb-3 pl-4 pr-[3.4rem] pt-[0.9rem]">
        <h3 className="m-0 text-[1.05rem] font-bold text-white">¿Qué querés contar?</h3>
        <input
          type="search"
          className="min-h-[2.6rem] w-full rounded-full border border-border bg-secondary/90 px-4 text-[0.92rem] text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-hover"
          value={query}
          placeholder="Buscar carta, rol, arquetipo…"
          aria-label="Buscar"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex flex-wrap gap-[0.45rem]">
          {!isMulti
            ? shortcuts.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  className={CHIP}
                  onClick={() => handleSelect({ type: 'role', value: role.value })}
                >
                  {role.label}
                  <span>{formatCopies(role.copies)}</span>
                </button>
              ))
            : null}
          <button
            type="button"
            className={CHIP}
            data-active={isMulti ? 'true' : 'false'}
            aria-pressed={isMulti}
            onClick={() => setIsMulti((current) => !current)}
          >
            {isMulti ? '✓ Varias cartas' : 'Elegir varias cartas'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4">
        {visibleSections.length === 0 ? (
          <p className="m-0 mt-1 py-6 text-center text-[0.78rem] text-muted">{cards.length === 0 ? 'No hay cartas en el deck.' : 'Nada coincide con la búsqueda.'}</p>
        ) : (
          visibleSections.map((section) => (
            <PickerGroup key={section.key} id={section.key} label={section.label} open={section.key === activeKey} onToggle={toggleSection}>
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
                <p className="m-0 mt-1 text-[0.78rem] text-muted">Ya usadas en otra condición: {hiddenCards.join(', ')}.</p>
              ) : null}
            </PickerGroup>
          ))
        )}
      </div>

      {isMulti ? (
        <footer className="flex flex-none items-center gap-[0.6rem] border-t border-border bg-card-background/96 px-4 pb-[calc(0.7rem+env(safe-area-inset-bottom,0px))] pt-[0.7rem]">
          <span className="min-w-0 flex-1 text-[0.86rem] font-semibold text-white">
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
  ): PickerSection => ({
    key,
    label,
    poolable: rows.every((row) => row.cardIds !== undefined),
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

function PickerGroup({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: string
  label: string
  open: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-border">
      <button type="button" className="flex min-h-[2.9rem] w-full items-center gap-2 border-0 bg-transparent p-0 text-left text-[0.74rem] font-bold uppercase tracking-[0.08em] text-soft" aria-expanded={open} onClick={() => onToggle(id)}>
        <span className={cx('inline-block text-base transition-transform', open && 'rotate-90')} aria-hidden="true">
          ›
        </span>
        {label}
      </button>
      {/* Las filas se montan sólo con el grupo abierto: abrir el selector es liviano aunque el deck sea grande. */}
      {open ? <div className="grid gap-[0.2rem] pb-[0.6rem]">{children}</div> : null}
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
    <button type="button" className={ROW} data-state={state} onClick={() => onPress(item)}>
      {multi ? (
        <span className={CHECK} aria-hidden="true">
          {state === 'all' ? '✓' : state === 'some' ? '−' : ''}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <span className="flex-none text-[0.78rem] tabular-nums text-muted">{formatCopies(item.copies)}</span>
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
