// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CardRef } from '../app/auto/adapter'
import { CHAIN_LINGER_MS, CHAIN_LINK_MS, CHAIN_SOLVE_MS, type ChainStep } from '../app/auto/chain-feed'
import { setAutoPref } from '../app/auto-prefs'
import { readHandtrapConfig, writeHandtrapConfig } from '../app/handtraps'
import { AutoSoloScreen, RIVAL_READ_MS, type AutoSoloScreenProps } from '../components/auto/AutoSoloScreen'
import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { CARDS, fakeSession, pos, SPOTS, type FakeSession } from './support/auto-session-fake'
import { core, dispatches, renderAuto, status } from './support/auto-screen-harness'
import { render } from './support/practice-mat-harness'
import { tapMenu } from './support/mat-menu'

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

const rivalHand = () => screen.getByLabelText(/^Mano del rival:/)
const more = () => {
  tapMenu('Opciones del duelo')

  return screen.getByRole('dialog', { name: 'Más opciones del duelo' })
}

afterEach(() => act(() => setAutoPref('blind', false)))

describe('auto-screen · el rival de handtraps', () => {
  it('con el simulador apagado, el rival es el pasivo de siempre: su mano de dorso y «Más opciones» dice que no juega', () => {
    const { calls } = mount()

    expect(calls).toEqual([{ rival: null, seed: expect.any(Number), seat: 0 }])
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
    expect(calls[2]).toEqual({ rival: null, seed: 99, seat: 0 })
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
    // La pila abre desplegada: la píldora es su título y lo del eslabón queda en su fila (el resumen, para el lector de pantalla).
    expect(pill()).toHaveTextContent('Cadena · 1CL1 · VosEn espera')
    expect(pill().firstElementChild).toHaveTextContent(/^Cadena · 1$/)
    act(() => fake.set({ overlay: { ...overlay, chain: [mine, theirs] }, chainSteps: two }))
    expect(screen.getByText('Rival responde a Maxx C')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    expect(pill()).toHaveTextContent('Cadena · 2CL2 · RivalEn espera')

    // Se resuelve de una en el núcleo; la pantalla lo cuenta de a un eslabón, del último al primero.
    const all = [...two, step('solving', 1), step('disabled', 0), step('solved', 1), step('solving', 0), step('solved', 0), step('end', -1)]

    act(() => fake.set({ overlay: { ...overlay, chain: [], negated: [{ ...mine, state: 'disabled' }] }, chainSteps: all }))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    expect(pill()).toHaveTextContent('Cadena · 2Resuelve CL2Resolviendo')
    expect(within(notice()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([`CL2${ASH.name}RivalResolviendo`, 'CL1Maxx CVosEn espera'])
    // Mientras se resuelve, Ash deja tu Maxx C sin efecto; al llegarle el turno no se cuenta otra vez.
    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    // En el celular, dos renglones: quién se resuelve y qué le pasa (sin `by` no se sabe quién lo negó: sólo su estado; el nombre está en la pila).
    expect(pill()).toHaveTextContent('Cadena · 2Resuelve CL2Sin efecto')
    expect(within(notice()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([`CL2${ASH.name}RivalResolviendo`, 'CL1Maxx CVosSin efecto'])
    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(pill()).toHaveTextContent('Cadena · 2Resuelve CL1Sin efecto')
    expect(within(notice()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([`CL2${ASH.name}RivalResuelta`, 'CL1Maxx CVosSin efecto'])
    // Nada de la cadena en la línea.
    expect(document.querySelector('[data-lane]')).toBeNull()

    // Desplegada a mano (la persona la está mirando), se queda; plegada, se va sola un rato después.
    fireEvent.click(within(notice()).getByRole('button', { name: 'Ocultar la cadena' }))
    fireEvent.click(within(notice()).getByRole('button', { name: 'Ver la cadena' }))
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

  it('su mano de handtraps boca arriba se toca para ver cada carta', () => {
    writeHandtrapConfig({ enabled: true, picks: [{ ...ASH, copies: 1 }], hand: 1 })
    const { fakes } = mount()

    act(() => fakes[0]!.set({ rivalHand: [ASH.id], theirs: { ...fakes[0]!.getSnapshot().theirs, hand: ['c2'] } }))
    fireEvent.click(within(rivalHand()).getByRole('button', { name: ASH.name }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(dispatches).toBe(0)
  })
})

describe('auto-screen · el rival se toca', () => {
  /** El rival: Blue-Eyes boca arriba (mz 0), una boca abajo que ya se mostró (mz 1), Nibiru en su cementerio y Ash desterrada boca abajo. */
  const RIVAL = [
    ...SPOTS,
    { side: 'theirs' as const, id: 'c2', code: 100, location: L.MZONE, sequence: 1, pos: 'set' as const },
    { side: 'theirs' as const, id: 'c3', code: 400, location: L.GRAVE, sequence: 0 },
    { side: 'theirs' as const, id: 'c4', code: 100, location: L.REMOVED, sequence: 0 },
  ]
  const mountRival = () => {
    const fake = fakeSession(RIVAL)

    fake.set({ theirs: { ...fake.getSnapshot().theirs, facedown: ['c4'] } })
    return renderAuto(fake)
  }
  const rivalCard = (n: number) => screen.getByRole('button', { name: `Rival, Zona de monstruo ${n}: marcar` })

  it('una carta a la vista se ve en grande; una boca abajo no se muestra aunque se sepa cuál es; nada se juega', () => {
    const fake = mountRival()

    fireEvent.click(rivalCard(2))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(rivalCard(1))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(fake.answers).toEqual([])
    expect(dispatches).toBe(0)
  })

  it('su Cementerio y su Destierro abren su visor (lo boca abajo, de dorso y sin nombre); tocarlo otra vez lo cierra; su Deck no abre nada', () => {
    mountRival()

    fireEvent.click(screen.getByRole('button', { name: 'Main: marcar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'GY: marcar' }))
    expect(within(screen.getByRole('dialog', { name: /GY/ })).getByText('Nibiru')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'GY: marcar' }))
    expect(screen.queryByRole('dialog', { name: /GY/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Banish: marcar' }))
    const banished = screen.getByRole('dialog', { name: /Banish/ })

    expect(banished).not.toHaveTextContent('Ash Blossom')
    expect(banished).toHaveTextContent('Carta del rival')
    expect(dispatches).toBe(0)
  })

  it('a qué atacar: sus monstruos laten (también el boca abajo), el estado lo dice y tocar uno contesta', () => {
    const fake = mountRival()
    const ask: CoreAsk = { type: 'select_card', player: 0, can_cancel: true, min: 1, max: 1, selects: [pos(700, L.MZONE, 0, 1, 1), pos(0, L.MZONE, 1, 8, 1)] }

    core(() => fake.ask(ask, '549'))
    expect(status()).toHaveTextContent('Elegí a qué monstruo atacar')
    const beating = [...document.querySelectorAll('[data-attack-target="true"]')].map((card) => card.getAttribute('data-rival-card-id'))

    expect(beating).toEqual(['c1', 'c2'])
    fireEvent.click(rivalCard(2))
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [1] }])
    expect(document.querySelector('[data-attack-target]')).toBeNull()
    expect(dispatches).toBe(0)
  })
})

describe('auto-screen · el ataque del rival', () => {
  const attack = (target?: string) => ({ action: { type: 'attack' as const, id: 'c1', ...(target ? { target } : {}) }, reveal: {} })

  it('cuando llega, la mesa lo avisa (y dibuja la espada) una sola vez; lo que ya estaba al abrir no se repite', () => {
    const fake = renderAuto()

    core(() => fake.set({ theirsActs: [attack('card-200-1')], order: ['theirs'] }))
    expect(screen.getByText('Rival ataca a Maxx C')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.queryByText('Rival ataca a Maxx C')).toBeNull()
    core(() => fake.set({ theirsActs: [attack('card-200-1'), attack()], order: ['theirs', 'theirs'] }))
    expect(screen.getByText('Rival te ataca directo')).toBeInTheDocument()
    expect(dispatches).toBe(0)
  })

  it('al volver a la pantalla (recargar, reponer) no se anima lo que ya pasó', () => {
    const fake = fakeSession()

    fake.set({ theirsActs: [attack()], order: ['theirs'] })
    renderAuto(fake)
    expect(screen.queryByText('Rival te ataca directo')).toBeNull()
  })
})
