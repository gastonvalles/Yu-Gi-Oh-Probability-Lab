// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { frameKindOf, frameOfType } from '../app/card-frame'
import { CHAIN_LEAVE_MS, ChainStage, glyphCells, type ChainNoticeRow } from '../components/auto/ChainNotice'

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

afterEach(() => vi.useRealTimers())

describe('la cadena en grande', () => {
  it('armando, como Master Duel: la última adelante, la más grande y a −8°, la anterior a +5°; cada una con su halo blanco, atada por dos esquinas; el número digital blanco y celeste para los dos; la cadena de metal cuelga entre ellas; el campo baja y se azula; el orden, sólo para el lector de pantalla', () => {
    stage([ENGAGE, ASH, CALLED])

    expect(pose()).toEqual(['1:slot', '2:slot', '3:slot'])
    expect(cards().map((card) => card.className.match(/(?<![:\w-])-?rotate-\d+/)?.[0])).toEqual(['-rotate-3', 'rotate-5', '-rotate-8'])
    for (const card of cards()) expect(card).toHaveClass('w-1/3', 'aspect-[421/614]', 'shadow-chain-halo')
    // La leve inclinación 3D (quieta): la de adelante hacia atrás por arriba, las de atrás al revés.
    expect(cards().map((card) => card.className.match(/chain-tilt-\w+/)?.[0])).toEqual(['chain-tilt-back', 'chain-tilt-back', 'chain-tilt-front'])
    // Cada carta, atada por dos esquinas: dos tramos de cadena por delante de ella.
    for (const card of cards()) expect(card.querySelectorAll('[data-chain-ties] > g').length).toBeGreaterThan(4)
    expect(cards()[0]).toHaveClass('bg-frame-spell')
    expect(cards()[1]).toHaveClass('bg-frame-effect')
    // La última que entró, adelante y la más grande, con un borde de luz y su número destellando; las de antes, cada vez más chicas.
    expect(cards().map((card) => card.className.match(/(?<![:\w-])scale-\d+/)?.[0])).toEqual(['scale-75', 'scale-95', 'scale-140'])
    expect(cards()[2]).toHaveClass('z-5')
    expect(document.querySelectorAll('[data-chain-flash]')).toHaveLength(1)
    expect(cards()[2]!.querySelector('[data-chain-flash]')).toHaveClass('animate-fx-flash', 'motion-reduce:hidden')
    expect(cards()[2]!.querySelector('[data-chain-glow]')).toHaveClass('animate-fx-flash', 'motion-reduce:hidden')
    expect(document.querySelector('[data-chain-dim]')).toHaveClass('animate-chain-veil', 'motion-reduce:hidden')
    const number = (card: HTMLElement) => card.querySelector<HTMLElement>('[data-chain-number]')
    expect(cards().map((card) => number(card)?.dataset.chainNumber)).toEqual(['1', '2', '3'])
    // Dibujado por nosotros: los segmentos del dígito, en blanco sobre un contorno y un halo celestes, igual para el tuyo y el del rival (sin color de dueño).
    const layers = (card: HTMLElement) => [...number(card)!.querySelectorAll('svg:not(.animate-fx-flash) > g')].map((g) => g.firstElementChild?.getAttribute('class'))
    expect(layers(cards()[1]!)).toEqual(layers(cards()[0]!))
    expect(layers(cards()[0]!)).toEqual(['fill-chain-glow/30 stroke-chain-glow/25', 'fill-chain-glow stroke-chain-glow', 'fill-white'])
    // El de adelante pisa la esquina de abajo a la izquierda; los de atrás, la de la derecha.
    expect(number(cards()[2]!)!.querySelector('svg')).toHaveClass('left-0')
    expect(number(cards()[1]!)!.querySelector('svg')).toHaveClass('right-0')
    expect(veil()).toHaveClass('bg-chain-veil/65')
    // La cadena: eslabones de metal (huecos y de canto, alternados), que entran desde la carta anterior.
    expect(bonds()).toEqual(['2:on', '3:on'])
    const bond = document.querySelector('[data-chain-bond="2"]')!
    expect(bond.querySelectorAll('rect').length).toBeGreaterThan(4)
    expect(bond).toHaveClass('starting:opacity-0')
    // «CADENA» destella al medio (con dos o más); el velo baja el campo y no ataja toques.
    expect(document.querySelector('[data-chain-word]')).toHaveTextContent('Cadena')
    // «CADENA», itálica, al medio y por delante de las cartas (z-7 sobre z-5); aparece y se queda.
    expect(document.querySelector('[data-chain-word]')).toHaveClass('uppercase', 'italic', 'z-7', 'animate-pop', 'motion-reduce:animate-none')
    // El estallido de rayos dorados, detrás de la carta que entra (sólo la nueva; con movimiento reducido, no está).
    expect(document.querySelectorAll('[data-chain-burst]')).toHaveLength(1)
    expect(cards()[2]!.querySelector('[data-chain-burst]')).toHaveClass('-z-1', 'animate-fx-flash', 'motion-reduce:hidden')
    expect(veil()).toHaveClass('opacity-100', 'pointer-events-none', 'bg-chain-veil/65')
    // «Se resuelve del último al primero», sin línea a la vista (tapaba el Deck y el Extra del rival): en el status oculto.
    expect(screen.getByRole('status')).toHaveTextContent(/^Se resuelve del último al primero$/)
    expect(screen.getByRole('status')).toHaveClass('sr-only')
    // El nombre va impreso en la carta con imagen; sólo la que no tiene imagen lleva su placa.
    expect(document.querySelectorAll('[data-chain-name]')).toHaveLength(3)
    expect(screen.getByRole('img', { name: 'Eslabón 2: Ash Blossom, del rival. En espera' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/CL\d/)
  })

  it('con imagen, sin la placa del nombre (ya está impreso); con «¿Respondés?» abierto, la escena se achica hacia arriba', () => {
    const view = stage([{ ...ENGAGE, art: 'engage.jpg' }, ASH])

    expect(document.querySelectorAll('[data-chain-name]')).toHaveLength(1)
    expect(document.querySelector('[data-chain-stage]')).toHaveClass('origin-top')
    expect(document.querySelector('[data-chain-stage]')).not.toHaveClass('scale-85')
    view.rerender(
      <Provider store={store}>
        <ChainStage rows={[{ ...ENGAGE, art: 'engage.jpg' }, ASH]} current={-1} answering />
      </Provider>,
    )
    expect(document.querySelector('[data-chain-stage]')).toHaveClass('scale-85')
  })

  it('resolviendo, la escena y el velo se van con un fundido corto (`CHAIN_LEAVE_MS`) y no quedan: lo que pasó con el que se resuelve queda en una línea oculta', () => {
    vi.useFakeTimers()
    const rows = [ENGAGE, { ...ASH, state: 'disabled' as const, by: 3 }, { ...CALLED, state: 'solved' as const, outcome: 'Destierra 1 carta' }]
    const view = stage([ENGAGE, ASH, CALLED])

    view.rerender(
      <Provider store={store}>
        <ChainStage rows={rows} current={2} />
      </Provider>,
    )
    // Se está yendo: sólo opacidad, y sin el oscurecido de entrar ni «CADENA».
    expect(document.querySelector('[data-chain-stage]')).toHaveAttribute('data-leaving')
    expect(document.querySelector('[data-chain-stage]')).toHaveClass('opacity-0', 'duration-200', 'motion-reduce:transition-opacity')
    expect(veil()).toHaveClass('opacity-0', 'duration-200')
    expect(document.querySelector('[data-chain-dim]')).toBeNull()
    expect(document.querySelector('[data-chain-word]')).toBeNull()
    expect(CHAIN_LEAVE_MS).toBeGreaterThanOrEqual(150)
    expect(CHAIN_LEAVE_MS).toBeLessThanOrEqual(200)
    act(() => vi.advanceTimersByTime(CHAIN_LEAVE_MS))

    expect(document.querySelector('[data-chain-stage]')).toBeNull()
    expect(cards()).toEqual([])
    expect(veil()).toBeNull()
    // Si ya llega resolviendo (un rearme), no hay nada que fundir.
    view.unmount()
    stage(rows, 2)
    expect(document.querySelector('[data-chain-stage]')).toBeNull()
    expect(document.querySelector('[data-chain-word]')).toBeNull()
    expect(screen.getByRole('status')).toHaveClass('sr-only')
    expect(screen.getByRole('status')).toHaveTextContent(/^Called by the Grave: Destierra 1 carta$/)
  })

  it('una activación sola, aunque nadie pueda responder, entra igual con su «1» (sin «CADENA») y se va apenas empieza a resolverse', () => {
    vi.useFakeTimers()
    const view = stage([ENGAGE])

    expect(pose()).toEqual(['1:slot'])
    expect(cards()[0]!.querySelector('[data-chain-number]')).toHaveAttribute('data-chain-number', '1')
    expect(document.querySelector('[data-chain-word]')).toBeNull()
    view.rerender(
      <Provider store={store}>
        <ChainStage rows={[{ ...ENGAGE, state: 'solving' }]} current={0} />
      </Provider>,
    )
    act(() => vi.advanceTimersByTime(CHAIN_LEAVE_MS))
    expect(document.querySelector('[data-chain-stage]')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Engage!: Resolviendo')
  })

  it('alternan de lado como en Master Duel: un eslabón par entra abajo a la derecha y la anterior queda arriba a la izquierda; el número, del lado de afuera', () => {
    stage([ENGAGE, ASH])

    expect(cards()[1]).toHaveClass('rotate-8', 'chain-tilt-front-flip')
    expect(cards()[0]).toHaveClass('-rotate-5', 'chain-tilt-back-flip')
    expect(cards()[1]!.querySelector('[data-chain-number] svg')).toHaveClass('right-0')
    expect(cards()[0]!.querySelector('[data-chain-number] svg')).toHaveClass('left-0')
  })

  it('al empezar a resolver, la cadena se corta en el medio: las dos mitades se separan y se apagan mientras la escena se va', () => {
    const view = stage([ENGAGE, ASH])

    view.rerender(
      <Provider store={store}>
        <ChainStage rows={[ENGAGE, { ...ASH, state: 'solving' }]} current={1} />
      </Provider>,
    )
    const bond = document.querySelector('[data-chain-bond="2"]')!
    expect(bond).toHaveAttribute('data-broken')
    const halves = [...bond.children]
    expect(halves).toHaveLength(2)
    expect(halves[0]).toHaveClass('-translate-x-3', 'opacity-0', 'motion-reduce:transition-opacity')
    expect(halves[1]).toHaveClass('translate-x-3', 'opacity-0')
  })

  it('los diez dígitos, en bloques de 3 × 5 dibujados por nosotros: el 1 con su banderita y su base; dos cifras, una al lado de la otra', () => {
    const rows = (value: number) => [0, 1, 2, 3, 4].map((row) => [0, 1, 2].map((col) => (glyphCells(value).some((cell) => cell.x === col * 14 && cell.y === row * 14) ? '#' : '.')).join(''))

    expect(rows(1)).toEqual(['##.', '.#.', '.#.', '.#.', '###'])
    expect(rows(7)).toEqual(['###', '..#', '..#', '..#', '..#'])
    for (let digit = 0; digit < 10; digit += 1) expect(glyphCells(digit).length).toBeGreaterThan(6)
    expect(Math.max(...glyphCells(11).map((cell) => cell.x))).toBeGreaterThan(50)
  })

  it('con más de cuatro, las viejas se achican y se van hacia arriba', () => {
    const fourth: ChainNoticeRow = { ...ASH, number: 4, name: 'Infinite Impermanence' }
    const fifth: ChainNoticeRow = { ...CALLED, number: 5, name: 'Crossout Designator' }

    stage([ENGAGE, ASH, CALLED, fourth, fifth])
    expect(pose()).toEqual(['1:back', '2:slot', '3:slot', '4:slot', '5:slot'])
    expect(cards()[0]).toHaveClass('-translate-y-full', 'scale-50', 'opacity-0')
    expect(cards().map((card) => card.className.match(/(?<![:\w-])scale-\d+/)?.[0])).toEqual(['scale-50', 'scale-60', 'scale-75', 'scale-95', 'scale-140'])
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
    expect(cards()[0]).toHaveClass('transition-[translate,rotate,scale,opacity,transform]', 'motion-reduce:transition-opacity')
    // Entra grande y derecha desde el centro y cae inclinada a su lugar.
    expect(cards()[0]).toHaveClass('starting:translate-x-0', 'starting:translate-y-0', 'starting:rotate-0', 'starting:scale-150', 'starting:opacity-0')

    const code = readFileSync(path.join(__dirname, '../components/auto/ChainNotice.tsx'), 'utf8')
    // Lo que cambia entre armar e irse son clases de `translate`, `rotate`, `scale` y `opacity`: nunca `left`, `top` ni el tamaño.
    const poses = [...code.matchAll(/'([^'\n]*(?:translate|rotate|scale-)[^'\n]*)'/g)].flatMap((match) => match[1]!.split(' '))
    for (const name of poses.filter((item) => !item.startsWith('transition-') && !item.startsWith('motion-reduce:') && !item.startsWith('starting:') && item !== '')) expect(name).toMatch(/^(-?translate-[xy]-|-?rotate-|scale-|z-5$|opacity-0$|absolute$|left-1\/3$|top-2\/7$|aspect-|w-1\/3$|p-1$|duration-|ease-|shadow-chain-halo$|bottom-0$|left-0$|right-0$|chain-tilt-(front|back)(-flip)?$)/)
    expect(code).not.toMatch(/transition-all|backdrop-blur|clip-path|transition-\[[^\]]*(filter|shadow)/)
    // Cada animación nueva se apaga con movimiento reducido.
    for (const match of code.matchAll(/className=\{?[`'"]([^`'"]*animate-[^`'"]*)/g)) expect(match[1]).toMatch(/motion-reduce:(hidden|animate-none)/)
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
