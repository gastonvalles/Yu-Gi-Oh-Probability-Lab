// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { railsCell } from '../app/duel-rails'
import { buildDuelReplay } from '../app/duel-replay'
import type { SavedReplay } from '../app/duel-replay-share'
import { createMatState } from '../app/practice-mat'
import { HAND_TOP_ROOM, PHONE_DUEL_BAR, PHONE_DUEL_BOTTOM, matDuelLayout } from '../components/probability/compact-field'
import { DuelReplayScreen } from '../components/replays/DuelReplayScreen'
import { YourDuels } from '../components/replays/YourDuels'

// `CardArt` lee el formato del deck del store: uno mínimo.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(<Provider store={store}>{ui}</Provider>)

// Un duelo corto: robás, invocás Ash Blossom y colocás una carta; el rival invoca una que muestra.
const deck = Array.from({ length: 20 }, (_, i) => `card-${14558127 + (i % 4)}-${Math.floor(i / 4) + 1}`)
const mine = createMatState(deck, [], 5)
const [h0, h1] = mine.hand as [string, string]
const replayOf = (view: 'public' | 'mine') =>
  buildDuelReplay({
    mode: 'link-auto',
    view,
    players: ['Ana', 'Beto'],
    starter: 0,
    mine: { initial: mine, actions: [{ type: 'phase', phase: 'main1' }, { type: 'place', id: h0, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }, { type: 'place', id: h1, zone: 'st', index: 0, pos: 'set' }] },
    theirs: { initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5), acts: [{ action: { type: 'place', id: 'c1', zone: 'mz', index: 1, pos: 'atk', how: 'normal' }, reveal: { c1: 'card-55144522-1' } }] },
    order: ['mine', 'mine', 'mine', 'theirs'],
    life: [{ at: 0, lp: [8000, 8000] }],
    nameOf: (code) => (code === 14558127 ? 'Ash Blossom' : code === 55144522 ? 'Pot of Greed' : `Carta ${code}`),
    result: { winner: 0, reason: 'lp' },
  })

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})
afterEach(cleanup)

