// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import type { AutoOverlay } from '../app/auto/adapter'
import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { showToastMessage } from '../app/use-toast-message'
import { fakeSession, loc, stringId, type FakeSession } from './support/auto-session-fake'
import { core, dispatches, handCard, renderAuto } from './support/auto-screen-harness'
import { tap } from './support/practice-mat-harness'

// Una carta tuya sin jugadas en «Jugar solo automático»: el menú dice por qué (sólo lo que se sabe: la Invocación Normal hecha, el turno del rival; si no, que el automático no la ofrece)
// y, aparte, las restricciones del núcleo con el texto de su carta (rigen, pero pueden no ser la causa); ofrece seguir en manual y nunca despacha; las restricciones, además, en un chip.

/** Tus jugadas del turno: sólo Ash se Invoca; Called by the Grave y Zeus (del Extra) no tienen nada. */
const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [loc(100, L.HAND, 0)], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: true, to_ep: true, shuffle: false }
/** La restricción de Nibiru (su 3.er texto en la sesión de mentira: «Destroy a monster»). */
const LOCK = stringId(400, 2)

const withOverlay = (fake: FakeSession, patch: Partial<AutoOverlay>) => fake.set({ overlay: { ...fake.getSnapshot().overlay, ...patch } })

vi.mock(import('../app/use-toast-message'), async (importOriginal) => ({ ...(await importOriginal()), showToastMessage: vi.fn() }))

describe('auto-screen · una carta sin jugadas dice por qué', () => {
  it('celular: la hoja dice que el automático no la ofrece y, aparte, la restricción del núcleo con su texto y el atajo abre el modo manual; el chip muestra la restricción', () => {
    const onManual = vi.fn()
    const fake = renderAuto(fakeSession(), () => {}, onManual)

    core(() => {
      withOverlay(fake, { limits: [[LOCK], []] })
      fake.ask(IDLE)
    })
    // El chip, al lado de las fases: tocarlo muestra el texto entero.
    fireEvent.click(screen.getByRole('button', { name: '1 restricción activa' }))
    expect(screen.getByRole('region', { name: '1 restricción activa' })).toHaveTextContent('Destroy a monster')
    fireEvent.click(screen.getByRole('button', { name: '1 restricción activa' }))
    expect(screen.queryByRole('region', { name: '1 restricción activa' })).toBeNull()

    tap(handCard('Called by the Grave'))
    const sheet = screen.getByRole('region', { name: 'Called by the Grave' })

    expect(within(sheet).getByTestId('no-plays')).toHaveTextContent('Ahora no tiene jugadasEl automático no ofrece jugadas para esta carta ahora.También rige (puede no ser la causa):Destroy a monster¿No coincide con lo que esperabas?Seguir en modo manual')
    expect(within(sheet).getByRole('button', { name: 'Ver carta' })).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Seguir en modo manual' }))
    // Sin jugadas todavía no hay nada que volver atrás: pasa derecho a la mesa manual.
    expect(onManual).toHaveBeenCalledWith(null)
    expect(fake.answers).toEqual([])
    expect(dispatches).toBe(0)
  })

  it('una carta sin reglas automáticas juega igual: se avisa una vez, con su nombre, y su menú dice por qué no tiene jugadas', () => {
    const fake = renderAuto()

    vi.mocked(showToastMessage).mockClear()
    core(() => {
      fake.set({ vanilla: [900] })
      fake.ask(IDLE)
    })
    expect(showToastMessage).toHaveBeenCalledTimes(1)
    expect(showToastMessage).toHaveBeenCalledWith('1 de tus cartas no tiene reglas automáticas y se juega sin efecto: Called by the Grave.', 'warning')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    tap(handCard('Called by the Grave'))
    expect(screen.getByTestId('no-plays')).toHaveTextContent('No tiene reglas automáticas: se juega sin efecto.')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    // Las de siempre no dicen nada de eso.
    tap(handCard('Ash Blossom'))
    expect(screen.queryByTestId('no-plays')).toBeNull()
    core(() => fake.ask(IDLE))
    expect(showToastMessage).toHaveBeenCalledTimes(1)
    expect(dispatches).toBe(0)
  })

  it('la Invocación Normal ya hecha y el turno del rival; sin restricciones, no hay chip', () => {
    const fake = renderAuto()

    core(() => {
      withOverlay(fake, { normal: ['summon', null] })
      fake.ask({ ...IDLE, summons: [] })
    })
    expect(screen.queryByTestId('auto-limits')).toBeNull()
    tap(handCard('Ash Blossom'))
    expect(screen.getByTestId('no-plays')).toHaveTextContent('Ya hiciste una Invocación Normal este turno.')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    core(() => {
      withOverlay(fake, { turnPlayer: 1 })
      fake.thinking()
    })
    tap(handCard('Ash Blossom'))
    expect(screen.getByTestId('no-plays')).toHaveTextContent('Ahora no tiene jugadasEs el turno del rival.')
    expect(dispatches).toBe(0)
  })

  it('escritorio con el detalle fijo: tocar una carta del Extra sin jugadas abre su menú con la razón (antes no abría nada), sin «Ver carta»', () => {
    const media = window.matchMedia

    window.matchMedia = ((query: string) => ({ ...media(query), matches: query.includes('reduce') || query === '(min-width: 1101px)' || query === '(min-width: 1440px)' })) as typeof window.matchMedia
    const fake = renderAuto()

    core(() => {
      withOverlay(fake, { limits: [[LOCK], []] })
      fake.ask(IDLE)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: /^Zeus/ }))
    const menu = screen.getByRole('menu', { name: 'Zeus' })

    expect(within(menu).getByTestId('no-plays')).toHaveTextContent('Ahora no tiene jugadasEl automático no ofrece jugadas para esta carta ahora.También rige (puede no ser la causa):Destroy a monster')
    expect(within(menu).queryByRole('menuitem', { name: 'Ver carta' })).toBeNull()
    expect(within(menu).getByRole('button', { name: 'Seguir en modo manual' })).toBeInTheDocument()
    expect(dispatches).toBe(0)
  })
})
