// @vitest-environment jsdom
import { act, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { comboExtrasFromAuto } from '../app/auto/auto-replay'
import type { ChainStep } from '../app/auto/chain-feed'
import { decodeComboPayload, encodeComboPayload, type SharedCombo } from '../app/combo-share'
import type { WireAct } from '../app/mat-public'
import { createMatState, type MatAction } from '../app/practice-mat'
import { createSavedCombo } from '../app/saved-combos'
import { useMatSession } from '../app/use-mat-session'
import { PracticeMat } from '../components/probability/PracticeMat'
import { render } from './support/practice-mat-harness'

// Un combo de «Jugar solo automático» contra el bot pasivo (el de `combo-rival-chain.test.ts`): invoco h0, le doy h1 (el rival lo toma en su zona 3) y activo h2, una cadena de un eslabón.
vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

const deck = Array.from({ length: 20 }, (_, i) => `card-${[14558127, 23434538, 55144522, 83764718, 73642296][i % 5]}-${Math.floor(i / 5) + 1}`)
const opening = createMatState(deck, [], 0)
const hand = deck.slice(0, 5)
const [h0, h1, h2] = hand as [string, string, string]
const mineActions: MatAction[] = [
  { type: 'draw', count: 5 },
  { type: 'phase', phase: 'main1' },
  { type: 'place', id: h0, zone: 'mz', index: 0, pos: 'atk', how: 'normal' },
  { type: 'give', id: h1, auto: true },
  { type: 'activate', id: h2 },
  { type: 'move', id: h2, to: 'gy' },
]
const theirsActs: WireAct[] = [
  { action: { type: 'draw', count: 5 }, reveal: {} },
  { action: { type: 'take', id: `f.${h1}`, zone: 'mz', index: 2, pos: 'atk' }, reveal: {} },
]
const chainSteps: ChainStep[] = [
  { kind: 'chain', at: 5, seq: 7, index: 0, link: { card: { side: 'mine', id: h2 }, code: 55144522, mine: true, place: { side: 'mine', location: 8, sequence: 1 } } },
  { kind: 'solving', at: 5, seq: 7, index: 0 },
  { kind: 'solved', at: 5, seq: 7, index: 0 },
  { kind: 'end', at: 6, seq: 8, index: -1 },
]
const snap = {
  initial: { mine: opening, theirs: createMatState(Array.from({ length: 40 }, (_, i) => `c${i + 1}`), [], 0) },
  theirsActs,
  order: ['theirs', 'mine', 'mine', 'mine', 'mine', 'theirs', 'mine', 'mine'] as const,
  chainSteps,
  names: { 55144522: 'Pot of Greed' },
}

const linked = async (withRival: boolean) => {
  const extras = withRival ? comboExtrasFromAuto({ ...snap, order: [...snap.order] }, 1, 5) : undefined
  const combo = createSavedCombo({ name: 'Kaiju y cadena', deckName: 'Prueba', initial: { ...opening, hand: [...hand] }, actions: mineActions.slice(1, 6), nameOf: (id) => `Carta ${id}`, auto: withRival, ...(extras ? { extras } : {}) }, [])
  const result = await decodeComboPayload(await encodeComboPayload(combo))
  if (!result.ok) throw new Error(result.error)
  return result.combo
}

let seekTo: (step: number) => void = () => {}

/** La mesa como la abre un enlace en un perfil limpio (sin deck), con el aviso del combo compartido. */
function Opened({ combo }: { combo: SharedCombo }) {
  const mat = useMatSession()
  const { start } = mat
  useEffect(() => start(combo.initial, combo.actions, combo.names), [start, combo])
  seekTo = mat.seek
  if (!mat.session || !mat.state) return null
  return <PracticeMat session={mat.session} state={mat.state} cardsById={new Map()} deckName="" onDispatch={mat.dispatch} onUndo={mat.undo} onSeek={mat.seek} onLoadCombo={() => {}} onNewHand={() => {}} shared={{ combo, onSaved: () => {}, onClose: () => {} }} />
}

const field = () => screen.getByLabelText('Campo')

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})
afterEach(() => vi.useRealTimers())

describe('un combo compartido con el campo del rival y la cadena, en la mesa manual', () => {
  it('dibuja el campo del rival (con la carta que le di desde la jugada en que la toma, y su mano de dorso), la escena de la cadena y su medallón', async () => {
    const combo = await linked(true)
    expect(combo.theirs).toBeDefined()
    expect(combo.chain).toBeDefined()
    render(<Opened combo={combo} />)
    vi.useFakeTimers()

    // Las áreas de los dos campos, como en el repaso del automático.
    expect(field().className).toContain('[grid-template-areas:var(--areas)]')
    act(() => seekTo(2))
    expect(document.querySelector(`[data-rival-card-id="f.${h1}"]`)).toBeNull()
    act(() => seekTo(3))
    expect(document.querySelector(`[data-rival-card-id="f.${h1}"]`)).not.toBeNull()
    expect(screen.getByRole('img', { name: /5/ })).toBeInTheDocument()

    // Un paso adelante cuenta la cadena de ese paso: la escena y, al resolver, el medallón donde se activó.
    act(() => seekTo(4))
    expect(document.querySelector('[data-chain-card]')).not.toBeNull()
    for (let i = 0; i < 10 && !document.querySelector('[data-chain-medal]'); i += 1) act(() => vi.advanceTimersByTime(500))
    expect(document.querySelector('[data-chain-medal]')).not.toBeNull()
  })

  it('uno sin rival ni cadena se ve como siempre: la mitad propia y la mascota', async () => {
    const combo = await linked(false)
    expect(combo.theirs).toBeUndefined()
    render(<Opened combo={combo} />)
    act(() => seekTo(4))

    expect(field().className).toContain("[grid-template-areas:'._p1_emz1_p2_emz2_p3_ban'_'fld_m1_m2_m3_m4_m5_gy'_'extra_s1_s2_s3_s4_s5_deck']")
    expect(document.querySelector('[data-rival-card-id]')).toBeNull()
    expect(document.querySelector('[data-chain-card]')).toBeNull()
  })
})
