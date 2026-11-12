// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import { frameKindOf, frameOfType } from '../app/card-frame'
import { ChainStage, type ChainNoticeRow } from '../components/auto/ChainNotice'
import { PLAYER_COLOR } from '../components/duel/player-color'

// La cadena en grande (K-01 a K-03): cartas grandes inclinadas con su número enorme y el borde de su tipo, unidas por eslabones; se resuelve del último al primero (al centro y se va,
// la negada tachada antes); una sola línea abajo; una activación sola entra igual con su «1». Sin «CL» escrito, sin hexágonos ni «Cómo se resuelve», y no ataja toques.

const ENGAGE: ChainNoticeRow = { number: 1, mine: true, name: 'Engage!', art: null, frame: frameKindOf('spell'), state: 'chained' }
const ASH: ChainNoticeRow = { number: 2, mine: false, name: 'Ash Blossom', art: null, frame: frameKindOf('effect'), state: 'chained' }
const CALLED: ChainNoticeRow = { number: 3, mine: true, name: 'Called by the Grave', art: null, frame: frameKindOf('spell'), state: 'chained' }
// El arte lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const stage = (rows: ChainNoticeRow[], current = -1, done = false) =>
  render(
    <Provider store={store}>
      <ChainStage rows={rows} current={current} done={done} />
    </Provider>,
  )
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-chain-card]')]
const pose = () => cards().map((card) => `${card.dataset.chainCard}:${card.dataset.pose}`)
const bonds = () => [...document.querySelectorAll('[data-chain-bond]')].map((bond) => `${bond.getAttribute('data-chain-bond')}:${bond.getAttribute('class')?.includes('opacity-100') ? 'on' : 'off'}`)

