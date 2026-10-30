// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BOT_DECKS } from '../app/auto/bot/decks'
import { AUTO_KEYS, autoPrefs, setAutoPref } from '../app/auto-prefs'
import { autoRival, BOT_DECK_MENU, DEFAULT_RIVAL_EXTRA, HANDTRAP_CONFIG_KEY, readHandtrapConfig, rivalKindOf, writeHandtrapConfig, type BotDeckInfo, type HandtrapConfig } from '../app/handtraps'
import { RivalRow, RivalSheet } from '../components/duel/RivalRow'
import { render } from './support/practice-mat-harness'

// La fila «Rival» (Pasivo · Handtraps · Bot) de las reglas de Jugar solo automático y la hoja «Cambiar rival» del duelo: qué guarda cada opción, que las handtraps elegidas no se pierden,
// el bot con uno y con dos mazos, sus límites, su mano de dorso de entrada y el aviso de reinicio.

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []), searchCards: vi.fn(async () => ({ results: [], hasMore: false })) }))

const ASH = { id: 14558127, name: 'Ash Blossom & Joyous Spring' }
const VEILER = { id: 97268402, name: 'Effect Veiler' }
/** Una lista de prueba con dos mazos listos: el de verdad y otro. */
const TWO: readonly BotDeckInfo[] = [...BOT_DECK_MENU, { id: 'branded', name: 'Branded', line: 'auto.rival.deck.skyStriker' }]
const SAVED: HandtrapConfig = { enabled: false, picks: [{ ...ASH, copies: 2 }, { ...VEILER, copies: 1 }], hand: 2, extra: DEFAULT_RIVAL_EXTRA.slice(0, 2), ownTurn: true }

const rival = () => screen.getByRole('radiogroup', { name: 'Rival' })
const pick = (name: string) => fireEvent.click(within(rival()).getByRole('radio', { name }))
const LIMITS = 'Sparring de práctica: juega su mazo con reglas escritas para ese mazo y sólo ve lo que vería un jugador. No es un rival de torneo: no improvisa ni cuenta tus outs.'

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  act(() => setAutoPref('botHand', false))
})

describe('los mazos del bot que ofrece la interfaz', () => {
  it('son los listos de BOT_DECKS (el lobby no puede importar auto/: la lista liviana tiene que coincidir)', () => {
    expect(BOT_DECK_MENU.map(({ id, name }) => ({ id, name }))).toEqual(BOT_DECKS.filter((deck) => deck.ready).map(({ id, name }) => ({ id, name })))
  })

  it('un botDeck que ya no se ofrece o lo guardado antes del bot se leen como el rival de siempre, y la sesión no recibe el bot', () => {
    localStorage.setItem(HANDTRAP_CONFIG_KEY, JSON.stringify({ enabled: true, picks: [{ ...ASH, copies: 1 }], hand: 1, botDeck: 'ya-no-existe' }))
    expect(rivalKindOf(readHandtrapConfig())).toBe('handtraps')
    expect(autoRival(readHandtrapConfig())).not.toHaveProperty('botDeck')
    localStorage.setItem(HANDTRAP_CONFIG_KEY, JSON.stringify({ enabled: false, picks: [{ ...ASH, copies: 1 }] }))
    expect(rivalKindOf(readHandtrapConfig())).toBe('passive')
    expect(autoRival({ ...SAVED, botDeck: 'sky-striker' })).toMatchObject({ botDeck: 'sky-striker' })
  })
})

