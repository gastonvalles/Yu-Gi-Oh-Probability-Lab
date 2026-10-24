// Lo que comparten las pruebas de pantalla del duelo automático (`auto-screen-*.test.tsx`): monta `AutoSoloScreen` con la sesión de mentira y cuenta los commits y los despachos (el centinela).
import { act, screen, within } from '@testing-library/react'
import { Profiler, type ReactElement } from 'react'
import { afterEach, beforeEach, vi, type MockInstance } from 'vitest'

import { AutoSoloScreen } from '../../components/auto/AutoSoloScreen'
import { CARDS, fakeSession, type FakeSession } from './auto-session-fake'
import { render } from './practice-mat-harness'

vi.mock('../../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

export let commits = 0
export let dispatches = 0
let errors: MockInstance | null = null

beforeEach(() => {
  commits = 0
  dispatches = 0
  localStorage.clear()
  window.scrollTo = () => {}
  HTMLElement.prototype.setPointerCapture = () => {}
  // Con el movimiento reducido la mano se reparte de una (sin esperar a los temporizadores, que acá son de mentira: `setTimeout` se avanza a mano).
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
  document.elementFromPoint = () => null
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  // El centinela de la mesa anota en la consola: cada despacho es un bug.
  errors = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[auto]')) dispatches += 1
  })
})

afterEach(() => {
  errors?.mockRestore()
  vi.useRealTimers()
})

export function renderAuto(fake: FakeSession = fakeSession(), onExit = () => {}): FakeSession {
  const ui: ReactElement = (
    <Profiler id="auto" onRender={() => { commits += 1 }}>
      <AutoSoloScreen mainIds={[...CARDS.keys()].filter((id) => id !== 'card-500-1')} extraIds={['card-500-1']} cardsById={CARDS} deckName="Test" onExit={onExit} connect={() => fake} />
    </Profiler>
  )

  render(ui)

  return fake
}

/** Lo que haría el núcleo, dentro de `act`. */
export const core = (run: () => void) => act(run)

export const hand = () => screen.getByRole('list', { name: 'Mano' })
export const handCard = (name: string) => within(hand()).getByRole('listitem', { name })
export const inHand = (name: string) => within(hand()).queryByRole('listitem', { name })
export const status = () => screen.getByRole('status', { name: 'Paso actual' })
export const phaseButton = () => screen.getByRole('button', { name: /^Fases:/ })
export const lane = () => document.querySelector<HTMLElement>('[data-lane]')
