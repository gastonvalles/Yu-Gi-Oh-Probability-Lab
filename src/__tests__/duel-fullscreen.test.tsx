// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setDuelFullscreen, toggleDuelFullscreen, useDuelFullscreen } from '../app/duel-fullscreen'
import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { AppShell } from '../components/shell/AppShell'

const requestFullscreen = vi.fn(async () => undefined)
const exitFullscreen = vi.fn(async () => undefined)

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
  window.matchMedia = ((query: string) => ({ matches: query.includes('1101'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.scrollTo = () => {}
  document.documentElement.requestFullscreen = requestFullscreen
  document.exitFullscreen = exitFullscreen
  Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true, writable: true })
})

afterEach(() => {
  act(() => setDuelFullscreen(false))
  cleanup()
  vi.clearAllMocks()
})

describe('el modo ventana grande del duelo', () => {
  it('se prende y se apaga, y pide la pantalla completa al navegador (y la suelta)', () => {
    const { result } = renderHook(() => useDuelFullscreen())

    expect(result.current).toBe(false)

    act(() => toggleDuelFullscreen())
    expect(result.current).toBe(true)
    expect(requestFullscreen).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true, writable: true })
    act(() => toggleDuelFullscreen())
    expect(result.current).toBe(false)
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
  })

  it('Escape (el navegador sale de la pantalla completa) lo apaga también', () => {
    const { result } = renderHook(() => useDuelFullscreen())

    act(() => setDuelFullscreen(true))
    expect(result.current).toBe(true)

    act(() => {
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true, writable: true })
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(result.current).toBe(false)
  })

  it('el armazón esconde el menú lateral mientras está prendido y lo devuelve al apagarse', () => {
    const groups = buildAppNavGroups(buildDeckWorkflowNavigationItems({ mainDeckCount: 42, roleCardCount: 40, unclassifiedCardCount: 3, hasCompletedRoleStep: false, patternCount: 0 }), { practice: true })

    render(
      <AppShell groups={groups} activeKey="practice" onSelect={() => {}} immersive>
        <p>La mesa</p>
      </AppShell>,
    )
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0)

    act(() => setDuelFullscreen(true))
    expect(screen.queryAllByRole('navigation')).toHaveLength(0)
    expect(screen.getByText('La mesa')).toBeInTheDocument()

    act(() => setDuelFullscreen(false))
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0)
  })
})
