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

// La cadena en grande (K-01 a K-03), sólo al encadenar: cartas grandes inclinadas con su número enorme y el borde de su tipo, unidas por una cadena de metal; resolviendo, no está
// (quedan los medallones); una sola línea arriba; una activación sola entra igual con su «1». Sin «CL» escrito, sin hexágonos ni «Cómo se resuelve», y no ataja toques.

const ENGAGE: ChainNoticeRow = { number: 1, mine: true, name: 'Engage!', art: null, frame: frameKindOf('spell'), state: 'chained' }
const ASH: ChainNoticeRow = { number: 2, mine: false, name: 'Ash Blossom', art: null, frame: frameKindOf('effect'), state: 'chained' }
const CALLED: ChainNoticeRow = { number: 3, mine: true, name: 'Called by the Grave', art: null, frame: frameKindOf('spell'), state: 'chained' }
// El arte lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const stage = (rows: ChainNoticeRow[], current = -1, done = false, away = false) =>
  render(
    <Provider store={store}>
      <ChainStage rows={rows} current={current} done={done} away={away} />
    </Provider>,
  )
const veil = () => document.querySelector('[data-chain-veil]')
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-chain-card]')]
const pose = () => cards().map((card) => `${card.dataset.chainCard}:${card.dataset.pose}`)
const bonds = () => [...document.querySelectorAll('[data-chain-bond]')].map((bond) => `${bond.getAttribute('data-chain-bond')}:${bond.getAttribute('class')?.includes('opacity-100') ? 'on' : 'off'}`)

