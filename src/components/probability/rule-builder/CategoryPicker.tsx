import { memo, useCallback, useMemo, useState } from 'react'

import type { CardEntry, CardOrigin, CardRole, CardType, Matcher } from '../../../types'
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
import { t } from '../../../i18n'
import { Heading } from '../../ui/Heading'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { SearchField } from '../../ui/SearchField'
import { overline } from '../../ui/typography'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { getCardTypeLabel } from './condition-labels'

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
  'inline-flex min-h-10 pointer-coarse:min-h-11 items-center gap-1.5 rounded-full border border-border-subtle bg-tint/5 px-3.5 text-body font-semibold text-foreground transition-[background-color,border-color] [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:shadow-focus active:scale-[0.97] data-[active=true]:border-primary/55 data-[active=true]:bg-primary/20 [&_span]:text-micro [&_span]:font-medium [&_span]:text-muted'

/** Fila: el estado (ninguna / algunas / todas las cartas elegidas) llega por data-state. */
const ROW =
  'group flex min-h-11 items-center gap-3 rounded-control border border-transparent bg-transparent px-3 text-left text-body text-foreground [-webkit-tap-highlight-color:transparent] [contain-intrinsic-size:auto_44px] [content-visibility:auto] hover:bg-tint/5 focus-visible:outline-none focus-visible:shadow-focus active:bg-tint/8 data-[state=all]:border-primary/50 data-[state=all]:bg-primary/14 data-[state=some]:border-primary/25'

const CHECK =
  'inline-grid size-5 flex-none place-items-center rounded-full border-[1.5px] border-border-strong text-micro font-bold leading-none group-data-[state=all]:border-primary group-data-[state=all]:bg-primary group-data-[state=all]:text-primary-foreground group-data-[state=some]:border-primary/70 group-data-[state=some]:text-primary-soft'

/** Roles fijados como atajo arriba del selector. */
const SHORTCUT_ROLES: readonly CardRole[] = ['starter', 'extender', 'brick']

/** Tipos de carta que se ofrecen; el rótulo sale de `getCardTypeLabel` al armar el selector. */
const CARD_TYPES: readonly CardType[] = ['monster', 'spell', 'trap']

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

