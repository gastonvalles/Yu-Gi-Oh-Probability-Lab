// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CardRef } from '../app/auto/adapter'
import { CHAIN_LINGER_MS, CHAIN_LINK_MS, CHAIN_SOLVE_MS, type ChainStep } from '../app/auto/chain-feed'
import { setAutoPref } from '../app/auto-prefs'
import { readHandtrapConfig, writeHandtrapConfig } from '../app/handtraps'
import { AutoSoloScreen, RIVAL_READ_MS, type AutoSoloScreenProps } from '../components/auto/AutoSoloScreen'
import { CARDS, fakeSession, type FakeSession } from './support/auto-session-fake'
import { dispatches } from './support/auto-screen-harness'
import { render } from './support/practice-mat-harness'

// El rival de handtraps en la pantalla: con qué rival se arma el duelo, su mano boca arriba (o de dorso, «A ciegas») y cambiar las handtraps desde «Más opciones», que arma
// el duelo de nuevo con la misma semilla.

const ASH = { id: 14558127, name: 'Ash Blossom & Joyous Spring' }
const VEILER = { id: 97268402, name: 'Effect Veiler' }
const IMPERM = { id: 10045474, name: 'Infinite Impermanence' }
type Options = Parameters<NonNullable<AutoSoloScreenProps['connect']>>[1]

/** La pantalla con una sesión de mentira por cada `connect` (la semilla del duelo es 99), y lo que se le pidió a cada una. */
function mount() {
  const calls: Options[] = []
  const fakes: FakeSession[] = []

  render(
    <AutoSoloScreen
      mainIds={[...CARDS.keys()].filter((id) => id !== 'card-500-1')}
      extraIds={['card-500-1']}
      cardsById={CARDS}
      deckName="Test"
      onExit={() => {}}
      connect={(_deck, options) => {
        const fake = fakeSession()

        fake.set({ seed: 99, names: { ...fake.getSnapshot().names, [ASH.id]: ASH.name, [VEILER.id]: VEILER.name } })
        calls.push(options)
        fakes.push(fake)

        return fake
      }}
    />,
  )

  return { calls, fakes }
}

const rivalHand = () => screen.getByRole('img', { name: /^Mano del rival:/ })
const more = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Más opciones del duelo' }))

  return screen.getByRole('dialog', { name: 'Más opciones del duelo' })
}

afterEach(() => act(() => setAutoPref('blind', false)))

