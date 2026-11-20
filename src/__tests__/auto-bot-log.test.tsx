// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it } from 'vitest'

import type { BotNote, SessionAnswer } from '../app/auto/auto-session'
import { writeHandtrapConfig } from '../app/handtraps'
import { BotLog, botTurns } from '../components/auto/BotLog'
import { applyLocale } from '../i18n'
import { core, renderAuto } from './support/auto-screen-harness'
import { openOptions } from './support/mat-menu'

// «Qué hizo el bot y por qué»: la lista por turno (con sus estados), y la hoja desde el final y desde «Opciones del duelo».

const ASH = 14558127
const IMPERM = 10045474
const TERRA = 73628505
const NAMES: Record<number, string> = { [ASH]: 'Ash Blossom & Joyous Spring', [IMPERM]: 'Infinite Impermanence', [TERRA]: 'Terraforming', 1: 'Gaia Knight', 2: 'Stardust Dragon' }
const nameOf = (code: number) => NAMES[code] ?? '?'
const artOf = () => null
const PASS = { type: 'select_chain', index: null } as const
const note = (key: string, cards: number[], turn: number, yours: boolean, at: number): BotNote => ({ key: `auto.bot.reason.${key}`, cards, turn, yours, at })
const rival = (reason: BotNote): SessionAnswer => ({ seat: 1, answer: PASS, reason })
const ANSWERS: SessionAnswer[] = [
  { seat: 0, answer: { type: 'select_idlecmd', action: 5, index: 0 } },
  rival(note('hold.monster', [IMPERM, TERRA], 1, true, 2)),
  rival(note('handtrap.respond', [ASH, TERRA], 1, true, 2)),
  // La misma que guardó, otra vez en el mismo turno: no se repite.
  rival(note('hold.monster', [IMPERM, TERRA], 1, true, 3)),
  rival(note('cost.extra', [1], 2, false, 5)),
  rival(note('cost.extra', [2], 2, false, 5)),
  rival(note('end.noPlays', [], 2, false, 5)),
]

afterEach(() => applyLocale('es'))

