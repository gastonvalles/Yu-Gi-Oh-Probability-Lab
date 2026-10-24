// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { STEP_MS } from '../components/auto/AutoSoloScreen'
import { THINKING_CANCEL_MS } from '../components/duel/DuelBar'
import { loc } from './support/auto-session-fake'
import { commits, core, dispatches, hand, handCard, inHand, lane, phaseButton, renderAuto } from './support/auto-screen-harness'

// Los estados que no son una jugada: pensando y cancelar, el rearme en un solo commit, el ritmo de a un paso, los errores, el fin y la carga.

const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [loc(100, L.HAND, 0)], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: false, to_ep: true, shuffle: false }
const DISFIELD: CoreAsk = { type: 'select_disfield', player: 0, count: 1, field_mask: 0xff_ff_ff_fe }
const ANNOUNCE: CoreAsk = { type: 'announce_card', player: 0, opcodes: ['46986414'] }

describe('auto-screen · los estados', () => {
  it('pensando: la línea lo dice, el botón de la fase se apaga y, pasado el plazo, «Cancelar» corta', () => {
    vi.useFakeTimers()
    const fake = renderAuto()

    core(() => fake.thinking())
    expect(lane()).toHaveAttribute('data-lane', 'thinking')
    expect(phaseButton()).toBeDisabled()
    expect(within(lane()!).queryByRole('button', { name: 'Cancelar' })).toBeNull()
    act(() => vi.advanceTimersByTime(THINKING_CANCEL_MS + 10))
    fireEvent.click(within(lane()!).getByRole('button', { name: 'Cancelar' }))
    expect(fake.cancels).toBe(1)
    expect(dispatches).toBe(0)
  })

  it('rearmar (deshacer): la mesa salta al final en un solo commit, sin esperar el ritmo, y la pregunta de después se contesta', () => {
    vi.useFakeTimers()
    const fake = renderAuto()

    // Dos jugadas (un paso por vez: el temporizador del siguiente se arma recién al dibujarse el anterior): el monstruo va al cementerio y se roba una carta.
    core(() => fake.events([{ type: 'move', id: 'card-200-1', to: 'gy' }, { type: 'draw', count: 1, ids: ['card-101-1'] }]))
    act(() => vi.advanceTimersByTime(STEP_MS + 5))
    act(() => vi.advanceTimersByTime(STEP_MS + 5))
    core(() => fake.ask(IDLE))
    expect(screen.queryByRole('button', { name: 'Maxx C' })).toBeNull()
    expect(inHand('Droll')).toBeInTheDocument()
    core(() => fake.undo())
    // Re-simulando no se toca la mesa: la jugada vieja sigue (aunque la sesión ya no tenga la pregunta).
    expect(inHand('Droll')).toBeInTheDocument()
    const before = commits
    // Deshacer vuelve a antes de las dos jugadas: el monstruo está de vuelta en el campo en el primer dibujo (sin pasar por el paso del medio ni animar nada).
    core(() => fake.rearm([], IDLE))

    // La pantalla rearma en un solo render (el salto del cursor se ajusta en el render, no en un efecto); el segundo commit, cuando lo hay, es la mano de la mesa reacomodándose al cambiar de cartas (como en un duelo).
    expect(commits - before).toBeLessThanOrEqual(2)
    expect(screen.getByRole('button', { name: 'Maxx C' })).toBeInTheDocument()
    expect(inHand('Droll')).toBeNull()
    expect(phaseButton()).toBeEnabled()
    expect(fake.undos).toBe(1)
  })

  it('una tanda se cuenta de a un paso (STEP_MS) y la pregunta recién se muestra al terminar; tocar la mesa salta al final', () => {
    vi.useFakeTimers()
    const fake = renderAuto()

    core(() => fake.events([{ type: 'draw', count: 1, ids: ['card-101-1'] }, { type: 'draw', count: 1, ids: ['card-102-1'] }]))
    core(() => fake.ask(IDLE))
    expect(inHand('Droll')).toBeNull()
    expect(phaseButton()).toBeDisabled()
    act(() => vi.advanceTimersByTime(STEP_MS + 5))
    expect(handCard('Droll')).toBeInTheDocument()
    expect(inHand('Imperm')).toBeNull()
    fireEvent.pointerDown(hand(), { button: 0, pointerId: 1 })
    expect(handCard('Imperm')).toBeInTheDocument()
    expect(phaseButton()).toBeEnabled()
    expect(dispatches).toBe(0)
  })

  it('lo que no tiene pantalla se contesta solo; sin respuesta segura la línea avisa y ofrece deshacer', () => {
    const fake = renderAuto()

    core(() => fake.ask(DISFIELD))
    expect(fake.answers).toEqual([{ type: 'select_disfield', places: [{ player: 0, location: L.MZONE, sequence: 0 }] }])
    core(() => fake.ask(ANNOUNCE))
    expect(fake.answers).toHaveLength(1)
    expect(lane()).toHaveTextContent('Algo falló: announce_card')
    fireEvent.click(within(lane()!).getByRole('button', { name: 'Deshacer' }))
    expect(fake.undos).toBe(1)
  })

  it('cartas sin reglas: la portada las lista y ofrece el modo manual o volver', () => {
    const onExit = vi.fn()
    const fake = renderAuto(undefined, onExit)

    core(() => fake.fault({ kind: 'rules', message: 'cards without automatic rules', cards: [700, 400] }))
    const cover = screen.getByRole('alertdialog', { name: 'A 2 cartas les faltan sus reglas' })

    expect(cover).toHaveTextContent('Blue-Eyes White Dragon')
    expect(cover).toHaveTextContent('Nibiru')
    expect(within(cover).getByRole('button', { name: 'Jugar en modo manual' })).toBeInTheDocument()
    fireEvent.click(within(cover).getByRole('button', { name: 'Volver al lobby' }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('el núcleo se cayó: «Reintentar» reinicia; un error de script no corta y va a la línea', () => {
    const fake = renderAuto()

    core(() => fake.fault({ kind: 'script', message: 'lua: oops', cards: [400] }, false))
    expect(lane()).toHaveTextContent('Falló el script de Nibiru: el duelo sigue.')
    core(() => fake.fault({ kind: 'crash', message: 'worker error', cards: [] }))
    const cover = screen.getByRole('alertdialog', { name: 'El núcleo se cayó' })

    expect(cover).toHaveTextContent('worker error')
    fireEvent.click(within(cover).getByRole('button', { name: 'Reintentar' }))
    expect(fake.restarts).toBe(1)
  })

  it('el fin: quién ganó y por qué, y «Jugar otra vez»', () => {
    const fake = renderAuto()

    core(() => fake.end(0, 1))
    const cover = screen.getByRole('alertdialog', { name: '¡Ganaste!' })

    expect(cover).toHaveTextContent('El rival no pudo robar.')
    fireEvent.click(within(cover).getByRole('button', { name: 'Jugar otra vez' }))
    expect(fake.restarts).toBe(1)
    expect(dispatches).toBe(0)
  })

  it('la carga: la portada dice cuántas reglas van y la mesa queda detrás', () => {
    const fake = renderAuto()

    core(() => fake.set({ status: 'loading', progress: { done: 3, total: 41 } }))
    expect(screen.getByRole('status', { busy: true })).toHaveTextContent('Cargando las reglas de tus cartas… 3 de 41')
    expect(hand()).toBeInTheDocument()
  })
})
