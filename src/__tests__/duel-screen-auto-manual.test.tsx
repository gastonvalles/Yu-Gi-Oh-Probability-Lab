// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setAutoPref } from '../app/auto-prefs'
import { extractRoomCode } from '../app/duel-link'
import type { DuelRole } from '../app/duel-session'
import type { DuelConnect } from '../app/use-duel'
import type { ManualGame } from '../app/auto/manual-handover'
import { createMatState, type MatAction } from '../app/practice-mat'
import type { AutoDuelScreenProps } from '../components/auto/AutoDuelScreen'
import { DuelScreen } from '../components/duel/DuelScreen'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { asSocket, createDuelHarness, handOf, mainIds, monsters, render, summonFirst } from './support/duel-screen-harness'

// Una sala con reglas automáticas que los dos pasan a manual (la pantalla automática, de mentira, avisa con `onManual` y la mesa del corte; cuándo lo hace la de verdad lo
// prueban `auto-screen-online` y el enlace, `auto-online-link`): cada uno sigue con su mesa manual, el otro la ve tal cual, las jugadas cruzan, recargar no la deja en el aire y
// la revancha vuelve a ser automática.
vi.setConfig({ testTimeout: 20_000 })

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []), fetchCardArts: vi.fn(async () => []) }))

let memory: MemoryRoom
let connect: DuelConnect

const { allowUndo, click, flush, openTable, screenProps, startDuel } = createDuelHarness(() => ({ memory, connect }))

/**
 * La partida de cada uno hasta el corte (la mesa del arranque y lo jugado en automático, como la arma `manualHandover`): Ana (empezó) va por su segundo turno, en la Main Phase 1,
 * con un monstruo, una en el cementerio y una desterrada (su última jugada); Beto terminó el suyo, con una carta colocada y una en el cementerio. Intercaladas: Ana, Ana, Beto, Beto, Ana.
 */
function cutGames(): Record<DuelRole, ManualGame> {
  const host = createMatState(mainIds, ['card-9001-1'], 5)
  const hostPlays: MatAction[] = [
    { type: 'place', id: host.hand[0]!, zone: 'mz', index: 2, pos: 'atk' },
    { type: 'move', id: host.hand[1]!, to: 'gy' },
    { type: 'move', id: host.deck[0]!, to: 'banished' },
  ]
  const guest = createMatState(mainIds, ['card-9001-1'], 6)
  const guestPlays: MatAction[] = [
    { type: 'place', id: guest.hand[0]!, zone: 'st', index: 1, pos: 'set' },
    { type: 'move', id: guest.hand[1]!, to: 'gy' },
  ]

  return {
    host: { initial: { ...host, phase: 'main1', turn: 2 }, actions: hostPlays, order: ['mine', 'mine', 'theirs', 'theirs', 'mine'], names: {} },
    guest: { initial: { ...guest, phase: 'draw', turn: 2 }, actions: guestPlays, order: ['theirs', 'theirs', 'mine', 'mine', 'theirs'], names: {} },
  }
}

let tables = cutGames()
/** Cada vez que se dibujó la pantalla automática (de mentira). */
const seen: AutoDuelScreenProps[] = []

/** La pantalla automática de mentira: la sala (se puede estar listo) hasta que se eligió quién empieza; después, la marca y un botón que pasa a manual con la partida hasta el corte. */
function FakeAutoDuel(props: AutoDuelScreenProps) {
  seen.push(props)

  return props.snapshot.opening.ordered ? (
    <div data-testid="auto-duel">
      <button type="button" onClick={() => props.onManual?.(tables[props.snapshot.role])}>
        Corte
      </button>
    </div>
  ) : (
    <>{props.room({ canReady: true, notice: null })}</>
  )
}

