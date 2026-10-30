// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import type { BotNote, SessionAnswer } from '../app/auto/auto-session'
import { writeHandtrapConfig } from '../app/handtraps'
import { BotLog, botTurns } from '../components/auto/BotLog'
import { applyLocale } from '../i18n'
import { core, lane, renderAuto } from './support/auto-screen-harness'
import { tapMenu } from './support/mat-menu'

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

  it('desde el final del duelo: con el rival pasivo, lo dice', () => {
    const fake = renderAuto()

    core(() => fake.end(0, 2))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: '¡Ganaste!' })).getByRole('button', { name: 'Qué hizo el bot' }))
    expect(screen.getByRole('dialog', { name: 'Qué hizo el bot y por qué' })).toHaveTextContent('Con el rival pasivo no hay decisiones que contar.')
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
    tapMenu('Opciones del duelo')
    fireEvent.click(screen.getByRole('button', { name: 'Qué hizo el bot' }))
    const sheet = screen.getByRole('dialog', { name: 'Qué hizo el bot y por qué' })

    fireEvent.click(within(sheet).getByRole('button', { name: 'Usé Ash Blossom & Joyous Spring en respuesta a Terraforming.' }))
    expect(screen.queryByRole('dialog', { name: 'Qué hizo el bot y por qué' })).toBeNull()
    expect(lane()).toHaveTextContent('Repasás tus jugadas')
  })
})