describe('auto-screen · el rival de handtraps', () => {
  it('con el simulador apagado, el rival es el pasivo de siempre: su mano de dorso y «Más opciones» dice que no juega', () => {
    const { calls } = mount()

    expect(calls).toEqual([{ rival: null }])
    expect(rivalHand()).toHaveAccessibleName('Mano del rival: 0')
    const dialog = more()

    expect(dialog).toHaveTextContent('Apagadas: el rival no usa nada.')
    expect(dialog).toHaveTextContent('El rival no juega: sólo recibe.')
    expect(within(dialog).queryByRole('switch', { name: 'A ciegas' })).toBeNull()
  })

  it('encendido: el duelo se arma con sus handtraps y su mano (la del simulador), se ve boca arriba y «A ciegas» la da vuelta', () => {
    writeHandtrapConfig({ enabled: true, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 1 }, { ...IMPERM, copies: 1 }], hand: 2 })
    const { calls, fakes } = mount()
    const rival = calls[0]!.rival!

    expect(rival.main).toEqual([[ASH.id, 1], [VEILER.id, 1], [IMPERM.id, 1]])
    expect(rival.hand(5)).toHaveLength(2)
    act(() => fakes[0]!.set({ rivalHand: [ASH.id, VEILER.id], theirs: { ...fakes[0]!.getSnapshot().theirs, hand: ['c2', 'c3'] } }))
    expect(rivalHand()).toHaveAccessibleName(`Mano del rival: ${ASH.name}, ${VEILER.name}`)

    const dialog = more()

    expect(dialog).toHaveTextContent(`${ASH.name}, ${VEILER.name}, ${IMPERM.name} · 2 en la mano`)
    expect(dialog).not.toHaveTextContent('El rival no juega')
    fireEvent.click(within(dialog).getByRole('switch', { name: 'A ciegas' }))
    expect(rivalHand()).toHaveAccessibleName('Mano del rival: 2')
    expect(localStorage.getItem('ygo-lab:auto-blind')).toBe('on')
    expect(dispatches).toBe(0)
  })

  it('«Cambiar handtraps» abre la hoja del simulador; aplicar guarda y arma el duelo de nuevo con la misma semilla; apagarlo vuelve al pasivo', () => {
    writeHandtrapConfig({ enabled: true, picks: [{ ...ASH, copies: 1 }], hand: 1 })
    const { calls, fakes } = mount()

    fireEvent.click(within(more()).getByRole('button', { name: 'Cambiar handtraps' }))
    const sheet = screen.getByRole('dialog', { name: 'Handtraps del rival' })

    expect(sheet).toHaveTextContent('Al aplicar, el duelo empieza de nuevo.')
    fireEvent.click(within(within(sheet).getByRole('group', { name: `Copias de ${VEILER.name} en el deck del rival` })).getByRole('button', { name: 'Uno más' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Usar estas handtraps' }))

    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({ seed: 99 })
    expect(calls[1]!.rival!.main).toEqual([[ASH.id, 1], [VEILER.id, 1]])
    expect(fakes[0]!.destroyed).toBe(true)
    expect(readHandtrapConfig().picks.map((pick) => pick.id)).toEqual([ASH.id, VEILER.id])

    fireEvent.click(within(more()).getByRole('button', { name: 'Cambiar handtraps' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apagar el simulador' }))
    expect(calls[2]).toEqual({ rival: null, seed: 99 })
    expect(readHandtrapConfig().enabled).toBe(false)
  })

  it('lo que activa el rival se cuenta después con la carta grande; la cadena va en su aviso, de a un eslabón y del último al primero (lo negado, en su eslabón); un rearme no lo repite', () => {
    const { fakes } = mount()
    const fake = fakes[0]!
    const overlay = fake.getSnapshot().overlay
    const mine = { card: { side: 'mine' as const, id: 'card-200-1' }, code: 200, description: '0', state: 'chained' as const }
    const theirs = { card: { side: 'theirs' as const, id: 'c1' }, code: ASH.id, description: '0', state: 'chained' as const }
    const link = (index: number, ref: { card: CardRef; code: number }): ChainStep => ({ kind: 'chain', at: 0, index, link: { card: ref.card, code: ref.code, mine: ref.card.side === 'mine' } })
    const step = (kind: ChainStep['kind'], index: number): ChainStep => ({ kind, at: 0, index })
    const notice = () => screen.getByTestId('chain-notice')
    const pill = () => within(notice()).getByRole('status')
    const two = [link(0, mine), link(1, theirs)]

    // Tu Maxx C (en tu campo) y el rival responde: después de su eslabón, el núcleo te pregunta (la mesa la ve abierta).
    act(() => fake.set({ overlay: { ...overlay, chain: [mine] }, chainSteps: two.slice(0, 1) }))
    act(() => vi.advanceTimersByTime(0))
    expect(pill()).toHaveTextContent('Cadena · CL1 · VosMaxx C')
    act(() => fake.set({ overlay: { ...overlay, chain: [mine, theirs] }, chainSteps: two }))
    expect(screen.getByText('Rival responde a Maxx C')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    expect(pill()).toHaveTextContent(`Cadena · CL2 · Rival${ASH.name}`)

    // Se resuelve de una en el núcleo; la pantalla lo cuenta de a un eslabón, del último al primero.
    const all = [...two, step('solving', 1), step('disabled', 0), step('solved', 1), step('solving', 0), step('solved', 0), step('end', -1)]

    act(() => fake.set({ overlay: { ...overlay, chain: [], negated: [{ ...mine, state: 'disabled' }] }, chainSteps: all }))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    expect(pill()).toHaveTextContent(`Resolviendo · CL2 · Rival${ASH.name}`)
    fireEvent.click(within(notice()).getByRole('button', { name: 'Ver la cadena' }))
    expect(within(notice()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([`CL2${ASH.name}RivalResolviendo`, 'CL1Maxx CVosEn espera'])
    // Mientras se resuelve, Ash deja tu Maxx C sin efecto; al llegarle el turno no se cuenta otra vez.
    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(pill()).toHaveTextContent('Sin efecto · CL1 · VosMaxx C')
    expect(within(notice()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([`CL2${ASH.name}RivalResolviendo`, 'CL1Maxx CVosSin efecto'])
    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(pill()).toHaveTextContent('Sin efecto · CL1 · VosMaxx C')
    expect(within(notice()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([`CL2${ASH.name}RivalResuelta`, 'CL1Maxx CVosSin efecto'])
    // Nada de la cadena en la línea.
    expect(document.querySelector('[data-lane]')).toBeNull()

    // Desplegada, se queda; plegada, se va sola un rato después.
    act(() => vi.advanceTimersByTime(RIVAL_READ_MS + CHAIN_LINGER_MS))
    expect(screen.queryByText('Rival responde a Maxx C')).toBeNull()
    fireEvent.click(within(notice()).getByRole('button', { name: 'Ocultar la cadena' }))
    act(() => vi.advanceTimersByTime(CHAIN_LINGER_MS))
    expect(screen.queryByTestId('chain-notice')).toBeNull()

    // Al rearmarse la mesa (deshacer) con esa cadena abierta, no se cuenta otra vez.
    act(() => fake.set({ initial: { ...fake.getSnapshot().initial }, overlay: { ...overlay, chain: [mine, theirs] }, chainSteps: two }))
    expect(screen.queryByText('Rival responde a Maxx C')).toBeNull()
  })

  it('una carta agregada con el buscador dice en la hoja que el rival todavía no la usa solo', () => {
    writeHandtrapConfig({ enabled: true, picks: [{ ...ASH, copies: 1 }, { id: 12345678, name: 'Otra carta', copies: 1 }], hand: 1 })
    mount()
    fireEvent.click(within(more()).getByRole('button', { name: 'Cambiar handtraps' }))
    const sheet = screen.getByRole('dialog', { name: 'Handtraps del rival' })

    expect(within(sheet).getByRole('group', { name: 'Copias de Otra carta en el deck del rival' }).closest('li')).toHaveTextContent('Todavía no la usa solo')
    expect(within(sheet).getByRole('group', { name: `Copias de ${ASH.name} en el deck del rival` }).closest('li')).not.toHaveTextContent('Todavía no la usa solo')
  })
})