/** Grupo del selector que corresponde a un criterio (clave de `buildSections`). */
function defaultOpenKey(matcher: Matcher | null): string {
  switch (matcher?.type) {
    case 'card':
    case 'card_pool':
      return 'cards'
    case 'archetype':
    case 'card_type':
    case 'origin':
    case 'attribute':
    case 'level':
    case 'monster_type':
    case 'atk':
    case 'def':
      return matcher.type
    default:
      return 'role'
  }
}

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

  // Acordeón: una sola pestaña abierta a la vez. Entra abierta la del criterio actual (o Roles, lo más
  // usado) para no arrancar con todo plegado; al buscar se abre la primera con resultados.
  const [openKey, setOpenKey] = useState<string | null>(() => defaultOpenKey(currentMatcher))
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
    <div className="flex h-full min-h-0 flex-col">
      <header className="grid flex-none gap-3 border-b border-border-subtle pb-3 pl-4 pr-14 pt-4">
        <Heading level="section" as="h3">
          {t('builder.picker.title')}
        </Heading>
        <SearchField label={t('builder.picker.search')} value={query} placeholder={t('builder.picker.placeholder')} inputClassName="h-11" onChange={setQuery} />
        <div className="flex flex-wrap gap-2">
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
            {t(isMulti ? 'builder.picker.multiOn' : 'builder.picker.multiOff')}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 pt-2">
        {visibleSections.length === 0 ? (
          <p className="m-0 mt-1 py-6 text-center text-body text-muted">{t(cards.length === 0 ? 'builder.picker.noCards' : 'builder.picker.noMatches')}</p>
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
                <p className="m-0 mt-1 text-body text-muted">{t('builder.picker.used', { names: hiddenCards.join(', ') })}</p>
              ) : null}
            </PickerGroup>
          ))
        )}
      </div>

      {isMulti ? (
        <footer className="flex flex-none items-center gap-3 border-t border-border-subtle px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
          <span className="min-w-0 flex-1 text-body font-semibold text-foreground">
            {selection.size > 0 ? t('builder.picker.selected', { count: selection.size }) : t('builder.picker.hint')}
          </span>
          {selection.size > 0 ? (
            <Button variant="tertiary" size="sm" onClick={() => setSelection(new Set())}>
              {t('builder.picker.clear')}
            </Button>
          ) : null}
          <Button variant="primary" size="sm" disabled={selection.size === 0} onClick={handleConfirm}>
            {t('builder.picker.confirm')}
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
      label: t('builder.picker.group.cards'),
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
      t('builder.picker.group.archetype'),
      buildDeckArchetypes(cards).map((archetype) => ({ key: archetype.name, label: archetype.name, copies: archetype.copies, cardIds: archetype.cardIds })),
      (row) => ({ type: 'archetype', value: String(row.key) }),
    ),
    group(
      'card_type',
      t('builder.picker.group.cardType'),
      buildCardTypeCounts(cards).map((entry) => ({ key: entry.value, label: entry.label, copies: entry.copies })),
      (row) => ({ type: 'card_type', value: row.key as CardType }),
    ),
    group(
      'role',
      t('builder.picker.group.role'),
      roleCounts.map((role) => ({ key: role.value, label: role.label, copies: role.copies })),
      (row) => ({ type: 'role', value: row.key as CardRole }),
    ),
    group(
      'origin',
      t('builder.picker.group.origin'),
      buildOriginCounts(cards).filter((origin) => origin.copies > 0).map((origin) => ({ key: origin.value, label: origin.label, copies: origin.copies })),
      (row) => ({ type: 'origin', value: row.key as CardOrigin }),
    ),
    group(
      'attribute',
      t('builder.picker.group.attribute'),
      buildDerivedDeckAttributes(cards).filter((a) => a.copies > 0).map((a) => ({ key: a.key, label: a.label, copies: a.copies, cardIds: a.cardIds })),
      (row) => ({ type: 'attribute', value: row.key } as Matcher),
    ),
    group(
      'level',
      t('builder.picker.group.level'),
      buildDerivedDeckLevels(cards).filter((l) => l.copies > 0).map((l) => ({ key: l.key, label: t('builder.label.level', { value: l.label }), copies: l.copies, cardIds: l.cardIds })),
      (row) => ({ type: 'level', value: row.key } as Matcher),
    ),
    group(
      'monster_type',
      t('builder.picker.group.monsterType'),
      buildDerivedDeckMonsterTypes(cards).filter((type) => type.copies > 0).map((type) => ({ key: type.key, label: type.label, copies: type.copies, cardIds: type.cardIds })),
      (row) => ({ type: 'monster_type', value: row.key } as Matcher),
    ),
    group(
      'atk',
      t('builder.picker.group.atk'),
      buildDerivedDeckAttackValues(cards).filter((a) => a.copies > 0).map((a) => ({ key: a.key, label: t('builder.label.atk', { value: a.label }), copies: a.copies, cardIds: a.cardIds })),
      (row) => ({ type: 'atk', value: row.key } as Matcher),
    ),
    group(
      'def',
      t('builder.picker.group.def'),
      buildDerivedDeckDefenseValues(cards).filter((d) => d.copies > 0).map((d) => ({ key: d.key, label: t('builder.label.def', { value: d.label }), copies: d.copies, cardIds: d.cardIds })),
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
    <section className="border-t border-border-subtle first:border-t-0">
      <button type="button" className={cx('flex min-h-11 w-full items-center gap-2 border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:shadow-focus', overline)} aria-expanded={open} onClick={() => onToggle(id)}>
        <Icon name="chevron-right" size={14} className={cx('transition-transform duration-150', open && 'rotate-90')} />
        {label}
      </button>
      {/* Las filas se montan sólo con el grupo abierto: abrir el selector es liviano aunque el deck sea grande. */}
      {open ? <div className="grid gap-1 pb-2.5">{children}</div> : null}
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
      <span className="flex-none text-body tabular-nums text-muted">{formatCopies(item.copies)}</span>
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
  value: CardOrigin
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

function matchesOrigin(origin: CardEntry['origin'], target: CardOrigin): boolean {
  return origin === target
}

interface CardTypeCount {
  value: CardType
  label: string
  copies: number
}

function buildCardTypeCounts(cards: CardEntry[]): CardTypeCount[] {
  return CARD_TYPES
    .map((value) => {
      const copies = cards
        .filter((card) => {
          const ct = card.apiCard?.cardType.toLowerCase() ?? ''
          return ct.includes(value)
        })
        .reduce((total, card) => total + card.copies, 0)

      return { value, label: getCardTypeLabel(value), copies }
    })
    .filter((entry) => entry.copies > 0)
}
