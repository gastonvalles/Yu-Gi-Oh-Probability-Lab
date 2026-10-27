// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ManualGame } from '../app/auto/manual-handover'
import { encodeAutoMessage } from '../app/auto/online-protocol'
import { setAutoPref } from '../app/auto-prefs'
import { extractRoomCode } from '../app/duel-link'
import type { DuelRole } from '../app/duel-session'
import type { DuelConnect } from '../app/use-duel'
import { createMatState, type MatAction } from '../app/practice-mat'
import type { AutoDuelScreenProps } from '../components/auto/AutoDuelScreen'
import { DuelScreen } from '../components/duel/DuelScreen'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { asSocket, createDuelHarness, hasSave, monsters, moreButton, render } from './support/duel-screen-harness'

/**
 * Una sala automática que pasó a manual y vuelve a automático desde la mesa manual (`online-resume.ts`, `ResumeAuto`): lo pide quien tiene el turno desde «Más opciones» (con
 * el cartel de lo que se reinicia), el otro lo ve en la línea de avisos y acepta o no; acordado, los dos dejan la mesa manual y vuelven a la pantalla automática (de mentira: anota
 * sus props y, como el enlace del núcleo de verdad, anuncia el acuerdo), el anfitrión con la mesa rearmada de los dos, el guardado manual se borra y recargar sigue en automático.
 */
vi.setConfig({ testTimeout: 20_000 })

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []), fetchCardArts: vi.fn(async () => []) }))

let memory: MemoryRoom
let connect: DuelConnect

const { click, flush, openTable, screenProps, startDuel } = createDuelHarness(() => ({ memory, connect }))

/** Como en `duel-screen-auto-manual`: Ana (empezó) va por su segundo turno, en la Main Phase 1, con un monstruo, una en el cementerio y una desterrada; Beto terminó el suyo, con una colocada y una en el cementerio. */
function cutGames(): Record<DuelRole, ManualGame> {
  const host = createMatState(monsterIds, ['card-9001-1'], 5)
  const hostPlays: MatAction[] = [
    { type: 'place', id: host.hand[0]!, zone: 'mz', index: 2, pos: 'atk' },
    { type: 'move', id: host.hand[1]!, to: 'gy' },
    { type: 'move', id: host.deck[0]!, to: 'banished' },
  ]
  const guest = createMatState(monsterIds, ['card-9001-1'], 6)
  const guestPlays: MatAction[] = [
    { type: 'place', id: guest.hand[0]!, zone: 'st', index: 1, pos: 'set' },
    { type: 'move', id: guest.hand[1]!, to: 'gy' },
  ]

  return {
    host: { initial: { ...host, phase: 'main1', turn: 2 }, actions: hostPlays, order: ['mine', 'mine', 'theirs', 'theirs', 'mine'], names: {} },
    guest: { initial: { ...guest, phase: 'draw', turn: 2 }, actions: guestPlays, order: ['theirs', 'theirs', 'mine', 'mine', 'theirs'], names: {} },
  }
}

const monsterIds = [...monsters.keys()].filter((id) => id !== 'card-9001-1')
let tables = cutGames()
/** Cada vez que se dibujó la pantalla automática (de mentira). */
const seen: AutoDuelScreenProps[] = []

