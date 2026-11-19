// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { LOCATION as L } from '../app/auto/protocol'
import type { WireAct } from '../app/mat-public'
import { replayMat } from '../app/practice-mat'
import { FLIGHT_MS } from '../app/use-card-flights'
import { fakeSession, pos } from './support/auto-session-fake'
import { core, dispatches, renderAuto } from './support/auto-screen-harness'

// La mano del rival, de dorso salvo lo que es de conocimiento público (`Adapter.publicInHand`): se ve boca arriba con un aro que late, se abre al tocarla y se pierde al barajar su mano.

const HAND = ['c2', 'c3', 'c4']

describe('auto-screen · la mano del rival', () => {
  it('lo público va boca arriba con su aro y se abre al tocarlo; lo oculto no se ve ni se filtra; al barajar vuelve de dorso', () => {
    const fake = fakeSession()

    renderAuto(fake)
    const setHand = () => core(() => fake.set({ theirs: { ...fake.getSnapshot().theirs, hand: HAND } }))
    const hand = () => screen.getByLabelText(/^Mano del rival:/)

    setHand()
    expect(hand()).toHaveAccessibleName('Mano del rival: 3')
    expect(hand().querySelector('[data-public]')).toBeNull()

    // Se mostró la del lugar 1 (c2 = Ash Blossom): boca arriba y con aro; las otras dos siguen de dorso, sin nombre en ningún lado.
    fake.publicHand.set('c2', 100)
    core(() => fake.set({}))
    expect(hand()).toHaveAccessibleName('Mano del rival: 3, a la vista: Ash Blossom')
    expect(hand().querySelectorAll('[data-public]')).toHaveLength(1)
    expect(within(hand()).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Ash Blossom'])
    expect([...hand().querySelectorAll('[title]')].map((item) => item.getAttribute('title'))).toEqual(['Ash Blossom'])
    expect(hand().textContent).not.toContain('Nibiru')

    // Tocarla abre su detalle.
    fireEvent.click(within(hand()).getByRole('button', { name: 'Ash Blossom' }))
    expect(screen.getByRole('dialog', { name: /^Detalle de / })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Barajó su mano: ya no es público.
    fake.publicHand.clear()
    core(() => fake.set({}))
    expect(hand()).toHaveAccessibleName('Mano del rival: 3')
    expect(hand().querySelector('[data-public]')).toBeNull()
    expect(within(hand()).queryAllByRole('button')).toHaveLength(0)
    expect(dispatches).toBe(0)
  })

  it('lo que un efecto te mostró (`seen`) se abre cara arriba en el visor de su lado, con la carta del efecto, aunque su mano ya se haya barajado; se cierra y no vuelve solo', () => {
    const fake = fakeSession()
    const shown: WireAct = { action: { type: 'batch', actions: [{ type: 'reveal', id: 'c3' }, { type: 'reveal', id: 'c2' }] }, reveal: {}, seen: { ids: ['c3', 'c2'], codes: [400, 100], by: 700 } }

    renderAuto(fake)
    core(() => fake.set({ theirs: { ...fake.getSnapshot().theirs, hand: HAND } }))
    expect(screen.queryByRole('heading', { name: /^Cartas reveladas/ })).toBeNull()
    // Mind Haxorz: mira su mano y la baraja en la misma tanda (su abanico queda de dorso: `publicHand` vacío).
    core(() => fake.set({ theirsActs: [shown], order: ['theirs'] }))
    act(() => void vi.runOnlyPendingTimers())
    const viewer = screen.getByRole('heading', { name: 'Cartas reveladas · 2' }).closest('section, [role="dialog"], aside') as HTMLElement

    expect(within(viewer).getByText('Blue-Eyes White Dragon')).toBeInTheDocument()
    expect(within(viewer).getAllByRole('button', { name: /Ash Blossom|Nibiru/ })).toHaveLength(2)
    expect(screen.getByLabelText(/^Mano del rival:/)).toHaveAccessibleName('Mano del rival: 3')
    // Cerrarlo lo cierra; otra tanda sin nada mostrado no lo vuelve a abrir.
    fireEvent.click(within(viewer).getByRole('button', { name: 'Cerrar' }))
    core(() => fake.set({}))
    act(() => void vi.runOnlyPendingTimers())
    expect(screen.queryByRole('heading', { name: /^Cartas reveladas/ })).toBeNull()
    // Confiscation: la pregunta que sigue elige entre su mano (la bandeja las muestra): el visor no se abre.
    core(() => {
      fake.set({ theirsActs: [shown, shown], order: ['theirs', 'theirs'] })
      fake.ask({ type: 'select_card', player: 0, can_cancel: false, min: 1, max: 1, selects: [pos(0, L.HAND, 0, 10, 1), pos(0, L.HAND, 1, 10, 1)] })
    })
    act(() => void vi.runOnlyPendingTimers())
    expect(screen.queryByRole('heading', { name: /^Cartas reveladas/ })).toBeNull()
    expect(dispatches).toBe(0)
  })

  // El toque empieza en la hoja (la X; deslizarla empieza igual, en su asa) o en su fondo (tocar afuera, por un portal): sube hasta la pantalla, pero no es «tocar la mesa».
  it.each([
    ['la X', (sheet: HTMLElement) => within(sheet).getByRole('button', { name: 'Cerrar' })],
    ['tocar afuera', (sheet: HTMLElement) => sheet.previousElementSibling as HTMLElement],
  ])('cerrar las cartas reveladas (%s) no adelanta su turno: lo que sigue se ve de a una jugada, a su ritmo (TI-321)', (_, closer) => {
    const fake = fakeSession()
    const shown: WireAct = { action: { type: 'reveal', id: 'c3' }, reveal: {}, seen: { ids: ['c3'], codes: [400], by: 700 } }
    const summon = (id: string, index: number): WireAct => ({ action: { type: 'place', id, zone: 'mz', index, pos: 'atk', how: 'normal' }, reveal: {} })
    // Las que invoca (en la mesa de mentira ya tiene `c1` en su campo).
    const field = () => [...document.querySelectorAll<HTMLElement>('[data-rival-card-id]')].filter((element) => !screen.getByLabelText(/^Mano del rival:/).contains(element)).map((element) => element.dataset.rivalCardId).filter((id) => id !== 'c1')
    const viewer = () => screen.queryByRole('heading', { name: /^Cartas reveladas/ })?.closest<HTMLElement>('[role="dialog"]') ?? null

    renderAuto(fake)
    const start = { ...fake.getSnapshot().theirs, hand: HAND }
    const acts = [shown, summon('c2', 1), summon('c4', 2)]

    core(() => fake.set({ initial: { ...fake.getSnapshot().initial, theirs: start }, theirs: start }))
    core(() => fake.set({ theirsActs: acts, order: acts.map(() => 'theirs' as const), theirs: replayMat(start, acts.map((wire) => wire.action)) }))
    for (let ms = 0; ms < 2_000 && !viewer(); ms += 50) act(() => vi.advanceTimersByTime(50))
    expect(viewer()).not.toBeNull()
    expect(field()).toEqual([])
    const close = closer(viewer()!)

    fireEvent.pointerDown(close, { button: 0, pointerId: 1 })
    fireEvent.click(close)
    expect(viewer()).toBeNull()
    expect(field()).toEqual([])
    // Cuándo llega cada una a su casilla, contado desde el cierre: de a una, con su vuelo en el medio.
    const landed = new Map<string, number>()

    for (let ms = 0; ms <= 3_000; ms += 50) {
      for (const id of field()) if (!landed.has(id!)) landed.set(id!, ms)
      act(() => vi.advanceTimersByTime(50))
    }
    expect(landed.get('c2')).toBeGreaterThan(0)
    expect(landed.get('c4')! - landed.get('c2')!).toBeGreaterThanOrEqual(FLIGHT_MS)
    expect(dispatches).toBe(0)
  })
})
