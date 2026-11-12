// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CardRef } from '../app/auto/adapter'
import { CHAIN_LINGER_MS, CHAIN_LINK_MS, CHAIN_READ_MS, CHAIN_SOLVE_MS, type ChainStep } from '../app/auto/chain-feed'
import { setAutoPref } from '../app/auto-prefs'
import { readHandtrapConfig, writeHandtrapConfig } from '../app/handtraps'
import { AutoSoloScreen, RIVAL_READ_MS, type AutoSoloScreenProps } from '../components/auto/AutoSoloScreen'
import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { FLIGHT_MS } from '../app/use-card-flights'
import { CARDS, fakeSession, pos, SPOTS, type FakeSession } from './support/auto-session-fake'
import { core, dispatches, renderAuto, status } from './support/auto-screen-harness'
import { render } from './support/practice-mat-harness'
import { openOptions } from './support/mat-menu'

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
  openOptions()

  return screen.getByRole('dialog', { name: 'Opciones' })
}

afterEach(() =>
  act(() => {
    setAutoPref('blind', false)
    setAutoPref('botHand', false)
  }),
)

/** «Cambiar rival» de «Más opciones» y, con Handtraps, «Elegir…»: la hoja de las handtraps. */
const handtrapSheet = () => {
  fireEvent.click(within(more()).getByRole('button', { name: 'Cambiar rival' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Rival' })).getByRole('button', { name: 'Elegir… las handtraps del rival' }))

  return screen.getByRole('dialog', { name: 'Handtraps del rival' })
}

describe('auto-screen · el rival de handtraps', () => {
  it('con el simulador apagado, el rival es el pasivo de siempre: su mano de dorso y «Más opciones» dice que no juega', () => {
    const { calls } = mount()

    expect(calls).toEqual([{ rival: null, seed: expect.any(Number), seat: 0 }])
    expect(rivalHand()).toHaveAccessibleName('Mano del rival: 0')
    const dialog = more()

    expect(dialog).toHaveTextContent('RivalPasivo')
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

  it('«Cambiar rival» y «Elegir…» abren la hoja del simulador; aplicar guarda y arma el duelo de nuevo con la misma semilla; apagarlo vuelve al pasivo', () => {
    writeHandtrapConfig({ enabled: true, picks: [{ ...ASH, copies: 1 }], hand: 1 })
    const { calls, fakes } = mount()

    const sheet = handtrapSheet()

    expect(sheet).toHaveTextContent('Al aplicar, el duelo empieza de nuevo.')
    fireEvent.click(within(within(sheet).getByRole('group', { name: `Copias de ${VEILER.name} en el deck del rival` })).getByRole('button', { name: 'Uno más' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Usar estas handtraps' }))

    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({ seed: 99 })
    expect(calls[1]!.rival!.main).toEqual([[ASH.id, 1], [VEILER.id, 1]])
    expect(fakes[0]!.destroyed).toBe(true)
    expect(readHandtrapConfig().picks.map((pick) => pick.id)).toEqual([ASH.id, VEILER.id])

    handtrapSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar el simulador' }))
    expect(calls[2]).toEqual({ rival: null, seed: 99, seat: 0 })
    expect(readHandtrapConfig().enabled).toBe(false)
  })

  it('lo que activa el rival no sale en grande (en el automático lo muestra la cadena: decisión 9 de la fase); la cadena va en su aviso, de a un eslabón y del último al primero (lo negado, en su eslabón); un rearme no lo repite', () => {
    const { fakes } = mount()
    const fake = fakes[0]!
    const overlay = fake.getSnapshot().overlay
    const mine = { card: { side: 'mine' as const, id: 'card-200-1' }, code: 200, description: '0', state: 'chained' as const }
    const theirs = { card: { side: 'theirs' as const, id: 'c1' }, code: ASH.id, description: '0', state: 'chained' as const }
    const link = (index: number, ref: { card: CardRef; code: number }): ChainStep => ({ kind: 'chain', at: 0, index, link: { card: ref.card, code: ref.code, mine: ref.card.side === 'mine' } })
    const step = (kind: ChainStep['kind'], index: number): ChainStep => ({ kind, at: 0, index })
    const notice = () => screen.getByTestId('chain-notice')
    const say = () => within(notice()).getByRole('status')
    const pose = () => [...document.querySelectorAll<HTMLElement>('[data-chain-card]')].map((card) => `${card.getAttribute('aria-label')} · ${card.dataset.pose}`)
    const two = [link(0, mine), link(1, theirs)]

    // Tu Maxx C (en tu campo) y el rival responde: después de su eslabón, el núcleo te pregunta (la mesa la ve abierta).
    act(() => fake.set({ overlay: { ...overlay, chain: [mine] }, chainSteps: two.slice(0, 1) }))
    act(() => vi.advanceTimersByTime(0))
    expect(say()).toHaveTextContent(/^Se resuelve del último al primero$/)
    act(() => fake.set({ overlay: { ...overlay, chain: [mine, theirs] }, chainSteps: two }))
    // Sin `Spotlight` de activar en el automático (ni lo propio ni lo del rival): lo cuenta la cadena.
    expect(screen.queryByText('Rival responde a Maxx C')).toBeNull()
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    // La respuesta del rival se ve en la escena: su carta entra con su «2», del color del rival, unida a la tuya.
    expect(pose()).toEqual(['Eslabón 1: Maxx C, tuyo. En espera · slot', `Eslabón 2: ${ASH.name}, del rival. En espera · slot`])
    expect(screen.getByRole('img', { name: `Eslabón 2: ${ASH.name}, del rival. En espera` })).toHaveTextContent(/2$/)
    expect(document.querySelector('[data-chain-bond="2"]')).toHaveClass('opacity-100')

    // Se resuelve de una en el núcleo; la pantalla lo cuenta de a un eslabón, del último al primero: cada uno al centro con lo que le pasó.
    const all = [...two, step('solving', 1), step('disabled', 0), step('solved', 1), step('solving', 0), step('solved', 0), step('end', -1)]

    act(() => fake.set({ overlay: { ...overlay, chain: [], negated: [{ ...mine, state: 'disabled' }] }, chainSteps: all }))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    // Mientras se resuelve, Ash deja tu Maxx C sin efecto: se tacha en su lugar.
    expect(pose()).toEqual(['Eslabón 1: Maxx C, tuyo. Sin efecto · slot', `Eslabón 2: ${ASH.name}, del rival. Resuelta · center`])
    expect(say()).toHaveTextContent(`${ASH.name}: Resuelta`)
    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    // Al llegarle el turno no se cuenta otra vez: al centro, tachada, y se queda a leer 1,6 s más.
    expect(pose()).toEqual(['Eslabón 1: Maxx C, tuyo. Sin efecto · center', `Eslabón 2: ${ASH.name}, del rival. Resuelta · out`])
    expect(say()).toHaveTextContent(/^Maxx C: Sin efecto$/)
    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(pose()[0]).toMatch(/center$/)
    act(() => vi.advanceTimersByTime(CHAIN_READ_MS))
    expect(pose()[0]).toMatch(/out$/)
    // Nada de la cadena en la línea.
    expect(document.querySelector('[data-lane]')).toBeNull()

    // Terminó: se va sola.
    act(() => vi.advanceTimersByTime(RIVAL_READ_MS + CHAIN_LINGER_MS * 2))
    expect(screen.queryByText('Rival responde a Maxx C')).toBeNull()
    expect(screen.queryByTestId('chain-notice')).toBeNull()

    // Al rearmarse la mesa (deshacer) con esa cadena abierta, no se cuenta otra vez.
    act(() => fake.set({ initial: { ...fake.getSnapshot().initial }, overlay: { ...overlay, chain: [mine, theirs] }, chainSteps: two }))
    expect(screen.queryByText('Rival responde a Maxx C')).toBeNull()
  })

  it('una carta agregada con el buscador dice en la hoja que el rival todavía no la usa solo', () => {
    writeHandtrapConfig({ enabled: true, picks: [{ ...ASH, copies: 1 }, { id: 12345678, name: 'Otra carta', copies: 1 }], hand: 1 })
    mount()
    const sheet = handtrapSheet()

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

describe('auto-screen · el rival «Bot»', () => {
  const BOT = { enabled: true, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 1 }], hand: 2, botDeck: 'sky-striker' }

  it('el duelo se arma con su mazo; su mano va de dorso aunque «A ciegas» esté apagado, y «Mostrar la mano del bot» la da vuelta (y se recuerda)', () => {
    writeHandtrapConfig(BOT)
    const { calls, fakes } = mount()

    expect(calls[0]!.rival).toMatchObject({ botDeck: 'sky-striker', main: [] })
    act(() => fakes[0]!.set({ rivalHand: [ASH.id, VEILER.id], theirs: { ...fakes[0]!.getSnapshot().theirs, hand: ['c2', 'c3'] } }))
    expect(rivalHand()).toHaveAccessibleName('Mano del rival: 2')
    const dialog = more()

    expect(dialog).toHaveTextContent('RivalBot · Sky Striker')
    expect(within(dialog).queryByRole('switch', { name: 'A ciegas' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Mostrar la mano del bot' }))
    expect(rivalHand()).toHaveAccessibleName(`Mano del rival: ${ASH.name}, ${VEILER.name}`)
    expect([localStorage.getItem('ygo-lab:auto-bot-hand'), localStorage.getItem('ygo-lab:auto-blind')]).toEqual(['on', null])
    expect(dispatches).toBe(0)
  })

  it('«Cambiar rival» avisa que reinicia; al bot y de vuelta a handtraps y al pasivo, con la misma semilla y sin perder las handtraps; cancelar no reinicia', () => {
    writeHandtrapConfig({ ...BOT, botDeck: undefined })
    const { calls } = mount()
    const change = () => {
      fireEvent.click(within(more()).getByRole('button', { name: 'Cambiar rival' }))

      return screen.getByRole('dialog', { name: 'Rival' })
    }
    let sheet = change()

    expect(sheet).toHaveTextContent('Al aplicar, el duelo empieza de nuevo.')
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Bot' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancelar' }))
    expect(calls).toHaveLength(1)

    sheet = change()
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Bot' }))
    expect(sheet).toHaveTextContent('No es un rival de torneo')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Jugar contra el bot' }))
    expect(calls[1]).toMatchObject({ seed: 99, rival: { botDeck: 'sky-striker' } })
    expect(readHandtrapConfig()).toMatchObject({ botDeck: 'sky-striker', hand: 2 })

    sheet = change()
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Handtraps' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Usar estas handtraps' }))
    expect(calls[2]!.rival!.main).toEqual([[ASH.id, 1], [VEILER.id, 1]])
    expect(calls[2]!.rival).not.toHaveProperty('botDeck')
    expect(readHandtrapConfig()).not.toHaveProperty('botDeck')

    sheet = change()
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Pasivo' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Jugar contra el pasivo' }))
    expect(calls[3]).toEqual({ rival: null, seed: 99, seat: 0 })
    expect(readHandtrapConfig().picks).toHaveLength(2)
  })

  it('«Qué hizo el bot» con el bot espera sus decisiones (no dice que el rival no juega, como con el pasivo)', () => {
    writeHandtrapConfig(BOT)
    mount()
    fireEvent.click(within(more()).getByRole('button', { name: 'Qué hizo el bot' }))
    expect(screen.getByRole('dialog', { name: 'Qué hizo el bot y por qué' })).toHaveTextContent('Todavía no decidió nada')
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

    // Lo del rival se cuenta a su ritmo, en su lugar (`order`).
    core(() => fake.set({ theirsActs: [attack('card-200-1')], order: ['theirs'] }))
    act(() => vi.advanceTimersByTime(FLIGHT_MS))
    expect(screen.getByText('Rival ataca a Maxx C')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.queryByText('Rival ataca a Maxx C')).toBeNull()
    core(() => fake.set({ theirsActs: [attack('card-200-1'), attack()], order: ['theirs', 'theirs'] }))
    act(() => vi.advanceTimersByTime(FLIGHT_MS))
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