/** La pantalla automática de mentira: la sala hasta que se eligió quién empieza; después, la marca y «Corte» (pasa a manual). Con `resume` (el anfitrión que vuelve a automático) anuncia el acuerdo, como el enlace de verdad. */
function FakeAutoDuel(props: AutoDuelScreenProps) {
  seen.push(props)
  if (props.resume && !announced.has(props.resume)) {
    announced.add(props.resume)
    props.transport.send(encodeAutoMessage({ t: 'autoResume', step: 'yes' }))
  }

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
const announced = new WeakSet<object>()

const autoOf = (view: RenderResult) => within(view.container).queryByTestId('auto-duel')
const handOf = (view: RenderResult) => within(view.container).queryByRole('list', { name: 'Mano' })
/** «Opciones del duelo» del ⋯ de la mesa manual: la hoja con la fila «Modo automático». */
const options = (view: RenderResult) => {
  fireEvent.click(moreButton(view, 'Opciones del duelo'))

  return within(screen.getByRole('dialog', { name: 'Más opciones del duelo' }))
}
const closeOptions = () => fireEvent.keyDown(document, { key: 'Escape' })

/** Ana y Beto en la mesa manual de una sala automática (los dos pasaron con el corte). */
function manualTable() {
  const { host, guest } = startDuel({ autoDuel: FakeAutoDuel, cardsById: monsters })

  openTable(host, guest)
  click(guest, 'Corte')
  flush()
  click(host, 'Corte')
  flush()
  flush()
  expect(autoOf(host)).toBeNull()
  expect(autoOf(guest)).toBeNull()
  seen.length = 0

  return { host, guest }
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

describe('una sala automática que pasó a manual y vuelve a automático', () => {
  it('lo pide quien tiene el turno desde «Más opciones» (el otro lo ve apagado con el motivo), el otro acepta en la línea y los dos vuelven a la pantalla automática: el anfitrión con las dos mesas, sin guardado manual', () => {
    const { host, guest } = manualTable()

    // Es el turno de Ana (Main Phase 1): a Beto la fila le dice por qué no.
    const theirs = options(guest)

    expect(theirs.getByRole('button', { name: 'Seguir en automático' })).toBeDisabled()
    expect(theirs.getByText('sólo en tu turno, en tu Main Phase 1 o 2.')).toBeInTheDocument()
    closeOptions()
    // Ana pide: el cartel dice qué se reinicia y que Beto tiene que aceptar; «Cancelar» no manda nada.
    const mine = options(host)

    expect(mine.getByRole('button', { name: 'Seguir en automático' })).toBeEnabled()
    fireEvent.click(mine.getByRole('button', { name: 'Seguir en automático' }))
    const dialog = screen.getByRole('alertdialog')

    expect(dialog).toHaveTextContent('Beto tiene que aceptar')
    expect(dialog).toHaveTextContent('el turno vuelve a empezar')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    flush()
    expect(within(guest.container).queryByText(/quiere seguir en automático/)).toBeNull()
    fireEvent.click(mine.getByRole('button', { name: 'Seguir en automático' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Pedir pasar a automático' }))
    flush()
    // Ana espera (con «Cancelar pedido» en la fila) y Beto ve el pedido en la línea, con sus dos botones.
    expect(mine.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument()
    closeOptions()
    expect(within(guest.container).getByText(/Ana quiere seguir en automático/)).toBeInTheDocument()
    expect(within(guest.container).getByRole('button', { name: 'Seguir en manual' })).toBeInTheDocument()
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Pasar a automático' }))
    flush()
    flush()
    // Ana acordó y dejó la mesa manual: la pantalla automática, con la mesa rearmada de los dos (Ana en el asiento 0: tiene el turno); Beto pasa con el anuncio.
    expect(autoOf(host)).toBeInTheDocument()
    expect(handOf(host)).toBeNull()
    const start = seen.find((props) => props.snapshot.role === 'host')?.resume

    expect(start).toMatchObject({ seat: 0, setup: { lp: [8000, 8000], phase: 'main1', turns: [2, 2] } })
    expect(start!.setup.cards.filter((card) => card.controller === 0)).toHaveLength(41)
    expect(start!.setup.cards.filter((card) => card.controller === 1)).toHaveLength(41)
    expect(start!.setup.cards.every((card) => card.code > 0)).toBe(true)
    expect(autoOf(guest)).toBeInTheDocument()
    expect(handOf(guest)).toBeNull()
    expect(seen.find((props) => props.snapshot.role === 'guest')?.resume).toBeUndefined()
    // El guardado manual de los dos se fue.
    expect(hasSave('host')).toBe(false)
    expect(hasSave('guest')).toBe(false)
  })

  it('rechazar lo deja a mano; y el que recarga después del pase sigue en automático (sin mesa manual)', () => {
    const { host, guest } = manualTable()
    const mine = options(host)

    fireEvent.click(mine.getByRole('button', { name: 'Seguir en automático' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Pedir pasar a automático' }))
    flush()
    closeOptions()
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Seguir en manual' }))
    flush()
    expect(autoOf(host)).toBeNull()
    expect(autoOf(guest)).toBeNull()
    expect(handOf(host)).toBeInTheDocument()
    expect(within(guest.container).queryByText(/quiere seguir en automático/)).toBeNull()
    expect(options(host).getByRole('button', { name: 'Seguir en automático' })).toBeEnabled()
    closeOptions()

    // Ahora sí: y Beto recarga después del pase.
    fireEvent.click(options(host).getByRole('button', { name: 'Seguir en automático' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Pedir pasar a automático' }))
    flush()
    closeOptions()
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Pasar a automático' }))
    flush()
    flush()
    expect(autoOf(guest)).toBeInTheDocument()
    const room = extractRoomCode(window.location.hash)!

    guest.unmount()
    sessionStorage.setItem(`ygo-lab:duel-role:${room}`, 'guest')
    window.history.replaceState(null, '', `#duel?room=${room}`)
    seen.length = 0
    const again = render(<DuelScreen {...screenProps({ autoDuel: FakeAutoDuel, cardsById: monsters })} />)

    flush()
    flush()
    expect(autoOf(again)).toBeInTheDocument()
    expect(handOf(again)).toBeNull()
    expect(seen.at(-1)!.snapshot).toMatchObject({ role: 'guest', mine: null, opening: { ordered: true } })
  })
})