describe('la pantalla del replay de un duelo', () => {
  it('se recorre jugada por jugada: el paso, quién la hizo y el final; la mano de quien grabó, de dorso en la vista pública', () => {
    render(<DuelReplayScreen replay={replayOf('public')} onClose={() => {}} actions={[]} />)

    const step = screen.getByTestId('replay-step')
    expect(step).toHaveTextContent('Jugada 4 de 4 · Ganó Ana · sin puntos de vida')
    expect(step).toHaveTextContent('Beto: Invocación Normal de Pot of Greed')
    fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
    expect(step).toHaveTextContent('La mesa al empezar')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(step).toHaveTextContent('Ana: Invocación Normal de Ash Blossom')
    expect(screen.getByRole('slider', { name: 'Línea de tiempo del replay' })).toHaveAttribute('aria-valuenow', '2')
    // La mano de abajo (la de Ana) no dice qué cartas son.
    expect(screen.queryByRole('img', { name: /Ash Blossom/ })).toBeNull()
    // Cada mano dice de quién es (no «Mano del rival»).
    expect(screen.getByRole('img', { name: /^Mano de Ana: \d/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Mano de Beto: / })).toBeInTheDocument()
    expect(screen.getByText('Vista de espectador')).toBeInTheDocument()
  })

  it('se ve como la mesa del duelo: la caja de la fase al medio (sin la tira de siglas), las dos chapas con el borde de quien tiene el turno y las dos manos', () => {
    const { container } = render(<DuelReplayScreen replay={replayOf('public')} onClose={() => {}} actions={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    // El remolino de la mesa de fondo.
    expect(container.querySelector('.mat-scene')).not.toBeNull()
    // Una sola caja de la fase, la de quien tiene el turno (abajo: lima), que no se toca; ninguna sigla suelta.
    const phase = screen.getByRole('button', { name: 'Fase actual: Main Phase 1' })
    expect(phase).toHaveAttribute('data-active', 'true')
    expect(phase).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText('DP')).toBeNull()
    // Las chapas de la mesa: la de Ana (su turno) con el borde grueso; sin el marcador de antes.
    const badges = [...container.querySelectorAll('[data-life-score]')]
    expect(badges).toHaveLength(2)
    expect(screen.queryByTestId('replay-score')).toBeNull()
    // Las dos manos en abanico: la de arriba y la de abajo (con la marca de la mano propia: de ahí salen sus vuelos).
    expect(container.querySelectorAll('[data-rival-drop="hand"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-drop="hand"]')).toHaveLength(1)
  })

  it('hasta 1100 px el campo y las manos son los del duelo (`matDuelLayout` con la barra y la fila de la mesa): mismo lugar, mismas filas, mismas cartas de mano; los controles van en esas dos franjas', () => {
    const size = { innerWidth: window.innerWidth, innerHeight: window.innerHeight }
    for (const [width, height, phone] of [[369, 800, true], [390, 844, true], [768, 1024, false]] as const) {
      window.matchMedia = ((query: string) => ({ matches: (phone && query.includes('639')) || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
      Object.assign(window, { innerWidth: width, innerHeight: height })
      try {
        const { container, unmount } = render(<DuelReplayScreen replay={replayOf('public')} onClose={() => {}} actions={[]} />)
        const mat = matDuelLayout(width, height, { tilted: false, bar: PHONE_DUEL_BAR, bottom: PHONE_DUEL_BOTTOM })
        const table = screen.getByRole('group', { name: 'Mesa del duelo' })
        expect(table).toHaveAttribute('data-phone')
        expect(table.style.width).toBe(`${mat.fieldWidth}px`)
        expect(table.style.height).toBe(`${mat.fieldHeight}px`)
        expect(table.style.gridTemplateRows).toBe(`repeat(5, ${mat.row}px)`)
        const top = (selector: string) => Number.parseFloat((container.querySelector(selector)!.parentElement as HTMLElement).style.top)
        expect(top('[data-rival-drop="hand"]')).toBeCloseTo(mat.rivalTop, 3)
        // La grilla va dentro de la caja de `DuelTable`, y ésa en su lugar.
        let box: HTMLElement | null = table
        while (box && !box.style.top) box = box.parentElement
        expect(Number.parseFloat(box!.style.top)).toBeCloseTo(mat.fieldTop, 3)
        expect(top('[data-drop="hand"]')).toBeCloseTo(mat.handTop + HAND_TOP_ROOM, 3)
        // La mano de abajo, de la carta de la mesa; la de arriba, a 0,8.
        const card = (selector: string) => Number.parseFloat((container.querySelector(`${selector} [data-their-card]`) as HTMLElement).style.width)
        expect(card('[data-drop="hand"]')).toBeCloseTo(mat.handCard, 3)
        expect(card('[data-rival-drop="hand"]')).toBeCloseTo(mat.rivalCard, 3)
        // En el celular, «Volver al principio» va en el menú (la fila no tiene más ancho); en la tableta, en la fila.
        expect(screen.queryByRole('button', { name: 'Volver al principio' }) === null).toBe(phone)
        unmount()
      } finally {
        Object.assign(window, size)
      }
    }
  })

  it('en escritorio el campo es el de la mesa del duelo automático en escritorio (casillas cuadradas, sin `data-phone`): la casilla de laterales de la mesa (`railsCell`), con los controles a los costados', () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('1101') || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    const size = { innerWidth: window.innerWidth, innerHeight: window.innerHeight }
    Object.assign(window, { innerWidth: 1440, innerHeight: 900 })
    try {
      render(<DuelReplayScreen replay={replayOf('public')} onClose={() => {}} actions={[]} />)
      const table = screen.getByRole('group', { name: 'Mesa del duelo' })
      expect(table).not.toHaveAttribute('data-phone')
      const cell = Number.parseFloat((table.closest('[style*="--cell"]') as HTMLElement).style.getPropertyValue('--cell'))
      // Sin medir (jsdom), la ventana: 1440 × 900, la casilla de la mesa con laterales a ese alto (sin el panel del detalle, que sale desde 1440 px: acá la consulta no lo prende).
      expect(cell).toBeCloseTo(railsCell(900), 3)
    } finally {
      Object.assign(window, size)
    }
  })

  it('cada cambio de fase sale con la banda de la mesa, del color de quien la pasa (Ana, violeta; Beto, lima), al reproducir o con «Siguiente»; saltar con la línea de tiempo no lo repite', () => {
    vi.useFakeTimers()
    const replay = buildDuelReplay({
      mode: 'link-auto',
      view: 'public',
      players: ['Ana', 'Beto'],
      starter: 0,
      mine: { initial: mine, actions: [{ type: 'phase', phase: 'main1' }] },
      theirs: { initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5), acts: [{ action: { type: 'phase', phase: 'standby' }, reveal: {} }] },
      order: ['mine', 'theirs'],
      life: [{ at: 0, lp: [8000, 8000] }],
      nameOf: () => undefined,
    })
    const banner = () => document.querySelector('[data-fx="banner"]')

    try {
      render(<DuelReplayScreen replay={replay} onClose={() => {}} actions={[]} />)
      // Abre en el final: nada se anuncia.
      expect(banner()).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect(banner()).toHaveTextContent(/^Main Phase 1$/)
      expect(banner()).toHaveAttribute('data-side', 'mine')
      // Reproduciendo, la del rival en su color; y se va sola.
      fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
      act(() => vi.advanceTimersByTime(900))
      expect(banner()).toHaveTextContent(/^Standby Phase$/)
      expect(banner()).toHaveAttribute('data-side', 'theirs')
      act(() => vi.advanceTimersByTime(1100))
      // Su salida cuenta desde que empieza (un salto de reloj de una vez es un atraso del hilo principal).
      act(() => vi.advanceTimersByTime(250))
      expect(banner()).toBeNull()
      // La línea de tiempo salta (tocarla o arrastrarla): ni un cartel.
      fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
      const timeline = screen.getByRole('slider', { name: 'Línea de tiempo del replay' })
      fireEvent.keyDown(timeline, { key: 'ArrowRight' })
      fireEvent.keyDown(timeline, { key: 'ArrowRight' })
      expect(timeline).toHaveAttribute('aria-valuenow', '2')
      expect(banner()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('una activación sale con la carta grande al centro, tuya o del rival, al reproducir o con «Siguiente»; se va sola y saltar con la línea de tiempo no la muestra', () => {
    vi.useFakeTimers()
    const replay = buildDuelReplay({
      mode: 'link-auto',
      view: 'public',
      players: ['Ana', 'Beto'],
      starter: 0,
      mine: { initial: mine, actions: [{ type: 'activate', id: h0 }] },
      theirs: { initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5), acts: [{ action: { type: 'activate', id: 'c1' }, reveal: { c1: 'card-55144522-1' } }] },
      order: ['mine', 'theirs'],
      life: [{ at: 0, lp: [8000, 8000] }],
      nameOf: (code) => (code === 55144522 ? 'Pot of Greed' : 'Ash Blossom'),
    })
    const spotlight = () => document.querySelector('[data-kind="activate"][data-activation]')

    try {
      render(<DuelReplayScreen replay={replay} onClose={() => {}} actions={[]} />)
      // Abre en el final: nada se anuncia.
      expect(spotlight()).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      // Grande, sin cartel ni placa: el texto del paso ya está debajo y la imagen trae el nombre.
      expect(spotlight()?.querySelector('[data-stage-card]')).not.toBeNull()
      expect(spotlight()).toHaveTextContent('')
      expect(screen.getByTestId('replay-step-text')).toHaveTextContent('Ash Blossom')
      act(() => vi.advanceTimersByTime(1000))
      expect(spotlight()).toBeNull()
      // Reproduciendo, la del rival (se ve su carta, que mostró).
      fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
      act(() => vi.advanceTimersByTime(900))
      expect(spotlight()?.querySelector('[data-stage-card]')).not.toBeNull()
      expect(screen.getByTestId('replay-step-text')).toHaveTextContent('Pot of Greed')
      act(() => vi.advanceTimersByTime(1000))
      expect(spotlight()).toBeNull()
      // La línea de tiempo salta: ni una carta.
      fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Línea de tiempo del replay' }), { key: 'ArrowRight' })
      expect(spotlight()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('con la cadena guardada (duelo automático): la escena de la cadena en vez de la carta grande, eslabón por eslabón al ritmo de la mesa, y al resolver los medallones donde se activó cada uno; saltar no la muestra', () => {
    vi.useFakeTimers()
    const replay = buildDuelReplay({
      mode: 'solo-auto',
      view: 'public',
      players: ['Ana', 'Beto'],
      starter: 0,
      mine: { initial: mine, actions: [{ type: 'activate', id: h0 }] },
      theirs: { initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5), acts: [{ action: { type: 'phase', phase: 'standby' }, reveal: {} }] },
      order: ['mine', 'theirs'],
      life: [{ at: 0, lp: [8000, 8000] }],
      nameOf: (code) => (code === 55144522 ? 'Pot of Greed' : 'Ash Blossom'),
      chain: [
        { at: 1, kind: 'chain', index: 0, link: { code: 14558127, side: 0, place: [0, 8, 0] } },
        { at: 1, kind: 'chain', index: 1, link: { code: 55144522, side: 1, place: [1, 4, 2] } },
        { at: 1, kind: 'solving', index: 1 },
        { at: 1, kind: 'solved', index: 1 },
        { at: 1, kind: 'solving', index: 0 },
        { at: 1, kind: 'solved', index: 0 },
        { at: 1, kind: 'end', index: -1 },
      ],
    })
    const card = (n: number) => document.querySelector(`[data-chain-card="${n}"]`)

    try {
      render(<DuelReplayScreen replay={replay} onClose={() => {}} actions={[]} />)
      fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      // El CL1 entra solo; la carta grande de la mesa no sale.
      expect(screen.getByTestId('replay-chain')).toBeInTheDocument()
      expect(card(1)).toHaveAccessibleName(/Ash Blossom/)
      expect(card(2)).toBeNull()
      expect(document.querySelector('[data-kind="activate"][data-activation]')).toBeNull()
      act(() => vi.advanceTimersByTime(700))
      expect(card(2)).toHaveAccessibleName(/Pot of Greed/)
      // Se resuelve el CL2: los medallones, el del CL1 en la Zona de Mágicas de abajo y el del CL2 en la Zona de Monstruos de arriba.
      act(() => vi.advanceTimersByTime(700))
      expect(document.querySelector('[data-chain-medal="1"]')).not.toBeNull()
      expect(document.querySelector('[data-chain-medal="2"]')).not.toBeNull()
      act(() => vi.advanceTimersByTime(900))
      expect(document.querySelector('[data-chain-medal="2"]')).toBeNull()
      // Saltar: ni escena ni medallones.
      fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Línea de tiempo del replay' }), { key: 'ArrowRight' })
      expect(screen.queryByTestId('replay-chain')).toBeNull()
      expect(document.querySelector('[data-chain-medal]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('al avanzar un paso las cartas vuelan como en la mesa (de la mano al campo); saltar no hace volar nada', () => {
    const original = { animate: Element.prototype.animate, animations: Element.prototype.getAnimations, rect: HTMLElement.prototype.getBoundingClientRect, matchMedia: window.matchMedia }
    // La sacudida del impacto (`field-impact.ts`) busca la que ya corra.
    Element.prototype.getAnimations = () => []
    const flown: string[] = []
    // Con movimiento (el `beforeEach` lo reduce) y una mesa con medidas: la mano abajo, lo demás arriba.
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const top = this.dataset.drop === 'hand' ? 600 : 0
      return { left: 0, top, width: 80, height: 116, right: 80, bottom: top + 116, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    }
    Element.prototype.animate = function (this: Element) {
      if (this instanceof HTMLElement && this.dataset.cardId) flown.push(this.dataset.cardId)
      return { cancel: () => {}, addEventListener: () => {} } as unknown as Animation
    }

    try {
      render(<DuelReplayScreen replay={replayOf('public')} onClose={() => {}} actions={[]} />)
      fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      flown.length = 0
      // Ana invoca a Ash Blossom: la carta sale de su mano y vuela a la zona.
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect(flown.length).toBeGreaterThan(0)
      flown.length = 0
      // Saltar con la línea de tiempo: la mesa cambia, nada vuela.
      fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
      const timeline = screen.getByRole('slider', { name: 'Línea de tiempo del replay' })
      fireEvent.keyDown(timeline, { key: 'ArrowRight' })
      fireEvent.keyDown(timeline, { key: 'ArrowRight' })
      expect(timeline).toHaveAttribute('aria-valuenow', '2')
      expect(flown).toEqual([])
    } finally {
      Element.prototype.animate = original.animate
      Element.prototype.getAnimations = original.animations
      HTMLElement.prototype.getBoundingClientRect = original.rect
      window.matchMedia = original.matchMedia
    }
  })

  it('con «mi mano», la de quien grabó se ve; compartido, ofrece guardarlo', () => {
    const onSave = vi.fn()
    const replay = replayOf('mine')
    const { rerender } = render(<DuelReplayScreen replay={replay} onClose={() => {}} shared={{ onSave }} actions={[]} />)

    expect(screen.getByText('Con la mano de Ana')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Mano de Ana: .*Ash Blossom/ })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('region', { name: 'Replay compartido' })).getByRole('button', { name: 'Guardar en mis replays' }))
    expect(onSave).toHaveBeenCalled()
    // Guardado ya no es compartido, pero la franja se queda en su lugar (la mesa no salta) y lo dice.
    rerender(<Provider store={store}><DuelReplayScreen replay={replay} onClose={() => {}} actions={[]} /></Provider>)
    expect(within(screen.getByRole('region', { name: 'Replay compartido' })).getByRole('button', { name: 'Guardado' })).toBeDisabled()
  })
})

describe('Tus duelos', () => {
  const items: SavedReplay[] = [
    { id: 'a', savedAt: '2026-10-29T12:00:00Z', players: ['Ana', 'Beto'], steps: 412, result: { winner: 1, reason: 'concede' }, payload: 'zCORTO' },
    { id: 'b', savedAt: '2026-10-28T12:00:00Z', players: ['', ''], steps: 1500, view: 'mine', payload: `z${'A'.repeat(9000)}` },
  ]

  it('una fila por duelo: la abre; el enlace sólo si entra; borrar pide confirmación', () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    render(<YourDuels items={items} onOpen={onOpen} onCopyLink={() => {}} onVideo={() => {}} onDelete={onDelete} onImport={() => {}} />)

    expect(screen.getByRole('button', { name: 'Ver el replay de Ana vs Beto' })).toHaveTextContent('412 jugadas · Ganó Beto · por rendición')
    expect(screen.getByRole('button', { name: 'Ver el replay de Duelista vs Rival' })).toHaveTextContent('Sin terminar · Con tu mano')
    fireEvent.click(screen.getByRole('button', { name: 'Ver el replay de Ana vs Beto' }))
    expect(onOpen).toHaveBeenCalledWith(items[0])

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones de Duelista vs Rival' }))
    expect(screen.queryByRole('menuitem', { name: /Copiar enlace/ })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: /Borrar replay/ }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Borrar replay' }))
    expect(onDelete).toHaveBeenCalledWith(items[1])
  })

  it('vacía, dice cómo se guarda uno', () => {
    render(<YourDuels items={[]} onOpen={() => {}} onCopyLink={() => {}} onVideo={() => {}} onDelete={() => {}} onImport={() => {}} />)
    expect(screen.getByText('Todavía no guardaste duelos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir archivo' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Pegar enlace' })).toBeInTheDocument()
  })
})
