// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { lazy } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setAutoPref } from '../app/auto-prefs'
import { DEFAULT_HANDTRAP_CONFIG, writeHandtrapConfig } from '../app/handtraps'
import type { DuelConnect } from '../app/use-duel'
import type { AutoDuelScreenProps } from '../components/auto/AutoDuelScreen'
import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { DuelScreen } from '../components/duel/DuelScreen'
import { SoloScreen } from '../components/duel/SoloScreen'
import { VideoPlayer } from '../components/replays/VideoPlayer'
import { AppShell } from '../components/shell/AppShell'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { asSocket, createDuelHarness, fakeRooms, render } from './support/duel-screen-harness'
import { render as renderWithStore } from './support/practice-mat-harness'

// Sin red (`navigator.onLine` en `false` y el evento `offline`, como al perder la señal con la app ya abierta): el aviso de la app y las pantallas que la necesitan dicen qué pasa en vez de quedar vacías o romperse.
vi.setConfig({ testTimeout: 20_000 })
vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []), fetchCardArts: vi.fn(async () => []) }))

const GROUPS = buildAppNavGroups(buildDeckWorkflowNavigationItems({ mainDeckCount: 40, roleCardCount: 40, unclassifiedCardCount: 0, hasCompletedRoleStep: true, patternCount: 0 }), {})
const OFFLINE_TEXT = /^Tu deck, el Lab y la calculadora siguen andando/

function setNavigatorOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

let memory: MemoryRoom
let connect: DuelConnect
const { click, screenProps } = createDuelHarness(() => ({ memory, connect }))

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  localStorage.clear()
  sessionStorage.clear()
  setAutoPref('duel', false)
  window.history.replaceState(null, '', '#duel')
  window.scrollTo = () => {}
  HTMLElement.prototype.scrollTo = () => {}
  HTMLElement.prototype.scrollIntoView = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  act(() => setNavigatorOnline(true))
  cleanup()
  setAutoPref('duel', false)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sin conexión', () => {
  it('el aviso de la app aparece al quedarse sin red, en una región que se anuncia, y se va solo al volver la señal', () => {
    renderBare(
      <AppShell groups={GROUPS} activeKey="inicio" onSelect={() => {}}>
        <p>la pantalla</p>
      </AppShell>,
    )
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull()

    act(() => setNavigatorOnline(false))
    const notice = screen.getByText(OFFLINE_TEXT).closest('[role="status"]')
    expect(notice).toHaveAttribute('aria-live', 'polite')
    expect(within(notice as HTMLElement).getByText('Sin conexión')).toBeInTheDocument()
    // No se descarta: no tiene botones.
    expect(within(notice as HTMLElement).queryByRole('button')).toBeNull()
    expect(screen.getByText('la pantalla')).toBeInTheDocument()

    act(() => setNavigatorOnline(true))
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull()
  })

  it('en la mesa (sin la barra de la app) no aparece: la mesa no se mueve mientras se juega', () => {
    renderBare(
      <AppShell groups={GROUPS} activeKey="practice" onSelect={() => {}} immersive>
        <p>la mesa</p>
      </AppShell>,
    )
    act(() => setNavigatorOnline(false))

    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull()
  })

  it('Online sin red dice qué pasa en vez de «no hay salas» y no deja abrir una; con señal vuelve el lobby', async () => {
    act(() => setNavigatorOnline(false))
    const view = render(<DuelScreen {...screenProps({ rooms: fakeRooms() })} />)
    const lobby = within(view.container)

    expect(lobby.getByText('Online necesita señal')).toBeInTheDocument()
    expect(lobby.getByText(/^Las salas vuelven cuando haya conexión/)).toBeInTheDocument()
    expect(lobby.queryByText(/Todavía no hay salas abiertas/)).toBeNull()
    expect(lobby.queryByRole('button', { name: 'Jugar ahora' })).toBeNull()
    fireEvent.click(lobby.getByRole('button', { name: 'Jugar solo' }))
    expect(window.location.hash).toBe('#solo')

    act(() => setNavigatorOnline(true))
    await act(async () => {})
    expect(lobby.getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
  })

  it('si la pantalla del duelo automático no baja (sin señal aunque el navegador crea que hay), la sala lo dice y se puede volver; el resto de la app sigue en pie', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('Worker', class {})
    setAutoPref('duel', true)
    const failing = lazy<React.ComponentType<AutoDuelScreenProps>>(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')))
    const view = render(<DuelScreen {...screenProps({ rooms: fakeRooms(), autoDuel: failing })} />)

    click(view, 'Jugar ahora')
    await act(async () => {})

    const room = within(view.container)
    expect(room.getByRole('alert')).toHaveTextContent('No se pudo abrir el duelo automático')
    fireEvent.click(room.getByRole('button', { name: 'Volver a Online' }))
    await act(async () => {})
    expect(room.getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
  })

  it('Solo sin red apaga el modo automático y los bots con su porqué, y juega en manual', () => {
    vi.stubGlobal('Worker', class {})
    setAutoPref('duel', true)
    writeHandtrapConfig({ ...DEFAULT_HANDTRAP_CONFIG, botDeck: 'elfnote' })
    act(() => setNavigatorOnline(false))
    const onPlay = vi.fn()
    renderWithStore(<SoloScreen deckName="Mi deck" deckSize={40} minDeck={5} onOpenBuilder={() => {}} onPlay={onPlay} />)
    const list = screen.getByRole('radiogroup', { name: 'Contra quién jugás' })
    const elfnote = within(list).getByRole('radio', { name: /^Elfnote/ })

    expect(screen.getByText(/^El modo automático y los bots necesitan señal/)).toBeInTheDocument()
    expect(elfnote).toHaveAttribute('aria-disabled', 'true')
    expect(elfnote).toHaveTextContent('Necesita señal')
    fireEvent.click(screen.getByRole('button', { name: /Ficha y ajustes/ }))
    const sheet = within(screen.getByRole('dialog'))
    expect(sheet.getByRole('switch', { name: 'Automático' })).toBeDisabled()
    expect(sheet.getByText('Necesita señal para bajar el motor de reglas.')).toBeInTheDocument()
    fireEvent.click(sheet.getByRole('button', { name: 'Abrir tu mesa' }))
    expect(onPlay).toHaveBeenCalledWith('manual')
  })

  it('el video de un replay sin red lo dice en su lugar, y con señal vuelve a ofrecer reproducirlo', () => {
    act(() => setNavigatorOnline(false))
    renderBare(<VideoPlayer videoId="abc" title="Final" playLabel="Reproducir Final" thumbnail="/x.jpg" />)

    expect(screen.getByText('Sin conexión: esto vuelve cuando haya señal.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reproducir Final' })).toBeNull()

    act(() => setNavigatorOnline(true))
    expect(screen.getByRole('button', { name: 'Reproducir Final' })).toBeInTheDocument()
  })
})