const autoOf = (view: RenderResult) => within(view.container).queryByTestId('auto-duel')
const pile = (view: RenderResult, owner: 'mine' | 'theirs', name: string) => view.container.querySelector(owner === 'mine' ? `[data-drop="${name}"]` : `[data-rival-drop="${name}"]`)?.getAttribute('aria-label')
const rivalCards = (view: RenderResult) => view.container.querySelectorAll('[data-rival-card-id]').length
// De quién es el turno (en la barra, con su número) y la fase (la dice el botón de las fases del campo).
const turnLine = (view: RenderResult) => {
  const phase = within(view.container).getByRole('button', { name: /^Fases: / }).getAttribute('aria-label')!.replace('Fases: ', '')

  return `${within(view.container).getByTestId('duel-turn').textContent} · ${phase}`
}

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  vi.stubGlobal('Worker', class {})
  setAutoPref('duel', true)
  localStorage.clear()
  sessionStorage.clear()
  seen.length = 0
  tables = cutGames()
  window.history.replaceState(null, '', '#duel')
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.scrollIntoView = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  setAutoPref('duel', false)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('una sala automática que pasa a manual', () => {
  it('cada uno sigue con la mesa del corte: el otro la ve tal cual, el turno y la fase siguen, no se reparte ni se roba nada y una jugada de uno llega al otro', () => {
    const { host, guest } = startDuel({ autoDuel: FakeAutoDuel, cardsById: monsters })

    openTable(host, guest)
    expect(autoOf(host)).toBeInTheDocument()
    expect(autoOf(guest)).toBeInTheDocument()

    // Beto pasa con el corte: hasta que llegue la mesa de Ana sigue la pantalla automática (el campo no salta a la sala).
    click(guest, 'Corte')
    flush()
    expect(autoOf(guest)).toBeInTheDocument()
    // Ana pasa (la de verdad, cuando le llega la mesa manual de Beto): los dos, ya en la mesa manual.
    click(host, 'Corte')
    flush()
    expect(autoOf(host)).toBeNull()
    expect(autoOf(guest)).toBeNull()

    // Ana: su mesa del corte y, enfrente, la de Beto como él la tiene.
    expect(handOf(host).getAllByRole('listitem')).toHaveLength(3)
    expect(pile(host, 'mine', 'gy')).toBe('GY: 1')
    expect(pile(host, 'mine', 'banished')).toBe('Banish: 1')
    expect(pile(host, 'theirs', 'gy')).toBe('GY: 1')
    expect(rivalCards(host)).toBe(1)
    // Beto: la suya y la de Ana.
    expect(handOf(guest).getAllByRole('listitem')).toHaveLength(4)
    expect(pile(guest, 'theirs', 'gy')).toBe('GY: 1')
    expect(pile(guest, 'theirs', 'banished')).toBe('Banish: 1')
    expect(rivalCards(guest)).toBe(1)
    // El turno 3 es de Ana (empezó), en su Main Phase 1, para los dos; sin el cartel de quién va primero.
    expect(turnLine(host)).toBe('Tu turno · 3 · Main Phase 1')
    expect(turnLine(guest)).toBe('Turno de Ana · 3 · Main Phase 1')
    expect(screen.queryByText(/Vas (primero|segundo)/)).toBeNull()

    // Ana invoca: Beto lo ve.
    summonFirst(host)
    flush()
    expect(handOf(host).getAllByRole('listitem')).toHaveLength(2)
    expect(rivalCards(guest)).toBe(2)
  })

  it('la mesa manual trae el historial del automático: Deshacer vuelve a antes del corte (primero la última de Ana, después la de Beto) y el otro lo ve', () => {
    const { host, guest } = startDuel({ autoDuel: FakeAutoDuel, cardsById: monsters })

    openTable(host, guest)
    click(guest, 'Corte')
    flush()
    click(host, 'Corte')
    flush()
    // Los pasos de la partida están: la de Ana lleva sus tres jugadas.
    expect(seen.length).toBeGreaterThan(0)
    expect(pile(host, 'mine', 'banished')).toBe('Banish: 1')

    // La última jugada de la mesa fue de Ana (desterrar): Deshacer la vuelve atrás, con el permiso de Beto, y él la ve volver.
    click(host, 'Deshacer')
    flush()
    allowUndo()
    expect(pile(host, 'mine', 'banished')).toBe('Banish: 0')
    expect(pile(guest, 'theirs', 'banished')).toBe('Banish: 0')
    // La anterior es la de Beto (al cementerio): Ana se la pide, Beto la permite y su cementerio queda vacío en los dos lados.
    click(host, 'Deshacer')
    flush()
    allowUndo()
    expect(pile(guest, 'mine', 'gy')).toBe('GY: 0')
    expect(pile(host, 'theirs', 'gy')).toBe('GY: 0')
    expect(handOf(guest).getAllByRole('listitem')).toHaveLength(5)
  })

  it('recargar la página sigue en la mesa manual (se guarda como cualquier duelo manual) y la revancha vuelve a ser automática', () => {
    const { host, guest } = startDuel({ autoDuel: FakeAutoDuel, cardsById: monsters })

    openTable(host, guest)
    click(guest, 'Corte')
    flush()
    click(host, 'Corte')
    flush()
    const room = extractRoomCode(window.location.hash)!

    // Beto recarga: vuelve a su mesa manual (no a la automática ni a la sala) y Ana sigue viendo la suya.
    guest.unmount()
    sessionStorage.setItem(`ygo-lab:duel-role:${room}`, 'guest')
    window.history.replaceState(null, '', `#duel?room=${room}`)
    seen.length = 0
    const again = render(<DuelScreen {...screenProps({ autoDuel: FakeAutoDuel, cardsById: monsters })} />)

    flush()
    flush()
    expect(seen).toHaveLength(0)
    expect(handOf(again).getAllByRole('listitem')).toHaveLength(4)
    expect(rivalCards(again)).toBe(1)
    expect(turnLine(again)).toBe('Turno de Ana · 3 · Main Phase 1')
    expect(rivalCards(host)).toBe(1)

    // Ana se rinde y los dos piden la revancha: la sala vuelve a ser automática.
    click(host, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()
    for (const view of [host, again]) fireEvent.click(within(view.container).getAllByRole('button', { name: 'Revancha' })[0]!)
    flush()
    flush()
    // Los dos, en la sala de la pantalla automática (sin mesa manual): al elegir quién empieza, otro duelo automático.
    for (const role of ['host', 'guest'] as const) expect(seen.filter((props) => props.snapshot.role === role).at(-1)!.snapshot).toMatchObject({ mine: null, theirs: null, opening: { ordered: false } })
    expect(within(host.container).queryByRole('list', { name: 'Mano' })).toBeNull()
    expect(within(again.container).queryByRole('list', { name: 'Mano' })).toBeNull()
  })
})