describe('Qué hizo el bot y por qué', () => {
  it('un bloque por turno con cada decisión en una frase; lo guardado, una vez por carta y turno; lo del Extra Deck, en un renglón', () => {
    const turns = botTurns(ANSWERS)

    expect(turns.map((turn) => [turn.turn, turn.yours, turn.notes.length])).toEqual([[1, true, 2], [2, false, 2]])
    render(<BotLog turns={turns} deciding nameOf={nameOf} artOf={artOf} />)
    expect(within(screen.getByRole('list', { name: 'Turno 1 · vos' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Tenía Infinite Impermanence y no la usé contra Terraforming: la guardo para un efecto de monstruo en el campo.',
      'Usé Ash Blossom & Joyous Spring en respuesta a Terraforming.',
    ])
    expect(within(screen.getByRole('list', { name: 'Turno 2 · bot' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Elegí 2 veces de mi Extra Deck, en el orden de mi lista: primero Gaia Knight.',
      'Terminé el turno: no juego cartas al campo, sólo uso handtraps.',
    ])
    // Sin `onPick` los renglones no se tocan; los límites, siempre.
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.getByText(/^Sparring de práctica/)).toBeInTheDocument()
  })

  it('una decisión que no nombra carta («Terminé el turno») es un renglón de texto, sin cuadro de miniatura; las que nombran una, lo llevan', () => {
    render(<BotLog turns={botTurns(ANSWERS)} deciding nameOf={nameOf} artOf={artOf} />)
    const [withCard, withoutCard] = within(screen.getByRole('list', { name: 'Turno 2 · bot' })).getAllByRole('listitem')

    expect(withCard!.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(withoutCard).toHaveTextContent('Terminé el turno')
    expect(withoutCard!.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('una carta que el núcleo nombra por un arte alternativo sale con el nombre y la imagen de su original (`alias`)', () => {
    const ALT = 5000
    const ORIGINAL = 5001
    const turns = botTurns([rival(note('cost.extra', [ALT], 2, false, 5))])
    const known = (code: number) => (code === ORIGINAL ? 'Original Dragon' : null)
    const art = (code: number) => (code === ORIGINAL ? `https://art.test/${code}.jpg` : null)
    // La imagen lleva la insignia de límite (lee el formato del deck del store).
    const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
    const { container, rerender } = render(<BotLog turns={turns} deciding nameOf={known} artOf={art} aliasOf={(code) => (code === ALT ? ORIGINAL : 0)} />, {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    })

    expect(screen.getByRole('listitem')).toHaveTextContent('Elegí Original Dragon de mi Extra Deck')
    expect(container.querySelector('img')?.getAttribute('src')).toContain(String(ORIGINAL))
    // Sin el `alias`, la carta no se conoce: sin nombre y sin imagen.
    rerender(<BotLog turns={turns} deciding nameOf={known} artOf={art} />)
    expect(screen.getByRole('listitem')).not.toHaveTextContent('Original Dragon')
    expect(container.querySelector('img')).toBeNull()
  })

  it('tocar un renglón dice cuál (para llevar la mesa a ese momento)', () => {
    const picked: BotNote[] = []

    render(<BotLog turns={botTurns(ANSWERS)} deciding nameOf={nameOf} artOf={artOf} onPick={(item) => picked.push(item)} />)
    expect(screen.getByText('Tocá una decisión para ver tu mesa en ese momento.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Usé Ash Blossom/ }))
    expect(picked.map((item) => [item.key, item.at])).toEqual([['auto.bot.reason.handtrap.respond', 2]])
  })

  it('los estados: el rival pasivo (no juega), sin decisiones todavía y rearmando (cargando)', () => {
    const { rerender } = render(<BotLog turns={[]} deciding={false} nameOf={nameOf} artOf={artOf} />)

    expect(screen.getByText('El rival no juega')).toBeInTheDocument()
    rerender(<BotLog turns={[]} deciding nameOf={nameOf} artOf={artOf} />)
    expect(screen.getByText('Todavía no decidió nada')).toBeInTheDocument()
    rerender(<BotLog turns={botTurns(ANSWERS)} deciding loading nameOf={nameOf} artOf={artOf} />)
    expect(screen.getByRole('list', { busy: true })).toBeInTheDocument()
  })

  it('en inglés', () => {
    applyLocale('en')
    render(<BotLog turns={botTurns(ANSWERS)} deciding nameOf={nameOf} artOf={artOf} />)
    expect(screen.getByRole('list', { name: 'Turn 2 · bot' })).toHaveTextContent("I picked from my Extra Deck 2 times, in my list's order: Gaia Knight first.")
    expect(screen.getByText(/^Practice sparring/)).toBeInTheDocument()
  })

  it('desde el final del duelo, «Ver el replay» abre el duelo recién jugado en el visor de replays, desde el principio y sin guardarlo; volver lleva al resultado', () => {
    const fake = renderAuto()

    core(() => fake.end(0, 2))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: '¡Ganaste!' })).getByRole('button', { name: 'Ver el replay' }))
    const layer = screen.getByRole('dialog', { name: 'Ver el replay' })
    expect(within(layer).getByTestId('replay-step')).toBeInTheDocument()
    fireEvent.click(within(layer).getByRole('button', { name: 'Volver al resultado' }))
    expect(screen.queryByRole('dialog', { name: 'Ver el replay' })).toBeNull()
    expect(screen.getByRole('alertdialog', { name: '¡Ganaste!' })).toBeInTheDocument()
    // La ✕ deja el campo solo; «Ver el resultado» lo vuelve a abrir.
    fireEvent.click(screen.getByRole('button', { name: 'Ver el campo' }))
    expect(screen.queryByRole('alertdialog', { name: '¡Ganaste!' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver el resultado' }))
    expect(screen.getByRole('alertdialog', { name: '¡Ganaste!' })).toBeInTheDocument()
  })

  it('desde «Opciones del duelo», con el de handtraps: tocar una decisión cierra la hoja y repasa tu mesa en ese momento', () => {
    writeHandtrapConfig({ enabled: true, picks: [{ id: ASH, name: NAMES[ASH]!, copies: 1 }], hand: 1 })
    const fake = renderAuto()

    // Rearmada (sin el ritmo de a un paso): tus tres jugadas ya se ven, y el rival decidió después de la segunda.
    core(() => fake.rearm([{ type: 'draw', count: 1, ids: ['card-101-1'] }, { type: 'move', id: 'card-200-1', to: 'gy' }, { type: 'draw', count: 1, ids: ['card-102-1'] }], null))
    core(() =>
      fake.set({
        answers: [{ seat: 1, answer: PASS, reason: note('handtrap.respond', [ASH, TERRA], 1, true, 2) }],
        names: { [ASH]: NAMES[ASH]!, [TERRA]: NAMES[TERRA]! },
      }),
    )
    openOptions()
    fireEvent.click(screen.getByRole('button', { name: 'Qué hizo el bot' }))
    const sheet = screen.getByRole('dialog', { name: 'Qué hizo el bot y por qué' })

    fireEvent.click(within(sheet).getByRole('button', { name: 'Usé Ash Blossom & Joyous Spring en respuesta a Terraforming.' }))
    expect(screen.queryByRole('dialog', { name: 'Qué hizo el bot y por qué' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Volver al duelo' })).toBeInTheDocument()
  })
})
