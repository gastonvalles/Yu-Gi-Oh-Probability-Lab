// @vitest-environment jsdom
import { cleanup, fireEvent, render as rtlRender, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ComponentProps, ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { autoPrefs, setAutoPref } from '../app/auto-prefs'
import { PREFS_KEY } from '../app/duel-prefs'
import { writeHandtrapConfig, DEFAULT_HANDTRAP_CONFIG } from '../app/handtraps'
import { MAIN_MINIMUM } from '../app/duel-siding'
import { buildLoanerDecks, LOAN_BELOW, loanerFits, loanerPasscodes, pickLoaner, soloLoaner } from '../app/loaner-deck'
import { PlayHome } from '../components/duel/PlayHome'
import { SoloScreen } from '../components/duel/SoloScreen'
import type { Loaners } from '../components/duel/use-loaners'
import { deckState, searchResult, storeWith } from './support/deck-fixtures'

// Las cartas de las filas (`CardArt`) leen el formato del deck del store.
const render = (ui: ReactElement) => rtlRender(<Provider store={storeWith(deckState())}>{ui}</Provider>)

// El mazo prestado: sin un deck propio completo, Online y Solo juegan con uno de los mazos de los bots. Las cartas van de mentira (sin red), con sus passcodes de verdad:
// la legalidad TCG / OCG sale de las banlists del sitio por passcode, así que acá se revisan las tres listas contra la vigente.
const cards = loanerPasscodes().map((code) => searchResult(code, `Carta ${code}`))
const decks = buildLoanerDecks(cards)
const loaners = (status: Loaners['status'] = 'ready', retry = () => {}): Loaners => ({ status, decks: status === 'ready' ? decks : [], retry })

beforeEach(() => {
  localStorage.clear()
  setAutoPref('loaner', '')
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('los mazos prestados (loaner-deck)', () => {
  it('son los tres mazos de los bots, con las copias como las del builder', () => {
    expect(decks.map((deck) => [deck.list.id, deck.mainIds.length, deck.extraIds.length])).toEqual([
      ['sky-striker', 40, 15],
      ['angelechy', 40, 15],
      ['elfnote', 45, 15],
    ])
    expect(decks[0]!.mainIds.slice(0, 3)).toEqual(['card-26077387-1', 'card-26077387-2', 'card-26077387-3'])
    expect(decks[0]!.cardsById.get('card-26077387-2')).toMatchObject({ name: 'Carta 26077387', apiCard: { ygoprodeckId: 26077387 } })
  })

  it('los tres valen en TCG (la banlist vigente) y en Sin límite; ninguno en OCG', () => {
    for (const deck of decks) {
      expect(loanerFits(deck, 'tcg'), deck.list.id).toBe(true)
      expect(loanerFits(deck, 'unlimited'), deck.list.id).toBe(true)
      expect(loanerFits(deck, 'ocg'), deck.list.id).toBe(false)
    }
  })

  it('se presta el elegido si se puede; si no, el primero que se pueda (Sky Striker primero)', () => {
    expect(pickLoaner(decks, '')?.list.id).toBe('sky-striker')
    expect(pickLoaner(decks, 'elfnote')?.list.id).toBe('elfnote')
    expect(pickLoaner(decks, 'otro')?.list.id).toBe('sky-striker')
    expect(pickLoaner(decks, 'sky-striker', (deck) => deck.list.id !== 'sky-striker')?.list.id).toBe('angelechy')
    expect(pickLoaner(decks, '', () => false)).toBeNull()
    expect(pickLoaner([], '')).toBeNull()
  })

  it('se presta con menos del mínimo de un duelo (la misma cuenta que la sala)', () => {
    expect(LOAN_BELOW).toBe(MAIN_MINIMUM)
  })

  it('en Solo: con un deck que reparte la mano, ninguno (también uno a medias); si no, nunca el del bot rival', () => {
    expect(soloLoaner(decks, '', 40, 5, null)).toBeNull()
    expect(soloLoaner(decks, '', 20, 5, null)).toBeNull()
    expect(soloLoaner(decks, '', 5, 5, null)).toBeNull()
    expect(soloLoaner(decks, '', 0, 5, null)?.list.id).toBe('sky-striker')
    expect(soloLoaner(decks, '', 4, 5, 'sky-striker')?.list.id).toBe('angelechy')
    expect(soloLoaner(decks, 'sky-striker', 0, 5, 'sky-striker')?.list.id).toBe('angelechy')
    expect(soloLoaner(decks, 'elfnote', 0, 5, 'sky-striker')?.list.id).toBe('elfnote')
  })
})

const lobby = (props: Partial<ComponentProps<typeof PlayHome>> = {}) => {
  const handlers = { onOpenDuel: vi.fn(), onOpenBuilder: vi.fn() }
  render(<PlayHome view={null} name="" onName={() => {}} deckName="Mi deck" deckReady={false} deckSize={0} loaners={loaners()} onJoin={() => {}} paused={null} onResume={() => {}} onDropPaused={() => {}} {...handlers} {...props} />)
  return handlers
}
const amber = () => screen.queryByText(/Un duelo se juega con 40 cartas/)
const playNow = () => screen.getByRole('button', { name: 'Jugar ahora' })

describe('Online: «Tu deck» con un mazo prestado', () => {
  it('el visitante sin deck: juega ya con Sky Striker, sin aviso arriba', async () => {
    const { onOpenDuel, onOpenBuilder } = lobby()

    expect(screen.getByText('Sky Striker · 40')).toBeInTheDocument()
    expect(screen.getByText('Prestado')).toBeInTheDocument()
    expect(amber()).toBeNull()
    expect(playNow()).toBeEnabled()
    fireEvent.click(playNow())
    await vi.waitFor(() => expect(onOpenDuel).toHaveBeenCalledWith(expect.objectContaining({ format: 'tcg' })))
    expect(onOpenBuilder).not.toHaveBeenCalled()
  })

  it('con deck completo no cambia nada: tu deck, sin chip, y «Cambiar» va al builder', () => {
    const { onOpenBuilder } = lobby({ deckReady: true, deckSize: 40 })

    expect(screen.getByText('Mi deck · 40')).toBeInTheDocument()
    expect(screen.queryByText('Prestado')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar deck' }))
    expect(onOpenBuilder).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('con un deck a medias: juega el prestado; la hoja dice cuántas le faltan al tuyo (una pista) y elegir otro se recuerda', async () => {
    const { onOpenDuel } = lobby({ deckReady: true, deckSize: 20 })

    expect(amber()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar el mazo prestado' }))
    const sheet = await screen.findByRole('dialog', { name: '¿Con qué mazo jugás?' })
    const hint = within(sheet).getByText('Tiene 20: le faltan 20 para jugar')

    expect(hint.closest('[role=alert]')).toBeNull()
    expect(within(sheet).getByRole('radio', { name: /Sky Striker/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(sheet).getByRole('radio', { name: /Angelechy/ }))
    expect(autoPrefs().loaner).toBe('angelechy')
    expect(screen.getByText('Angelechy · 40')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Jugar con Angelechy' }))
    await vi.waitFor(() => expect(onOpenDuel).toHaveBeenCalled())
  })

  it('mientras llegan las cartas, «Jugar ahora» espera y no hay aviso; si no llegan, «Reintentar» en la hoja', () => {
    lobby({ loaners: loaners('loading') })
    expect(screen.getByText('Preparando un mazo…')).toBeInTheDocument()
    expect(playNow()).toBeDisabled()
    expect(amber()).toBeNull()
    cleanup()

    const retry = vi.fn()
    lobby({ loaners: loaners('error', retry) })
    expect(amber()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar el mazo prestado' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reintentar' }))
    expect(retry).toHaveBeenCalled()
  })

  it('en un formato donde no valen (OCG) no se ofrecen: la fila lo dice y la hoja dice por qué', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ format: 'ocg' }))
    const { onOpenBuilder } = lobby()

    expect(screen.getByText('Los mazos prestados no valen en OCG')).toBeInTheDocument()
    expect(screen.queryByText('Prestado')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar el mazo prestado' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('radio', { name: /Sky Striker/ })).toHaveAttribute('aria-disabled', 'true')
    expect(within(sheet).getAllByText('No vale en OCG')).toHaveLength(3)
    fireEvent.click(within(sheet).getByRole('button', { name: /Armar o importar el mío/ }))
    expect(onOpenBuilder).toHaveBeenCalled()
  })
})

const solo = (props: Partial<ComponentProps<typeof SoloScreen>> = {}) => {
  const handlers = { onPlay: vi.fn(), onOpenBuilder: vi.fn() }
  render(<SoloScreen deckName="Mi deck" deckSize={0} minDeck={5} loaners={loaners()} {...handlers} {...props} />)
  return handlers
}

describe('Solo: el mazo prestado', () => {
  beforeEach(() => vi.stubGlobal('Worker', class {}))

  it('el visitante sin deck contra el bot de Sky Striker juega con otro (nunca un espejo), y la hoja dice por qué', () => {
    writeHandtrapConfig({ ...DEFAULT_HANDTRAP_CONFIG, botDeck: 'sky-striker' })
    const { onPlay, onOpenBuilder } = solo()

    expect(screen.getByText('Angelechy · 40')).toBeInTheDocument()
    expect(screen.getByText('Prestado')).toBeInTheDocument()
    expect(screen.queryByText(/Para repartir la mano/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar el mazo prestado' }))
    const sheet = screen.getByRole('dialog', { name: '¿Con qué mazo jugás?' })
    expect(within(sheet).getByRole('radio', { name: /Sky Striker.*Es el mazo del rival/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Jugar con Angelechy' }))
    expect(onPlay).toHaveBeenCalledWith('auto')
    expect(onOpenBuilder).not.toHaveBeenCalled()
  })

  it('con deck completo, tu deck como siempre: sin chip y «Cambiar» al builder', () => {
    const { onOpenBuilder } = solo({ deckSize: 40 })

    expect(screen.getByText('Mi deck · 40')).toBeInTheDocument()
    expect(screen.queryByText('Prestado')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar deck' }))
    expect(onOpenBuilder).toHaveBeenCalled()
  })

  it('con un deck a medias que reparte la mano (20 cartas) practicás con el tuyo, como siempre: sin chip y «Cambiar» al builder', () => {
    const { onPlay, onOpenBuilder } = solo({ deckSize: 20 })

    expect(screen.getByText('Mi deck · 20')).toBeInTheDocument()
    expect(screen.queryByText('Prestado')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar deck' }))
    expect(onOpenBuilder).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /^Jugar/ })[0]!)
    expect(onPlay).toHaveBeenCalled()
  })

  it('con menos de la mano juega el prestado y la hoja dice cuántas le faltan al tuyo para jugar en Solo', () => {
    solo({ deckSize: 3 })

    expect(screen.getByText('Sky Striker · 40')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar el mazo prestado' }))
    expect(within(screen.getByRole('dialog')).getByText('Tiene 3: le faltan 2 para jugar')).toBeInTheDocument()
  })
})