describe('la cadena en grande', () => {
  it('armando: cada carta inclinada entre 3 y 7°, con su número enorme del color de su dueño (con borde), el borde de su tipo y una cadena de metal a la anterior; la última adelante y más grande; el campo baja; una sola línea arriba dice el orden', () => {
    stage([ENGAGE, ASH, CALLED])

    expect(pose()).toEqual(['1:slot', '2:slot', '3:slot'])
    expect(cards().map((card) => card.className.match(/(?<![:\w-])-?rotate-\d+/)?.[0])).toEqual(['-rotate-3', 'rotate-6', '-rotate-6'])
    for (const card of cards()) expect(card).toHaveClass('w-1/3', 'aspect-[421/614]')
    expect(cards()[0]).toHaveClass('bg-frame-spell')
    expect(cards()[1]).toHaveClass('bg-frame-effect')
    // La última que entró, adelante y la más grande, con un borde de luz y su número destellando; las de antes, cada vez más chicas.
    expect(cards().map((card) => card.className.match(/(?<![:\w-])scale-\d+/)?.[0])).toEqual(['scale-75', 'scale-90', 'scale-150'])
    expect(cards()[2]).toHaveClass('z-5')
    expect(document.querySelectorAll('[data-chain-flash]')).toHaveLength(1)
    expect(cards()[2]!.querySelector('[data-chain-flash]')).toHaveClass('animate-fx-flash', 'motion-reduce:hidden')
    expect(cards()[2]!.querySelector('[data-chain-glow]')).toHaveClass('animate-fx-flash', 'motion-reduce:hidden')
    expect(document.querySelector('[data-chain-dim]')).toHaveClass('animate-chain-veil', 'motion-reduce:hidden')
    const number = (card: HTMLElement) => card.querySelector<HTMLElement>('[data-chain-number]')
    expect(cards().map((card) => number(card)?.querySelector('text')?.textContent)).toEqual(['1', '2', '3'])
    expect(number(cards()[1]!)).toHaveClass('text-hit', PLAYER_COLOR.theirs.text)
    expect(number(cards()[0]!)!.querySelector('text')).toHaveClass('fill-current', 'stroke-background')
    expect(number(cards()[0]!)!.querySelector('text')).toHaveAttribute('paint-order', 'stroke')
    // La cadena: eslabones de metal (huecos y de canto, alternados), que entran desde la carta anterior.
    expect(bonds()).toEqual(['2:on', '3:on'])
    const bond = document.querySelector('[data-chain-bond="2"]')!
    expect(bond.querySelectorAll('rect').length).toBeGreaterThan(4)
    expect(bond).toHaveClass('starting:scale-x-0')
    // «CADENA» destella al medio (con dos o más); el velo baja el campo y no ataja toques.
    expect(document.querySelector('[data-chain-word]')).toHaveTextContent('Cadena')
    expect(document.querySelector('[data-chain-word]')).toHaveClass('uppercase', 'animate-fx-flash', 'motion-reduce:hidden')
    expect(veil()).toHaveClass('opacity-100', 'pointer-events-none', 'bg-background/60')
    expect(screen.getByRole('status')).toHaveTextContent(/^Se resuelve del último al primero$/)
    expect(screen.getByRole('status')).toHaveClass('top-0')
    expect(screen.getByRole('img', { name: 'Eslabón 2: Ash Blossom, del rival. En espera' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/CL\d/)
  })

  it('resolviendo, la escena no está (ni cartas, ni velo, ni línea a la vista): lo que pasó con el que se resuelve queda en una línea oculta, para el lector de pantalla', () => {
    stage([ENGAGE, { ...ASH, state: 'disabled', by: 3 }, { ...CALLED, state: 'solved', outcome: 'Destierra 1 carta' }], 2)

    expect(document.querySelector('[data-chain-stage]')).toBeNull()
    expect(cards()).toEqual([])
    expect(veil()).toBeNull()
    expect(document.querySelector('[data-chain-word]')).toBeNull()
    expect(screen.getByRole('status')).toHaveClass('sr-only')
    expect(screen.getByRole('status')).toHaveTextContent(/^Called by the Grave: Destierra 1 carta$/)
  })

  it('una activación sola, aunque nadie pueda responder, entra igual con su «1» (sin «CADENA») y se va apenas empieza a resolverse', () => {
    const view = stage([ENGAGE])

    expect(pose()).toEqual(['1:slot'])
    expect(cards()[0]).toHaveTextContent('1')
    expect(document.querySelector('[data-chain-word]')).toBeNull()
    view.rerender(
      <Provider store={store}>
        <ChainStage rows={[{ ...ENGAGE, state: 'solving' }]} current={0} />
      </Provider>,
    )
    expect(document.querySelector('[data-chain-stage]')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Engage!: Resolviendo')
  })

  it('con más de cuatro, las viejas se achican y se van hacia arriba', () => {
    const fourth: ChainNoticeRow = { ...ASH, number: 4, name: 'Infinite Impermanence' }
    const fifth: ChainNoticeRow = { ...CALLED, number: 5, name: 'Crossout Designator' }

    stage([ENGAGE, ASH, CALLED, fourth, fifth])
    expect(pose()).toEqual(['1:back', '2:slot', '3:slot', '4:slot', '5:slot'])
    expect(cards()[0]).toHaveClass('-translate-y-full', 'scale-50', 'opacity-0')
    expect(cards().map((card) => card.className.match(/(?<![:\w-])scale-\d+/)?.[0])).toEqual(['scale-50', 'scale-60', 'scale-75', 'scale-90', 'scale-150'])
    expect(bonds()).toEqual(['3:on', '4:on', '5:on'])
  })

  it('corrida (el núcleo pregunta algo que no es responder): ni cartas, ni velo, ni línea a la vista, sin atajar toques; la línea sigue para el lector de pantalla', () => {
    stage([ENGAGE, ASH], -1, false, true)

    expect(document.querySelector('[data-chain-stage]')).toHaveAttribute('data-away')
    expect(document.querySelector('[data-chain-stage]')).toHaveClass('pointer-events-none')
    expect(pose()).toEqual(['1:out', '2:out'])
    for (const card of cards()) expect(card).toHaveClass('opacity-0')
    expect(bonds()).toEqual([])
    expect(veil()).toHaveClass('opacity-0')
    expect(document.querySelector('[data-chain-dim]')).toBeNull()
    expect(document.querySelector('[data-chain-word]')).toBeNull()
    expect(screen.getByRole('status')).toHaveClass('sr-only')
  })

  it('no ataja toques y sólo anima transform y opacidad; con movimiento reducido, sólo la opacidad (sin destellos)', () => {
    stage([ENGAGE])
    expect(document.querySelector('[data-chain-stage]')).toHaveClass('pointer-events-none')
    expect(cards()[0]).toHaveClass('transition-[translate,rotate,scale,opacity]', 'motion-reduce:transition-opacity')
    // Entra grande y derecha desde el centro y cae inclinada a su lugar.
    expect(cards()[0]).toHaveClass('starting:translate-x-0', 'starting:translate-y-0', 'starting:rotate-0', 'starting:scale-150', 'starting:opacity-0')

    const code = readFileSync(path.join(__dirname, '../components/auto/ChainNotice.tsx'), 'utf8')
    // Lo que cambia entre armar e irse son clases de `translate`, `rotate`, `scale` y `opacity`: nunca `left`, `top` ni el tamaño.
    const poses = [...code.matchAll(/'([^'\n]*(?:translate|rotate|scale-)[^'\n]*)'/g)].flatMap((match) => match[1]!.split(' '))
    for (const name of poses.filter((item) => !item.startsWith('transition-') && !item.startsWith('motion-reduce:') && !item.startsWith('starting:') && item !== '')) expect(name).toMatch(/^(-?translate-[xy]-|-?rotate-|scale-|z-5$|opacity-0$|absolute$|left-1\/3$|top-2\/7$|aspect-|w-1\/3$|p-1$|duration-|ease-)/)
    expect(code).not.toMatch(/transition-all|backdrop-blur|clip-path|transition-\[[^\]]*(filter|shadow)/)
    // Cada animación nueva se apaga con movimiento reducido.
    for (const match of code.matchAll(/className=\{?[`'"]([^`'"]*animate-[^`'"]*)/g)) expect(match[1]).toContain('motion-reduce:hidden')
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
