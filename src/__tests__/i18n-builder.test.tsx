// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyLocale } from '../i18n'
import { PatternEditorDrawer } from '../components/probability/PatternEditorDrawer'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { buildPatternCompactSummary, buildPatternPreview } from '../components/probability/pattern-helpers'
import { CategoryPicker } from '../components/probability/rule-builder/CategoryPicker'
import { getConditionLabel, getKindLabel } from '../components/probability/rule-builder/condition-labels'
import { ConditionBlock } from '../components/probability/rule-builder/ConditionBlock'
import { KindToggle } from '../components/probability/rule-builder/KindToggle'
import { getConnectorWord, LogicSelector } from '../components/probability/rule-builder/LogicSelector'
import { RuleBuilder } from '../components/probability/rule-builder/RuleBuilder'
import { RuleReadback } from '../components/probability/rule-builder/RuleReadback'
import { TurnContextToggle } from '../components/probability/rule-builder/TurnContextToggle'
import type { ApiCardReference, CardEntry, HandPattern, Matcher, PatternCondition, RequirementKind } from '../types'

beforeEach(() => applyLocale('en'))

afterEach(() => {
  cleanup()
  applyLocale('es')
})

// ── Fixtures ──

const apiCard = (cardType: string): ApiCardReference => ({
  ygoprodeckId: 1,
  cardType,
  frameType: 'effect',
  description: null,
  race: null,
  attribute: null,
  level: null,
  linkValue: null,
  atk: null,
  def: null,
  archetype: null,
  ygoprodeckUrl: null,
  imageUrl: null,
  imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
})

const card = (id: string, name: string, cardType: string | null = null): CardEntry => ({
  id,
  name,
  copies: 3,
  source: 'manual',
  apiCard: cardType ? apiCard(cardType) : null,
  origin: 'non_engine',
  roles: ['handtrap'],
  needsReview: false,
})

const deck = [card('ash', 'Ash Blossom', 'Effect Monster'), card('pot', 'Pot of Prosperity', 'Spell Card'), card('nib', 'Nibiru', 'Effect Monster')]
const cardById = new Map(deck.map((entry) => [entry.id, entry]))

let nextId = 0
const condition = (matcher: Matcher | null, quantity = 1, kind: RequirementKind = 'include', distinct = false): PatternCondition => ({
  id: `c${nextId++}`,
  matcher,
  quantity,
  kind,
  distinct,
})

const pattern = (conditions: PatternCondition[], overrides: Partial<HandPattern> = {}): HandPattern => ({
  id: 'p',
  name: '',
  kind: 'opening',
  turnContext: 'either',
  logic: 'all',
  minimumConditionMatches: 1,
  reusePolicy: 'forbid',
  needsReview: false,
  conditions,
  ...overrides,
})

const role = (value: 'starter' | 'extender' | 'brick' | 'garnet'): Matcher => ({ type: 'role', value })
const actions = { addRequirement: vi.fn(), setRequirementCount: vi.fn(), setRequirementMatcher: vi.fn() } as unknown as PatternEditorActions

// ── Frases que describen una regla ──

