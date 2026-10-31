// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BOT_DECKS } from '../app/auto/bot/decks'
import { AUTO_KEYS, autoPrefs, setAutoPref } from '../app/auto-prefs'
import { autoRival, BOT_DECK_MENU, DEFAULT_RIVAL_EXTRA, HANDTRAP_CONFIG_KEY, readHandtrapConfig, rivalKindOf, writeHandtrapConfig, type BotDeckInfo, type HandtrapConfig } from '../app/handtraps'
import { RivalSheet } from '../components/duel/RivalRow'
import { SoloScreen } from '../components/duel/SoloScreen'
import { render } from './support/practice-mat-harness'

// El rival de Solo (una fila por bot, el pasivo y el de handtraps) y la hoja «Cambiar rival» del duelo: qué guarda cada opción, que las handtraps elegidas no se pierden,
// el bot con uno y con varios mazos, sus límites, su mano de dorso de entrada y el aviso de reinicio.

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []), searchCards: vi.fn(async () => ({ results: [], hasMore: false })) }))

const ASH = { id: 14558127, name: 'Ash Blossom & Joyous Spring' }
const VEILER = { id: 97268402, name: 'Effect Veiler' }
/** Uno solo de los mazos listos (la fila sin menú). */
const ONE: readonly BotDeckInfo[] = BOT_DECK_MENU.slice(0, 1)
const SAVED: HandtrapConfig = { enabled: false, picks: [{ ...ASH, copies: 2 }, { ...VEILER, copies: 1 }], hand: 2, extra: DEFAULT_RIVAL_EXTRA.slice(0, 2), ownTurn: true }

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

describe('el rival en Solo (una fila por rival)', () => {
  const solo = (decks?: readonly BotDeckInfo[]) => render(<SoloScreen deckName="Mi deck" deckSize={40} minDeck={5} onOpenBuilder={() => {}} onPlay={() => {}} {...(decks ? { decks } : {})} />)
  const rivals = () => screen.getByRole('radiogroup', { name: 'Contra quién jugás' })
  const choose = (name: RegExp) => fireEvent.click(within(rivals()).getByRole('radio', { name }))
  /** La ficha del celular: se abre desde la barra de abajo. */
  const ficha = () => {
    fireEvent.click(screen.getByRole('button', { name: /Ficha y ajustes/ }))

    return screen.getByRole('dialog')
  }

  beforeEach(() => vi.stubGlobal('Worker', class {}))
  afterEach(() => vi.unstubAllGlobals())

  it('cada opción guarda lo suyo sin perder las handtraps, la mano, el Extra Deck ni su turno; la ficha del bot dice su mazo y sus límites', () => {
    writeHandtrapConfig(SAVED)
    solo(ONE)
    const rest = { picks: SAVED.picks, hand: 2, extra: SAVED.extra, ownTurn: true }

    expect(within(rivals()).getByRole('radio', { name: /^Pasivo/ })).toBeChecked()

    choose(/^Handtraps/)
    expect(readHandtrapConfig()).toEqual({ enabled: true, ...rest })
    expect(within(rivals()).getByRole('radio', { name: /^Handtraps/ })).toHaveTextContent('2 en mano · de 3 cartas')

    choose(/^Sky Striker/)
    expect(readHandtrapConfig()).toEqual({ enabled: true, ...rest, botDeck: 'sky-striker' })
    const sheet = ficha()
    expect(sheet).toHaveTextContent('Magias Rápidas, Enlaces y mucha interacción.')
    expect(sheet).toHaveTextContent(LIMITS)
    expect(screen.queryByText(/beta/i)).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cerrar' }))

    choose(/^Handtraps/)
    expect(readHandtrapConfig()).toEqual({ enabled: true, ...rest })
    expect(ficha()).not.toHaveTextContent(LIMITS)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    choose(/^Pasivo/)
    expect(readHandtrapConfig()).toEqual({ enabled: false, ...rest })
  })

  it('«Mostrar la mano del bot» arranca apagado (su mano de dorso), se recuerda y no toca «A ciegas»', () => {
    solo()
    choose(/^Elfnote/)
    const show = within(ficha()).getByRole('switch', { name: 'Mostrar la mano del bot' })

    expect(show).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(show)
    expect([autoPrefs().botHand, localStorage.getItem(AUTO_KEYS.botHand), autoPrefs().blind]).toEqual([true, 'on', false])
    cleanup()
    solo()
    expect(within(ficha()).getByRole('switch', { name: 'Mostrar la mano del bot' })).toHaveAttribute('aria-checked', 'true')
  })

  it('elegir las handtraps desde la ficha las guarda con el rival de handtraps (suelta el bot)', () => {
    writeHandtrapConfig({ ...SAVED, botDeck: 'sky-striker' })
    solo()
    choose(/^Handtraps/)
    fireEvent.click(within(ficha()).getByRole('button', { name: 'Elegir… las handtraps del rival' }))
    fireEvent.click(screen.getByRole('button', { name: 'Usar estas handtraps' }))

    expect(readHandtrapConfig()).toMatchObject({ enabled: true, hand: 2 })
    expect(readHandtrapConfig()).not.toHaveProperty('botDeck')
  })

  it('los tres mazos listos (Sky Striker, Despia Branded y Elfnote), en su orden y cada uno con lo que es; elegir uno lo guarda', () => {
    solo()
    const bots = within(rivals()).getAllByRole('radio').slice(0, 3)

    expect(bots.map((radio) => radio.textContent)).toEqual([
      'Sky StrikerMagias Rápidas, Enlaces y mucha interacción.',
      'Despia BrandedFusiones desde el Deck e interrupciones en tu turno.',
      'ElfnoteSincronías en el centro, también en tu turno.',
    ])
    choose(/^Despia Branded/)
    expect(readHandtrapConfig().botDeck).toBe('branded')
    expect(within(rivals()).getByRole('radio', { name: /^Despia Branded/ })).toBeChecked()
  })

  it('sin mazos listos no hay bots: sólo el pasivo y el de handtraps', () => {
    solo([])

    expect(within(rivals()).getAllByRole('radio').map((radio) => radio.getAttribute('title'))).toEqual(['Pasivo', 'Handtraps'])
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
