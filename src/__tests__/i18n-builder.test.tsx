// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'

import { buildDerivedDeckGroupMap } from '../app/deck-groups'
import { applyLocale } from '../i18n'
import { PatternEditorDrawer } from '../components/probability/PatternEditorDrawer'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { buildPatternCompactSummary, buildPatternPreview, joinWord } from '../components/probability/pattern-helpers'
import { CategoryPicker } from '../components/probability/rule-builder/CategoryPicker'
import { getConditionLabel, getKindLabel } from '../components/probability/rule-builder/condition-labels'
import { ConditionBlock } from '../components/probability/rule-builder/ConditionBlock'
import { KindToggle } from '../components/probability/rule-builder/KindToggle'
import { LogicSelector } from '../components/probability/rule-builder/LogicSelector'
import { RuleBuilder } from '../components/probability/rule-builder/RuleBuilder'
import { RuleReadback } from '../components/probability/rule-builder/RuleReadback'
import { TurnContextToggle } from '../components/probability/rule-builder/TurnContextToggle'
import type { ApiCardReference, CardEntry, HandPattern, Matcher, PatternCondition, RequirementKind } from '../types'

// La imagen de una carta lee el formato del deck (su etiqueta de límite): alcanza con un store mínimo.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

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
    expect(joinWord(pattern([condition(role('starter')), condition(role('extender'))]))).toBe('and')
    expect(joinWord(pattern([condition(role('starter')), condition(role('extender'))], { logic: 'any' }))).toBe('or')
    expect(joinWord(pattern([condition(role('starter')), condition(role('extender'))], { logic: 'any', minimumConditionMatches: 2 }))).toBe('and / or')
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
  it('la regla se lee en una sola frase, con lo que decide en negrita y el turno al final', () => {
    const conditions = [condition(role('starter')), condition(role('brick'), 1, 'exclude')]
    const { container, rerender } = render(<RuleReadback pattern={pattern(conditions, { turnContext: 'first' })} cardById={cardById} />)

    expect(container.querySelector('p')).toHaveTextContent('Opening')
    expect(container.querySelector('p > span:last-child')).toHaveTextContent('The hand has at least 1 card with role Starter and has no card with role Brick. Going first only.')
    expect(container.querySelector('b')).toHaveTextContent('has at least 1 card with role Starter and has no card with role Brick')

    rerender(<RuleReadback pattern={pattern(conditions, { logic: 'any' })} cardById={cardById} />)
    expect(container.querySelector('p > span:last-child')).toHaveTextContent('The hand has any of these: Starter or without Brick.')

    rerender(<RuleReadback pattern={pattern([condition(null)], { kind: 'problem', turnContext: 'second', ignoresDraw: true })} cardById={cardById} />)
    expect(container.querySelector('p')).toHaveTextContent('Problem')
    expect(container.querySelector('p > span:last-child')).toHaveTextContent('The hand has (what it counts is missing). Going second only, with your first 5.')
  })

  it('cómo se combinan las condiciones, con palabras', () => {
    render(<LogicSelector patternId="p" currentMode="at-least" conditionCount={3} minimumConditionMatches={2} actions={actions} />)

    expect(screen.getByText('With 3 conditions, the hand meets:')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Any' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'A minimum' })).toBeChecked()
    expect(screen.getByRole('group', { name: 'Minimum conditions to meet' })).toBeInTheDocument()
    expect(screen.getByText(/of the 3/)).toBeInTheDocument()
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
    expect(screen.getByRole('radiogroup', { name: 'When the rule applies' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Always' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Going first' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Going second' })).toBeInTheDocument()
  })

  it('una condición se nombra y se opera en inglés', () => {
    const own = condition({ type: 'card', value: 'ash' }, 2)

    render(
      <ConditionBlock
        index={0}
        count={1}
        patternId="p"
        pattern={pattern([own])}
        condition={own}
        derivedMainCards={deck}
        groupsByKey={buildDerivedDeckGroupMap(deck)}
        actions={actions}
        onRemove={vi.fn()}
        onPick={vi.fn()}
        onMoveBy={vi.fn()}
        onDragStart={vi.fn()}
      />,
    )

    expect(screen.getByRole('article', { name: 'Condition 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What it counts: Ash Blossom. Change' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Has' })).toBeChecked()
    expect(screen.getByRole('radio', { name: "Doesn't have" })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Distinct names' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove condition 1' })).toBeInTheDocument()
  })

  it('el editor completo: pasos, avisos, botones y los ajustes que aplican', () => {
    const unfinished = pattern([condition(null)], { needsReview: true })

    render(<RuleBuilder actions={actions} derivedMainCards={deck} pattern={unfinished} onPickCondition={vi.fn()} onMoveCondition={vi.fn()} />)

    expect(screen.getByText('This rule comes from an earlier version. Check these settings before trusting the result.')).toBeInTheDocument()
    for (const step of ['What it is', 'When it applies', 'The hand has']) {
      expect(screen.getByRole('heading', { name: step })).toBeInTheDocument()
    }
    expect(screen.getByRole('textbox', { name: 'Name (optional)' })).toHaveAttribute('placeholder', 'Leave it empty to use the sentence above')
    expect(screen.getByRole('button', { name: 'Choose what it counts' })).toBeInTheDocument()
    expect(screen.getByText('Choose what this condition counts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settings for this rule' })).toBeInTheDocument()
    // «Contar la carta que robás» sólo aparece si la regla vale yendo 2º.
    expect(screen.queryByText('Count the card you draw')).not.toBeInTheDocument()
    expect(screen.getByText('Rescue the cards it uses')).toBeInTheDocument()
    expect(screen.getByText('Off: problems count every card in the hand.')).toBeInTheDocument()
  })

  it('qué cuenta, en tres pestañas: Roles (apagados los que no tienen copias), Cartas (una o varias) y Más', () => {
    const onUse = vi.fn()

    render(
      <Provider store={store}>
        <CategoryPicker index={1} currentMatcher={null} derivedMainCards={deck} usedCopies={new Map()} onBack={vi.fn()} onClose={vi.fn()} onUse={onUse} />
      </Provider>,
    )

    expect(screen.getByRole('heading', { name: 'What condition 1 counts' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search a role, a card or an archetype')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Roles' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Starter, 0 copies' })).toBeDisabled()
    expect(screen.getByText("You haven't picked anything yet")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use the selection' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Handtrap, 9 copies' }))
    expect(screen.getByText('Handtrap · 9 copies')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use Handtrap' }))
    expect(onUse).toHaveBeenCalledWith({ type: 'role', value: 'handtrap' })

    fireEvent.click(screen.getByRole('radio', { name: 'Cards' }))
    fireEvent.click(screen.getByRole('button', { name: /^Ash Blossom/ }))
    expect(screen.getByRole('button', { name: 'Use Ash Blossom' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /^Nibiru/ }))
    expect(screen.getByText('2 cards picked')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use 2 cards' }))
    expect(onUse).toHaveBeenLastCalledWith({ type: 'card_pool', value: ['ash', 'nib'] })

    fireEvent.click(screen.getByRole('radio', { name: 'More' }))
    expect(screen.getByRole('heading', { name: 'Card type' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monster, 6 copies' })).toBeInTheDocument()
  })

  it('el panel lateral: primero los ejemplos; después, el editor con su pie', () => {
    const props = {
      isOpen: true,
      mode: 'create' as const,
      actions,
      canSave: false,
      impact: { impact: null, pending: false },
      derivedMainCards: deck,
      blockReason: 'Choose what it counts',
      duplicateOf: null,
      onPickExample: vi.fn(() => null),
      onClose: vi.fn(),
      onSave: vi.fn(),
    }
    const { rerender } = render(<PatternEditorDrawer {...props} showExamples pattern={pattern([condition(null)])} />)

    expect(screen.getByRole('dialog', { name: 'New rule' })).toBeInTheDocument()
    for (const example of ['Open your key card', 'Starter + combo piece', '2+ Handtraps going second', 'No interaction']) {
      expect(screen.getByRole('button', { name: (name) => name.includes(example) })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Start from scratch' }))
    expect(props.onPickExample).toHaveBeenCalledWith('blank')
    expect(screen.queryByRole('button', { name: 'Create rule' })).not.toBeInTheDocument()

    rerender(<PatternEditorDrawer {...props} showExamples={false} pattern={pattern([condition(null)])} />)
    expect(screen.getByText('Choose what it counts to see how many hands have this opening')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Not measured: the rule is incomplete' })).toBeInTheDocument()
    expect(screen.getByText('Choose what it counts', { selector: 'footer span' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create rule' })).toBeDisabled()
  })
})