describe('las frases de la regla, en inglés', () => {
  it('el resumen corto junta las condiciones, con el "+" de cantidad y el "without" de las que se excluyen', () => {
    const conditions = [condition(role('starter')), condition(role('extender'), 2), condition(role('brick'), 1, 'exclude'), condition(role('garnet'), 3, 'exclude')]

    expect(buildPatternCompactSummary(pattern([]), cardById)).toBe('Undefined rule')
    expect(buildPatternCompactSummary(pattern(conditions), cardById)).toBe('Starter + 2+ Extender + without Brick + without 3+ Garnet')
    expect(buildPatternCompactSummary(pattern([condition(role('starter')), condition(null)]), cardById)).toBe('Starter + not defined')
  })

  it('el resumen de "alcanza una" y de "al menos N" lleva sus propias palabras', () => {
    const three = [condition(role('starter')), condition(role('extender'), 2), condition({ type: 'attribute', value: 'DARK' })]

    expect(buildPatternCompactSummary(pattern(three.slice(0, 2), { logic: 'any' }), cardById)).toBe('One of these: Starter / 2+ Extender')
    expect(buildPatternCompactSummary(pattern(three, { logic: 'any', minimumConditionMatches: 2 }), cardById)).toBe('2 of these: Starter / 2+ Extender / Attribute DARK')
  })

  it('cada condición se lee con su singular o plural y con el criterio al final', () => {
    const read = (c: PatternCondition) => buildPatternPreview(pattern([c]), cardById).items[0]

    expect(read(condition(role('starter')))).toBe('at least 1 card with role Starter')
    expect(read(condition(role('extender'), 2))).toBe('at least 2 cards with role Extender')
    expect(read(condition(role('brick'), 1, 'exclude'))).toBe('you draw no cards with role Brick')
    expect(read(condition(role('brick'), 3, 'exclude'))).toBe("you don't draw 3 or more cards with role Brick")
    expect(read(condition({ type: 'card_type', value: 'spell' }, 2))).toBe('at least 2 cards of type Spell')
    expect(read(condition({ type: 'archetype', value: 'Blue-Eyes' }, 2))).toBe('at least 2 cards of the Blue-Eyes archetype')
    expect(read(condition({ type: 'attribute', value: 'DARK' }, 2))).toBe('at least 2 monsters with the DARK attribute')
    expect(read(condition({ type: 'level', value: 4 }, 1, 'include', true))).toBe('at least 1 distinct monster name of Level 4')
    expect(read(condition({ type: 'atk', value: 800 }, 1, 'exclude'))).toBe('you draw no monsters with 800 ATK')
  })

  it('una carta puntual o un pool dicen copias y nombres, y lo que falta del deck se avisa', () => {
    const read = (c: PatternCondition) => buildPatternPreview(pattern([c]), cardById).items[0]

    expect(read(condition({ type: 'card', value: 'ash' }))).toBe('at least 1 copy of Ash Blossom')
    expect(read(condition({ type: 'card', value: 'ash' }, 2))).toBe('at least 2 copies of Ash Blossom')
    expect(read(condition({ type: 'card', value: 'ash' }, 1, 'exclude'))).toBe('you draw no copies of Ash Blossom')
    expect(read(condition({ type: 'card', value: 'gone' }))).toBe('at least 1 copy of a card that is no longer in the deck')
    expect(read(condition({ type: 'card_pool', value: ['ash', 'nib'] }, 2, 'include', true))).toBe('at least 2 distinct names from the pool Ash Blossom, Nibiru')
    expect(read(condition({ type: 'card_pool', value: ['gone', 'also-gone'] }))).toBe('at least 1 card from a pool of cards')
  })

  it('el encabezado y la lógica de la lectura, y una condición sin criterio empieza con "(" (el editor lo usa)', () => {
    const three = [condition(role('starter')), condition(role('extender')), condition(role('brick'), 1, 'exclude')]

    expect(buildPatternPreview(pattern(three), cardById).heading).toBe('This opening requires:')
    expect(buildPatternPreview(pattern(three, { kind: 'problem' }), cardById).heading).toBe('This problem happens if:')
    expect(buildPatternPreview(pattern(three), cardById).logic).toBe('All conditions must be met.')
    expect(buildPatternPreview(pattern(three, { logic: 'any' }), cardById).logic).toBe('Meeting one condition is enough.')
    expect(buildPatternPreview(pattern(three, { logic: 'any', minimumConditionMatches: 3 }), cardById).logic).toBe('At least 3 conditions must be met.')
    expect(buildPatternPreview(pattern([condition(null)]), cardById).items[0]).toMatch(/^\(/)
  })

  it('los rótulos de condición y de tipo, y la palabra que une las condiciones', () => {
    expect(getKindLabel('include')).toBe('At least')
    expect(getKindLabel('exclude')).toBe('Without')
    expect(getConnectorWord('all')).toBe('AND')
    expect(getConnectorWord('any')).toBe('OR')
    expect(getConditionLabel(null, deck)).toBe('Not defined')
    expect(getConditionLabel({ type: 'card', value: 'gone' }, deck)).toBe('Card not in the deck')
    expect(getConditionLabel({ type: 'card_pool', value: ['ash', 'pot', 'nib'] }, deck)).toBe('Ash Blossom +2 more')
    expect(getConditionLabel({ type: 'card_pool', value: [] }, deck)).toBe('Empty pool')
    expect(getConditionLabel({ type: 'card_type', value: 'trap' }, deck)).toBe('Trap')
    expect(getConditionLabel({ type: 'level', value: 4 }, deck)).toBe('Level 4')
    expect(getConditionLabel({ type: 'archetype', value: 'Branded' }, deck)).toBe('Archetype Branded')
  })
})

// ── Pantallas ──

describe('el armador en inglés', () => {
  it('la lectura de la regla es una sola frase, con "and"/"or", la lógica y el turno', () => {
    const conditions = [condition(role('starter')), condition(role('brick'), 1, 'exclude')]
    const { rerender } = render(<RuleReadback pattern={pattern(conditions, { turnContext: 'first' })} cardById={cardById} />)

    expect(screen.getByText('This opening requires:')).toBeInTheDocument()
    expect(screen.getByText('At least 1 card with role Starter and you draw no cards with role Brick. Going first only.')).toBeInTheDocument()

    rerender(<RuleReadback pattern={pattern(conditions, { logic: 'any' })} cardById={cardById} />)

    expect(screen.getByText('At least 1 card with role Starter or you draw no cards with role Brick. Meeting one condition is enough.')).toBeInTheDocument()
  })

  it('el selector de lógica invierte sus palabras cuando todas las condiciones son "Without"', () => {
    const { rerender } = render(<LogicSelector patternId="p" currentMode="at-least" conditionCount={3} minimumConditionMatches={2} actions={actions} />)

    expect(screen.getByRole('radio', { name: 'AND · all' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'OR · any one' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'At least 2' })).toBeChecked()
    expect(screen.getByRole('group', { name: 'Minimum conditions to meet' })).toBeInTheDocument()
    expect(screen.getByText('of 3')).toBeInTheDocument()

    rerender(<LogicSelector patternId="p" currentMode="all" conditionCount={3} minimumConditionMatches={2} negated actions={actions} />)

    expect(screen.getByRole('radio', { name: 'AND · none present' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'OR · one missing' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'At least 2 missing' })).toBeInTheDocument()
  })

  it('los selectores de tipo de regla y de turno', () => {
    render(
      <>
        <KindToggle patternId="p" currentKind="opening" actions={actions} />
        <TurnContextToggle patternId="p" currentTurnContext="either" actions={actions} />
      </>,
    )

    expect(screen.getByRole('radiogroup', { name: 'Rule type' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Opening' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Problem' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Turn context' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Always' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Going first' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Going second' })).toBeInTheDocument()
  })

  it('una condición se nombra y se opera en inglés', () => {
    const own = condition({ type: 'card', value: 'ash' }, 2)

    render(<ConditionBlock index={0} patternId="p" pattern={pattern([own])} condition={own} derivedMainCards={deck} actions={actions} onRemove={vi.fn()} />)

    expect(screen.getByRole('article', { name: 'Condition 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What to count: Ash Blossom. Change' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'At least. Change to Without' })).toHaveAttribute('title', 'Change to "Without"')
    expect(screen.getByRole('button', { name: 'copies. Change to distinct names' })).toHaveAttribute('title', 'Count distinct names instead of copies')
    expect(screen.getByRole('button', { name: 'Remove condition 1' })).toBeInTheDocument()
  })

  it('el editor completo: pasos, avisos, botones y el texto de ayuda de la regla a medias', () => {
    const unfinished = pattern([condition(null)], { needsReview: true })

    render(<RuleBuilder actions={actions} derivedMainCards={deck} isPendingCreation={false} pattern={unfinished} />)

    expect(screen.getByText('This rule comes from an earlier version. Check these settings before trusting the result.')).toBeInTheDocument()
    for (const step of ['Name', 'Type', 'Turn', 'Conditions']) {
      expect(screen.getByRole('heading', { name: step })).toBeInTheDocument()
    }
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'Optional: otherwise the summary is used')
    expect(screen.getByRole('button', { name: 'Choose what to count' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'And another condition' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Or another condition' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Count the card you draw going second')).toBeInTheDocument()
    expect(screen.getByText('Rescue the cards it uses')).toBeInTheDocument()
    expect(screen.getByText('Problems count every card in the hand.')).toBeInTheDocument()
  })

  it('el selector de qué contar: grupos, tipos de carta y la cuenta de cartas elegidas (singular y plural)', () => {
    render(
      <CategoryPicker patternId="p" conditionId="c" currentMatcher={null} derivedMainCards={deck} usedCopies={new Map()} actions={actions} onClose={vi.fn()} />,
    )

    expect(screen.getByRole('heading', { name: 'What do you want to count?' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search cards, roles, archetypes…')).toBeInTheDocument()
    for (const group of ['Cards', 'Card type', 'Roles', 'Origin']) {
      expect(screen.getByRole('button', { name: group })).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: 'Card type' }))
    expect(screen.getByRole('button', { name: /^Monster/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Spell/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pick several cards' }))
    expect(screen.getByRole('button', { name: 'Several cards ✓' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Tap cards from any group to build the pool')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cards' }))
    fireEvent.click(screen.getByRole('button', { name: /^Ash Blossom/ }))
    expect(screen.getByText('1 card selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Nibiru/ }))
    expect(screen.getByText('2 cards selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use selection' })).toBeEnabled()
  })

  it('el panel lateral: título, ayuda y botones', () => {
    render(
      <PatternEditorDrawer
        actions={actions}
        canSave={false}
        impact={null}
        derivedMainCards={deck}
        drawerMode="custom-create"
        isPendingCreation
        pattern={null}
        onClose={vi.fn()}
        onRequestDelete={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'New rule' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Close editor' })).toHaveLength(2)
    expect(screen.getByText('Getting the editor ready…')).toBeInTheDocument()
    expect(screen.getByText('The analysis updates when you save.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create rule' })).toBeDisabled()
  })
})