describe('la cadena en grande', () => {
  it('armando: cada carta inclinada entre 3 y 7°, con su número enorme del color de su dueño, el borde de su tipo y un eslabón a la anterior; una sola línea dice el orden', () => {
    stage([ENGAGE, ASH, CALLED])

    expect(pose()).toEqual(['1:slot', '2:slot', '3:slot'])
    expect(cards().map((card) => card.className.match(/-?rotate-\d+/)?.[0])).toEqual(['-rotate-6', 'rotate-6', '-rotate-3'])
    for (const card of cards()) expect(card).toHaveClass('w-1/3', 'aspect-[421/614]')
    expect(cards()[0]).toHaveClass('bg-frame-spell')
    expect(cards()[1]).toHaveClass('bg-frame-effect')
    const number = (card: HTMLElement) => card.querySelector('[aria-hidden="true"].text-hit')
    expect(cards().map((card) => number(card)?.textContent)).toEqual(['1', '2', '3'])
    expect(number(cards()[1]!)).toHaveClass(PLAYER_COLOR.theirs.text)
    expect(bonds()).toEqual(['2:on', '3:on'])
    expect(screen.getByRole('status')).toHaveTextContent(/^Se resuelve del último al primero$/)
    expect(screen.getByRole('img', { name: 'Eslabón 2: Ash Blossom, del rival. En espera' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/CL\d/)
  })

  it('resolviendo, del último al primero: la que resuelve va al centro y crece; las de arriba se fueron y su eslabón se cortó; la negada se tacha', () => {
    const view = stage([ENGAGE, { ...ASH, state: 'disabled', by: 3 }, { ...CALLED, state: 'solved', outcome: 'Destierra 1 carta' }], 2)

    expect(pose()).toEqual(['1:slot', '2:slot', '3:center'])
    expect(cards()[2]).toHaveClass('scale-135', 'z-10')
    expect(cards()[1]).toHaveAttribute('data-voided')
    expect(cards()[1]!.querySelector('svg line')).toHaveClass('stroke-danger')
    expect(screen.getByRole('status')).toHaveTextContent(/^Called by the Grave: Destierra 1 carta$/)

    view.rerender(
      <Provider store={store}>
        <ChainStage rows={[ENGAGE, { ...ASH, state: 'disabled', by: 3 }, { ...CALLED, state: 'solved', outcome: 'Destierra 1 carta' }]} current={1} />
      </Provider>,
    )
    expect(pose()).toEqual(['1:slot', '2:center', '3:out'])
    expect(cards()[2]).toHaveClass('opacity-0')
    expect(bonds()).toEqual(['2:on', '3:off'])
    // Sin números de eslabón: quién la dejó sin efecto, por su nombre.
    expect(screen.getByRole('status')).toHaveTextContent(/^Ash Blossom: Sin efecto por Called by the Grave$/)
  })

  it('una activación sola, aunque nadie pueda responder, entra igual con su «1», va al centro y se va', () => {
    const view = stage([ENGAGE])
    const again = (current: number, done = false) =>
      view.rerender(
        <Provider store={store}>
          <ChainStage rows={[{ ...ENGAGE, state: current < 0 ? 'chained' : 'solved', ...(current < 0 ? {} : { outcome: 'Añade 1 carta' }) }]} current={current} done={done} />
        </Provider>,
      )

    expect(pose()).toEqual(['1:slot'])
    expect(cards()[0]).toHaveTextContent('1')
    again(0)
    expect(pose()).toEqual(['1:center'])
    expect(screen.getByRole('status')).toHaveTextContent('Engage!: Añade 1 carta')
    again(0, true)
    expect(pose()).toEqual(['1:out'])
  })

  it('con más de tres, se ven las tres de arriba; las de abajo vuelven cuando se van aquéllas', () => {
    const fourth: ChainNoticeRow = { ...ASH, number: 4, name: 'Infinite Impermanence' }
    const view = stage([ENGAGE, ASH, CALLED, fourth])

    expect(pose()).toEqual(['2:slot', '3:slot', '4:slot'])
    view.rerender(
      <Provider store={store}>
        <ChainStage rows={[ENGAGE, ASH, { ...CALLED, state: 'solving' }, { ...fourth, state: 'solved' }]} current={2} />
      </Provider>,
    )
    expect(pose()).toEqual(['1:slot', '2:slot', '3:center', '4:out'])
  })

  it('no ataja toques y sólo anima transform y opacidad; con movimiento reducido, sólo la opacidad', () => {
    stage([ENGAGE])
    expect(document.querySelector('[data-chain-stage]')).toHaveClass('pointer-events-none')
    expect(cards()[0]).toHaveClass('transition-[translate,rotate,scale,opacity]', 'motion-reduce:transition-opacity')

    const code = readFileSync(path.join(__dirname, '../components/auto/ChainNotice.tsx'), 'utf8')
    // Lo que cambia entre armar, resolver e irse son clases de `translate`, `rotate`, `scale` y `opacity`: nunca `left`, `top` ni el tamaño.
    const poses = [...code.matchAll(/'([^'\n]*(?:translate|rotate|scale-)[^'\n]*)'/g)].flatMap((match) => match[1]!.split(' '))
    for (const name of poses.filter((item) => !item.startsWith('transition-') && !item.startsWith('motion-reduce:') && !item.startsWith('starting:') && item !== '')) expect(name).toMatch(/^(-?translate-[xy]-|-?rotate-|scale-|z-10$|opacity-0$|absolute$|left-1\/3$|top-2\/7$|aspect-|w-1\/3$|p-1$|duration-|ease-)/)
    expect(code).not.toMatch(/transition-all|backdrop-blur|clip-path/)
  })
})

describe('frameOfType: el marco de una carta del rival por su tipo del `.cdb`', () => {
  it('Efecto, Normal, Xyz, Enlace, Péndulo, Ficha, Mágica (también la de Ritual) y Trampa; sin tipo, neutro', () => {
    expect(frameOfType(0x21).kind).toBe('effect')
    expect(frameOfType(0x11).kind).toBe('normal')
    expect(frameOfType(0x800021).kind).toBe('xyz')
    expect(frameOfType(0x4000021).kind).toBe('link')
    expect(frameOfType(0x1000021)).toMatchObject({ kind: 'effect', pendulum: true })
    expect(frameOfType(0x4011).kind).toBe('token')
    expect(frameOfType(0x82).kind).toBe('spell')
    expect(frameOfType(0x100004).kind).toBe('trap')
    expect(frameOfType(0).kind).toBe('neutral')
  })
})
