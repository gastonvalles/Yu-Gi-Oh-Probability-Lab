// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { createElement, useEffect } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyLocale } from '../i18n'
import { createMatState, describeMatAction, listCardActions, replayMat, TOKEN_KIND, type MatAction, type MatCardKind, type MatState } from '../app/practice-mat'
import { createSavedCombo, uniqueComboName } from '../app/saved-combos'
import { useMatSession } from '../app/use-mat-session'
import { createMatcherPattern } from '../app/pattern-factory'
import { buildDerivedDeckGroupMap } from '../app/deck-groups'
import { PracticeMat, type MatCard } from '../components/probability/PracticeMat'
import { PracticeMatPanel } from '../components/probability/PracticeMatPanel'
import { buildPracticeDeck, describePracticeMatch, describeRuleCondition, evaluatePracticeHand } from '../components/probability/practice'
import type { ApiCardReference, CardEntry } from '../types'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

const MONSTER: MatCardKind = { monster: true, spell: false, trap: false, extra: false, effect: true, fieldSpell: false, pendulum: false, fusion: false, synchro: false, xyz: false, link: false, level: 4 }
const XYZ: MatCardKind = { ...MONSTER, extra: true, xyz: true }
const KINDS: Record<string, MatCardKind> = { a1: MONSTER, a2: MONSTER, b1: MONSTER, c1: { ...MONSTER, level: 7 }, d1: MONSTER, e1: MONSTER, f1: MONSTER, x1: XYZ }
const kindOf = (id: string) => KINDS[id] ?? TOKEN_KIND
const nameOf = (id: string) => id.toUpperCase()

const start = () => createMatState(['a1', 'a2', 'b1', 'c1', 'd1', 'e1', 'f1'], ['x1'], 5)
const run = (actions: MatAction[], from = start()) => replayMat(from, actions)
const labels = (state: MatState, id: string) => listCardActions(state, id, kindOf, nameOf).map((item) => item.label)

beforeEach(() => applyLocale('en'))
afterEach(() => {
  cleanup()
  applyLocale('es')
})

