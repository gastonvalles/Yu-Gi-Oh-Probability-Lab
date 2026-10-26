// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { ChainNotice, type ChainNoticeRow } from '../components/auto/ChainNotice'
import { PLAYER_COLOR } from '../components/duel/player-color'

// La píldora de la cadena: en el celular (`compact`), dos renglones que dicen todo; en escritorio, como siempre.

const PONIX: ChainNoticeRow = { number: 1, who: 'Vos', mine: true, name: 'Ponix', art: null, state: 'chained' }
const ASH: ChainNoticeRow = { number: 2, who: 'Rival', mine: false, name: 'Ash Blossom', art: null, state: 'chained' }
const pill = (rows: ChainNoticeRow[], props: { focus?: number; resolving?: boolean; compact?: boolean } = {}) => {
  render(<ChainNotice rows={rows} focus={props.focus ?? rows.length - 1} resolving={props.resolving ?? false} open={false} compact={props.compact ?? true} onOpenChange={() => {}} onPick={() => {}} />)
  return screen.getByRole('status')
}

describe('ChainNotice en el celular: «Cadena · N · Resuelve CLn» y qué pasa', () => {
  it('negado por un eslabón que se conoce: la frase con los dos nombres, y el que se resuelve en el color de su dueño', () => {
    const status = pill([{ ...PONIX, state: 'disabled', by: 2 }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true })

    expect(status).toHaveTextContent('Cadena · 2 · Resuelve CL2Ash Blossom le quita el efecto a Ponix')
    expect(screen.getByText('CL2')).toHaveClass(PLAYER_COLOR.theirs.text)
  })

  it('negada la activación: «niega la activación de»; sin `by`, el nombre y su estado (sin «por»)', () => {
    expect(pill([{ ...PONIX, state: 'negated', by: 2 }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true })).toHaveTextContent('Ash Blossom niega la activación de Ponix')
    cleanup()
    const status = pill([{ ...PONIX, state: 'disabled' }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true })

    expect(status).toHaveTextContent('Cadena · 2 · Resuelve CL2Ponix · Sin efecto')
    expect(status).not.toHaveTextContent('por')
  })

  it('mientras se arma: cuántos eslabones, el último y de quién; el número no se repite junto al ícono', () => {
    pill([PONIX])
    expect(screen.getByTestId('chain-notice')).toHaveTextContent(/^Cadena · 1 · CL1 · VosPonix$/)
  })

  it('accesible: el estado se lee entero, la flecha dice qué hace (44 px) y, con una pregunta abierta en la mesa, queda un renglón sin flecha ni lista', () => {
    const status = pill([PONIX, { ...ASH, state: 'solving' }], { resolving: true })
    const toggle = screen.getByRole('button', { name: 'Ver la cadena' })

    expect(status.lastElementChild).toHaveClass('group-data-banded/chain:hidden')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveClass('group-data-banded/chain:hidden')
  })
})

describe('ChainNotice en escritorio: como siempre', () => {
  it('el estado con quién lo negó y el nombre debajo', () => {
    expect(pill([{ ...PONIX, state: 'disabled', by: 2 }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true, compact: false })).toHaveTextContent('Sin efecto · por CL2 · CL1 · VosPonix')
  })
})
