// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { ChainNotice, type ChainNoticeRow } from '../components/auto/ChainNotice'
import { PLAYER_COLOR } from '../components/duel/player-color'

// La píldora de la cadena: dos renglones cortos y sin nombres de cartas (los nombres van en la pila desplegada); en el celular (`compact`), arriba dice cuántos y cuál resuelve.

const PONIX: ChainNoticeRow = { number: 1, who: 'Vos', mine: true, name: 'Ponix', art: null, state: 'chained' }
const ASH: ChainNoticeRow = { number: 2, who: 'Rival', mine: false, name: 'Ash Blossom', art: null, state: 'chained' }
const pill = (rows: ChainNoticeRow[], props: { focus?: number; resolving?: boolean; compact?: boolean } = {}) => {
  render(<ChainNotice rows={rows} focus={props.focus ?? rows.length - 1} resolving={props.resolving ?? false} open={false} compact={props.compact ?? true} onOpenChange={() => {}} onPick={() => {}} />)
  return screen.getByRole('status')
}

describe('ChainNotice en el celular: «Cadena · N · Resuelve CLn» y qué pasa, sin nombres', () => {
  it('negado por un eslabón que se conoce: el estado corto con su número, y el que se resuelve en el color de su dueño', () => {
    const status = pill([{ ...PONIX, state: 'disabled', by: 2 }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true })

    expect(status).toHaveTextContent(/^Cadena · 2 · Resuelve CL2Sin efecto · por CL2$/)
    expect(screen.getAllByText('CL2')[0]).toHaveClass(PLAYER_COLOR.theirs.text)
  })

  it('negada la activación, con y sin `by`', () => {
    expect(pill([{ ...PONIX, state: 'negated', by: 2 }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true })).toHaveTextContent(/Negada · por CL2$/)
  })

  it('mientras se arma: cuántos eslabones, el último y de quién, y su estado; el número no se repite junto al ícono', () => {
    pill([PONIX])
    expect(screen.getByTestId('chain-notice')).toHaveTextContent(/^Cadena · 1 · CL1 · VosEn espera$/)
  })

  it('accesible: el estado se lee entero, la flecha dice qué hace (44 px) y, con una pregunta abierta en la mesa, queda un renglón sin flecha ni lista', () => {
    const status = pill([PONIX, { ...ASH, state: 'solving' }], { resolving: true })
    const toggle = screen.getByRole('button', { name: 'Ver la cadena' })

    expect(status.lastElementChild).toHaveClass('group-data-banded/chain:hidden')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveClass('group-data-banded/chain:hidden')
  })
})

describe('ChainNotice en escritorio', () => {
  it('el eslabón y de quién arriba; debajo, su estado con quién lo negó, sin el nombre', () => {
    expect(pill([{ ...PONIX, state: 'disabled', by: 2 }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true, compact: false })).toHaveTextContent(/^Cadena · CL1 · VosSin efecto · por CL2$/)
  })
})