describe('la fila «Rival» de las reglas', () => {
  it('cada opción guarda lo suyo sin perder las handtraps, la mano, el Extra Deck ni su turno; el bot muestra su mazo y sus límites, sin menú con un solo mazo', () => {
    writeHandtrapConfig(SAVED)
    render(<RivalRow />)
    const rest = { picks: SAVED.picks, hand: 2, extra: SAVED.extra, ownTurn: true }

    expect(within(rival()).getByRole('radio', { name: 'Pasivo' })).toBeChecked()
    expect(screen.getByText(/^El rival no juega: sólo recibe/)).toBeInTheDocument()

    pick('Handtraps')
    expect(readHandtrapConfig()).toEqual({ enabled: true, ...rest })
    expect(screen.getByText('2 en mano · de 3 cartas')).toBeInTheDocument()

    pick('Bot')
    expect(readHandtrapConfig()).toEqual({ enabled: true, ...rest, botDeck: 'sky-striker' })
    expect(screen.getByText('Sky Striker')).toBeInTheDocument()
    expect(screen.getByText('Magias Rápidas, Enlaces y mucha interacción.')).toBeInTheDocument()
    expect(screen.getByText(LIMITS)).toBeInTheDocument()
    expect(screen.queryByText(/beta/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cambiar mazo' })).toBeNull()

    pick('Handtraps')
    expect(readHandtrapConfig()).toEqual({ enabled: true, ...rest })
    expect(screen.queryByText(LIMITS)).toBeNull()
    pick('Pasivo')
    expect(readHandtrapConfig()).toEqual({ enabled: false, ...rest })
  })

  it('«Mostrar la mano del bot» arranca apagado (su mano de dorso), se recuerda y no toca «A ciegas»', () => {
    render(<RivalRow />)
    pick('Bot')
    const show = screen.getByRole('switch', { name: 'Mostrar la mano del bot' })

    expect(show).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(show)
    expect([autoPrefs().botHand, localStorage.getItem(AUTO_KEYS.botHand), autoPrefs().blind]).toEqual([true, 'on', false])
    cleanup()
    render(<RivalRow />)
    expect(screen.getByRole('switch', { name: 'Mostrar la mano del bot' })).toHaveAttribute('aria-checked', 'true')
  })

  it('elegir las handtraps desde la fila deja al rival de handtraps (suelta el bot)', () => {
    writeHandtrapConfig({ ...SAVED, botDeck: 'sky-striker' })
    render(<RivalRow />)
    pick('Handtraps')
    fireEvent.click(screen.getByRole('button', { name: 'Elegir… las handtraps del rival' }))
    fireEvent.click(screen.getByRole('button', { name: 'Usar estas handtraps' }))

    expect(readHandtrapConfig()).toMatchObject({ enabled: true, hand: 2 })
    expect(readHandtrapConfig()).not.toHaveProperty('botDeck')
  })

  it('con dos mazos listos, «Cambiar mazo» abre la hoja para elegirlo (cada uno con lo que es); elegido, se cierra y la fila lo dice', () => {
    render(<RivalRow decks={TWO} />)
    pick('Bot')
    expect(readHandtrapConfig().botDeck).toBe('sky-striker')
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar mazo' }))
    const sheet = screen.getByRole('dialog', { name: 'Mazo del bot' })
    const decks = within(sheet).getByRole('radiogroup', { name: 'Mazo del bot' })

    expect(within(decks).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Sky StrikerMagias Rápidas, Enlaces y mucha interacción.', 'BrandedMagias Rápidas, Enlaces y mucha interacción.'])
    expect(within(decks).getByRole('radio', { name: 'Sky Striker' })).toBeChecked()
    fireEvent.click(within(decks).getByRole('radio', { name: 'Branded' }))
    expect(readHandtrapConfig().botDeck).toBe('branded')
    expect(screen.queryByRole('dialog', { name: 'Mazo del bot' })).toBeNull()
    expect(screen.getByText('Branded')).toBeInTheDocument()
  })

  it('sin mazos listos no se ofrece «Bot»', () => {
    render(<RivalRow decks={[]} />)

    expect(within(rival()).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Pasivo', 'Handtraps'])
  })
})

describe('«Cambiar rival» en el duelo', () => {
  const sheet = (config: HandtrapConfig, onApply = vi.fn(), onClose = vi.fn()) => {
    render(<RivalSheet isOpen config={config} onClose={onClose} onApply={onApply} onChooseHandtraps={() => {}} />)

    return { dialog: screen.getByRole('dialog', { name: 'Rival' }), onApply, onClose }
  }

  it('avisa que aplicar reinicia el duelo; la principal dice contra quién y aplica lo elegido; cancelar no aplica nada', () => {
    const { dialog, onApply, onClose } = sheet({ ...SAVED, enabled: true })

    expect(dialog).toHaveTextContent('Al aplicar, el duelo empieza de nuevo.')
    expect(within(dialog).getByRole('radio', { name: 'Handtraps' })).toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Usar estas handtraps' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Pasivo' }))
    expect(within(dialog).getByRole('button', { name: 'Jugar contra el pasivo' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Bot' }))
    expect(dialog).toHaveTextContent(LIMITS)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Jugar contra el bot' }))
    expect(onApply).toHaveBeenCalledWith({ ...SAVED, enabled: true, botDeck: 'sky-striker' })
  })
})