describe('la mesa de práctica en inglés', () => {
  it('cuenta cada jugada en segunda persona, con plurales y los términos oficiales', () => {
    const state = start()
    const describe = (action: MatAction, from: MatState = state) => describeMatAction(from, action, nameOf)

    expect(describe({ type: 'draw', count: 1 })).toBe('You draw E1')
    expect(describe({ type: 'draw', count: 2 })).toBe('You draw 2 cards')
    expect(describe({ type: 'draw', count: 1 }, { ...state, deck: [] })).toBe('You draw 1 card')
    expect(describe({ type: 'mill', count: 3 })).toBe('You send 3 cards from the Deck to Graveyard')
    expect(describe({ type: 'move', id: 'e1', to: 'hand', shuffle: 5 })).toBe('You add E1 from the Deck to your hand and shuffle')
    expect(describe({ type: 'move', id: 'x1', to: 'hand' })).toBe('X1 goes from the Extra Deck to your hand')
    expect(describe({ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'def', how: 'special' })).toBe('You Special Summon A1 in Defense Position')
    expect(describe({ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'set' })).toBe('You Set A1 face-down')
    expect(describe({ type: 'place', id: 'a1', zone: 'st', index: 0, pos: 'atk', how: 'scale' })).toBe('You activate A1 as a Pendulum Scale')
    expect(describe({ type: 'activate', id: 'a1', cost: 'banish' })).toBe('You activate the effect of A1, banishing it')
  })

  it('arma las listas con coma y "and", y los pasos de un turno nuevo y de una ficha', () => {
    const state = start()
    const end = run([{ type: 'phase', phase: 'end' }])
    const describe = (action: MatAction, from: MatState = state) => describeMatAction(from, action, nameOf)

    expect(describe({ type: 'tribute', id: 'c1', tributes: ['a1', 'a2'], zone: 'mz', index: 0, pos: 'atk' })).toBe('You Normal Summon C1 (Tributing A1 and A2)')
    expect(describe({ type: 'tribute', id: 'c1', tributes: ['a1'], zone: 'mz', index: 0, pos: 'set' })).toBe('You Set C1 face-down by Tributing A1')
    expect(describe({ type: 'summon', id: 'x1', how: 'xyz', materials: ['a1', 'a2', 'b1'], zone: 'emz', index: 0, pos: 'def' })).toBe('You Xyz Summon X1 in Defense Position (materials: A1, A2, and B1)')
    expect(describe({ type: 'phase', phase: 'battle' })).toBe('You go to the Battle Phase')
    expect(describe({ type: 'phase', phase: 'draw' }, end)).toBe('Turn 2: Draw Phase, you draw E1')
    expect(describe({ type: 'token', zone: 'emz', index: 0, pos: 'def' })).toBe('You Special Summon a Token in Defense Position, Extra Monster Zone 1')
    expect(describe({ type: 'token', zone: 'mz', index: 1 })).toBe('You Special Summon a Token in Attack Position, Monster Zone 2')

    const withToken = run([{ type: 'token', zone: 'mz', index: 0 }])
    expect(describe({ type: 'target', id: 'token-1' }, withToken)).toBe('You target the Token')
    expect(describe({ type: 'counter', id: 'token-1', delta: 2 }, withToken)).toBe('Counters on the Token: 2')
  })

  it('un lote se cuenta en una línea, con la lista en inglés y el verbo de acuerdo con la cantidad', () => {
    const describe = (action: MatAction, from: MatState = start()) => describeMatAction(from, action, nameOf)
    const batch = (ids: string[], part: (id: string) => MatAction, ...after: MatAction[]): MatAction => ({ type: 'batch', actions: [...ids.map(part), ...after] })
    const gy = run([{ type: 'move', id: 'a1', to: 'gy' }, { type: 'move', id: 'a2', to: 'gy' }, { type: 'move', id: 'b1', to: 'gy' }, { type: 'move', id: 'c1', to: 'gy' }])
    const banished = run([{ type: 'move', id: 'a1', to: 'banished' }, { type: 'move', id: 'a2', to: 'banished' }])

    expect(describe({ type: 'batch', actions: [{ type: 'shuffle', seed: 1 }, { type: 'move', id: 'e1', to: 'hand' }, { type: 'move', id: 'f1', to: 'hand' }] })).toBe('You add E1 and F1 from the Deck to your hand and shuffle')
    expect(describe(batch(['e1', 'f1'], (id) => ({ type: 'move', id, to: 'gy' })))).toBe('You send E1 and F1 from the Deck to Graveyard')
    expect(describe(batch(['a1', 'a2', 'b1'], (id) => ({ type: 'move', id, to: 'gy' })))).toBe('A1, A2, and B1 go to Graveyard')
    expect(describe(batch(['a1', 'a2', 'b1', 'c1'], (id) => ({ type: 'move', id, to: 'banished', faceDown: true })))).toBe('You banish 4 cards face-down')
    expect(describe(batch(['a1', 'a2', 'b1', 'c1'], (id) => ({ type: 'move', id, to: 'extra' })), gy)).toBe('4 cards return to the Extra Deck')
    expect(describe(batch(['a1', 'a2'], (id) => ({ type: 'move', id, to: 'extra', faceUp: true })), gy)).toBe('A1 and A2 go to the Extra Deck face-up')
    expect(describe(batch(['a1', 'a2'], (id) => ({ type: 'move', id, to: 'hand' })), banished)).toBe('A1 and A2 go from the banished zone to your hand')
    expect(describe(batch(['a1', 'a2', 'b1'], (id) => ({ type: 'move', id, to: 'deck' }), { type: 'shuffle', seed: 3 }), gy)).toBe('You shuffle A1, A2, and B1 into the Deck')

    const target = batch(['a1', 'a2', 'b1'], (id) => ({ type: 'target', id }))
    expect(describe(target, gy)).toBe('You target A1, A2, and B1')
    expect(describe(target, run([target], gy))).toBe('You remove the target from A1, A2, and B1')
    // Una sola carta: en singular, como siempre.
    expect(describe(batch(['a1'], (id) => ({ type: 'move', id, to: 'gy' })))).toBe('A1 goes to Graveyard')
  })

  it('el menú de una carta ofrece las jugadas con su nombre oficial', () => {
    expect(labels(start(), 'a1')).toEqual(['Normal Summon', 'Set', 'Special Summon', 'Activate effect', 'Reveal', 'Target', 'Discard', 'Banish', 'To the Deck'])
    expect(listCardActions(start(), 'a1', kindOf, nameOf).find((item) => item.label === 'Special Summon')!.choices?.map((choice) => choice.label)).toEqual(['Attack', 'Defense'])
    expect(labels(start(), 'x1')).toEqual(['Special Summon', 'Reveal', 'To Graveyard', 'Banish'])
    expect(listCardActions(start(), 'x1', kindOf, nameOf).find((item) => item.label === 'Banish')!.choices?.map((choice) => choice.label)).toEqual(['Face-up', 'Face-down'])

    const two = run([{ type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk' }, { type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }])
    expect(labels(two, 'c1').slice(0, 2)).toEqual(['Normal Summon', 'Set'])
    expect(labels(two, 'a1')).toEqual(['Activate effect', 'Switch to Defense', 'Turn face-down', 'Attach to X1', 'Target', 'To the Spell & Trap Zone', 'To hand', 'To Graveyard', 'Banish', 'To the Deck'])

    // Con varios materiales, «Detach» pregunta cuál; con dos Xyz en el campo (F1 hace de otro), «Attach to an Xyz» pregunta a cuál, también desde el Graveyard.
    const withF1 = (id: string) => (id === 'f1' ? XYZ : kindOf(id))
    const full = run([{ type: 'attach', id: 'a2', to: 'x1' }, { type: 'attach', id: 'b1', to: 'x1' }, { type: 'place', id: 'f1', zone: 'mz', index: 1, pos: 'atk' }, { type: 'move', id: 'd1', to: 'gy' }], two)
    const menu = (id: string) => listCardActions(full, id, withF1, nameOf)
    expect(menu('x1').find((item) => item.label === 'Detach')?.choices?.map((choice) => choice.label)).toEqual(['A2', 'B1'])
    expect(menu('d1').find((item) => item.label === 'Attach to an Xyz')?.choices?.map((choice) => choice.label)).toEqual(['F1', 'X1'])
  })

  it('el nombre de un combo sin nombre sale en el idioma de ese momento', () => {
    expect(uniqueComboName('', [])).toBe('Unnamed combo')
    expect(uniqueComboName('  ', [])).toBe('Unnamed combo')
    applyLocale('es')
    expect(uniqueComboName('', [])).toBe('Combo sin nombre')
  })
})

describe('las salidas y problemas de la mano en inglés', () => {
  const card = (id: string, name: string, copies: number, roles: CardEntry['roles']): CardEntry => ({ id, name, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false })
  const cards = [card('card-1', 'Starter', 2, ['starter']), card('card-2', 'Brick', 3, ['brick']), card('card-3', 'Filler', 5, ['enabler'])]
  const deck = buildPracticeDeck(cards)
  const groups = buildDerivedDeckGroupMap(cards)
  const pick = (ids: string[]) => ids.map((id, index) => ({ ...deck.find((entry) => entry.cardId === id)!, drawId: `${id}-${index}` }))

  it('quita el "The rule is met if" y deja la condición; resume las listas largas', () => {
    expect(describeRuleCondition('The rule is met if you open 1 copy of Role: Starter.')).toBe('You open 1 copy of Role: Starter.')
    expect(describeRuleCondition('The rule, without reusing the same card across conditions, is met if you open 1 copy of A and you open 1 copy of B.')).toBe(
      'Without reusing cards: you open 1 copy of A and you open 1 copy of B.',
    )
    expect(describeRuleCondition('The rule is met if you open 1 copy of (A / B / C / D / E).')).toBe('You open 1 copy of (5 cards).')
    expect(describeRuleCondition('No requirements')).toBe('No requirements')
  })

  it('lo que arma el motor en inglés se explica sin el prefijo, y lo que faltó o bloquea sale con su plural', () => {
    const opening = createMatcherPattern('Starter + Brick', 'opening', [
      { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
      { matcher: { type: 'role', value: 'enabler' }, quantity: 1, kind: 'include' },
    ])
    const starter = createMatcherPattern('Starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])
    const noBrick = createMatcherPattern('Clean', 'opening', [{ matcher: { type: 'role', value: 'brick' }, quantity: 1, kind: 'exclude' }])

    const hand = pick(['card-1', 'card-3', 'card-3', 'card-3', 'card-3'])
    expect(describePracticeMatch(evaluatePracticeHand(hand, [starter], cards, groups, 'first').matches[0]!, 0)).toMatch(/^You open 1 copy of /)
    // Dos condiciones que no comparten cartas: el motor lo dice y la explicación lo conserva.
    expect(describePracticeMatch(evaluatePracticeHand(hand, [opening], cards, groups, 'first').matches[0]!, 0)).toMatch(/^Without reusing cards: you open 1 copy of /)

    const missing = evaluatePracticeHand(pick(['card-2', 'card-3', 'card-3', 'card-3', 'card-3']), [opening], cards, groups, 'first')
    expect(missing.openingNearMisses[0]!.notes[0]).toMatch(/^Missing /)

    const blocked = evaluatePracticeHand(pick(['card-2', 'card-2', 'card-3', 'card-3', 'card-3']), [noBrick], cards, groups, 'first')
    expect(blocked.openingNearMisses[0]!.notes[0]).toMatch(/^Blocked: .* already appears 2 times in your hand\.$/)
  })
})

describe('el panel de la mesa en inglés', () => {
  it('lista los combos guardados con su cantidad de jugadas y la fecha del idioma', () => {
    const initial = createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], [], 5)
    const combo = createSavedCombo(
      { name: 'Basic line', deckName: 'Yummy', initial, actions: [{ type: 'draw', count: 1 }], nameOf: (id) => id },
      [],
      new Date('2026-10-11T12:00:00Z'),
    )

    render(createElement(PracticeMatPanel, { steps: [], initial, cursor: 0, onSeek: () => {}, nameOf: (id: string) => id, artOf: () => null, combos: [combo], deckName: 'Yummy', onLoad: () => {}, onRename: () => {}, onDelete: () => {} }))

    expect(screen.getByText('No plays yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Combos/ }))
    expect(screen.getByText('Yummy · 1 play · Oct 11, 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load Basic line' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Basic line' }))
    expect(screen.getByRole('dialog', { name: 'Rename combo' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete Basic line' }))
    expect(screen.getByText('Delete “Basic line”?')).toBeInTheDocument()
  })
})

describe('la mesa dibujada en inglés', () => {
  const apiCard = (ygoprodeckId: number, frameType: string) =>
    ({ ygoprodeckId, frameType, race: null, cardType: 'x', description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null }) as unknown as ApiCardReference
  const CARDS: ReadonlyMap<string, MatCard> = new Map([
    ['card-1-1', { name: 'Ash Blossom', apiCard: apiCard(1, 'effect') }],
    ['card-2-1', { name: 'Maxx C', apiCard: apiCard(2, 'effect') }],
    ['card-3-1', { name: 'Called by the Grave', apiCard: apiCard(3, 'spell') }],
    ['card-4-1', { name: 'Nibiru', apiCard: apiCard(4, 'effect') }],
    ['card-5-1', { name: 'Droll', apiCard: apiCard(5, 'effect') }],
    ['card-6-1', { name: 'Imperm', apiCard: apiCard(6, 'trap') }],
  ])
  const INITIAL = createMatState([...CARDS.keys()], [], 5)

  function MatHarness() {
    const mat = useMatSession()
    const { start: begin } = mat

    useEffect(() => {
      begin(INITIAL)
    }, [begin])

    if (!mat.session || !mat.state) return null

    return createElement(PracticeMat, { session: mat.session, state: mat.state, cardsById: CARDS, deckName: 'Test', onDispatch: mat.dispatch, onUndo: mat.undo, onSeek: mat.seek, onLoadCombo: () => {}, onNewHand: () => begin(INITIAL) })
  }

  const pointer = { button: 0, pointerId: 1 }
  const tap = (element: HTMLElement) => {
    fireEvent.pointerDown(element, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(element, { ...pointer, clientX: 10, clientY: 10 })
  }

  beforeEach(() => {
    localStorage.clear()
    HTMLElement.prototype.setPointerCapture = () => {}
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  })

  it('la barra, los menús, el paso que pide la zona y la jugada anotada salen en inglés', () => {
    const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
    render(createElement(Provider, { store, children: createElement(MatHarness) }))

    const toolbar = screen.getByRole('toolbar', { name: 'Mat' })
    const status = () => screen.getByRole('status', { name: 'Current step' })
    const hand = () => screen.getByRole('list', { name: 'Hand' })
    const zone = (name: string) => screen.getByRole('group', { name })

    // El + está al medio del campo, no en la barra de arriba.
    expect(within(toolbar).queryByRole('button', { name: 'Token' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Token' })).toHaveAttribute('title', 'Create a Token')
    expect(within(toolbar).getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByLabelText('Turn 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Phases:/ })).toHaveAccessibleName('Phases: Draw Phase')
    expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
    expect(status()).toHaveTextContent('Drag a card to a zone or tap it to see what you can do.')

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    // En el celular la carta de la mano se abre en la hoja con todas las jugadas a la vista: las del juego y, aparte, las de apoyo (no hay «More»).
    expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View card' })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent).slice(0, 4)).toEqual(['Normal Summon', 'Set', 'Special Summon', 'Activate effect'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Normal Summon' }))
    expect(status()).toHaveTextContent('Tap the zone for Normal Summon')
    fireEvent.click(screen.getByRole('button', { name: 'Choose Monster Zone 1' }))

    expect(within(zone('Monster Zone 1')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(status()).toHaveTextContent('You Normal Summon Ash Blossom')

    tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Special Summon' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Defense' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose Monster Zone 2' }))
    expect(within(zone('Monster Zone 2')).getByRole('button', { name: 'Maxx C, Defense Position' })).toBeInTheDocument()

    // El menú del deck (con el teclado: tocarlo es buscar) y lo que dice su title.
    expect(screen.getByRole('button', { name: 'Main: 1' })).toHaveAttribute('title', 'Main Deck · Tap: search · Drag: draw · Hold: options')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Main: 1' }), { key: 'Enter' })
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Draw', 'Reveal the top card', 'Send to Graveyard', 'Banish the top card', 'View the Deck', 'Shuffle'])
    expect(screen.getByRole('menu', { name: '1 card' })).toBeInTheDocument()

    // Desterrar pregunta cómo queda: boca arriba (la pila muestra la carta) o boca abajo (de dorso).
    fireEvent.click(screen.getByRole('menuitem', { name: 'Banish the top card' }))
    expect(screen.getByRole('region', { name: '1 card' })).toHaveTextContent('Banish the top card')
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Face-up', 'Face-down'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Face-up' }))
    expect(status()).toHaveTextContent(/You banish Imperm$/)
    expect(screen.getByRole('button', { name: 'Banish: 1' }).querySelector('[data-card-art]')).not.toBeNull()

    fireEvent.click(within(toolbar).getByRole('button', { name: 'Undo' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Main: 1' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Banish the top card' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Face-down' }))
    expect(status()).toHaveTextContent('You banish Imperm face-down')
    expect(screen.getByRole('button', { name: 'Banish: 1' }).querySelector('[data-card-art]')).toBeNull()

    // El cartel de la fase lleva el turno en el idioma activo y la mira de un objetivo, su nombre.
    fireEvent.click(screen.getByRole('button', { name: /^Phases:/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'End Phase' }))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'End your turn?' })).getByRole('button', { name: 'End turn' }))
    expect(document.querySelector('[data-fx="banner"]')).toHaveTextContent('Turn 2Draw Phase')
    tap(within(hand()).getByRole('listitem', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
    expect(within(hand()).getByRole('img', { name: 'Targeted' })).toHaveAttribute('data-fx', 'target')
  })
})
