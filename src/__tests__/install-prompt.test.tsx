// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { INSTALL_HIDDEN_KEY, installCase, isInstallHidden, type InstallEnv } from '../app/use-install-prompt'
import { InstallAppCard } from '../components/landing/InicioScreen'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const DAY = 24 * 60 * 60 * 1000

describe('installCase', () => {
  const base: InstallEnv = { standalone: false, hasPrompt: false, userAgent: ANDROID, maxTouchPoints: 5, coarse: true }

  it.each<[string, Partial<InstallEnv>, string]>([
    ['Chrome de Android sin el aviso: los pasos', {}, 'android'],
    ['con el aviso de Chrome: el botón', { hasPrompt: true }, 'prompt'],
    ['iPhone: los pasos de iOS', { userAgent: IPHONE }, 'ios'],
    ['iPadOS, que se declara Mac con pantalla táctil: los de iOS', { userAgent: IPADOS, coarse: false }, 'ios'],
    ['una Mac de verdad: nada', { userAgent: IPADOS, coarse: false, maxTouchPoints: 0 }, 'none'],
    ['escritorio con mouse, aunque Chrome mande el aviso: nada', { userAgent: DESKTOP, coarse: false, maxTouchPoints: 0, hasPrompt: true }, 'none'],
    ['ya abierta como app: nada', { standalone: true, hasPrompt: true }, 'installed'],
  ])('%s', (_, env, expected) => {
    expect(installCase({ ...base, ...env })).toBe(expected)
  })
})

describe('«Ahora no» (30 días)', () => {
  const now = Date.parse('2026-11-10T12:00:00Z')

  it('esconde 30 días desde la fecha guardada; sin fecha o ilegible, se muestra', () => {
    expect(isInstallHidden(new Date(now - 29 * DAY).toISOString(), now)).toBe(true)
    expect(isInstallHidden(new Date(now - 31 * DAY).toISOString(), now)).toBe(false)
    expect(isInstallHidden(null, now)).toBe(false)
    expect(isInstallHidden('roto', now)).toBe(false)
  })
})

describe('la tarjeta en un celular', () => {
  const setDevice = (userAgent: string, { coarse = true, standalone = false } = {}) => {
    Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true })
    window.matchMedia = ((query: string) => ({ matches: (query.includes('coarse') && coarse) || (query.includes('standalone') && standalone), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
  }
  // El hook guarda el evento a nivel del módulo (llega antes que «Inicio»): cada prueba lo importa de nuevo, sin lo de la anterior.
  const renderCard = async () => {
    vi.resetModules()
    const { useInstallPrompt } = await import('../app/use-install-prompt')
    function Probe() {
      const { kind, install, hide } = useInstallPrompt()
      return <InstallAppCard kind={kind} onInstall={install} onHide={hide} />
    }
    render(<Probe />)
  }
  const promptEvent = (outcome: 'accepted' | 'dismissed') =>
    Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(() => Promise.resolve()), userChoice: Promise.resolve({ outcome }) })

  beforeEach(() => setDevice(ANDROID))
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('Android sin el aviso: los pasos a mano; con el aviso, «Instalar la app»; si cancela, la tarjeta sigue', async () => {
    await renderCard()
    expect(screen.getByText('Tocá ⋮ y elegí «Instalar app».')).toBeInTheDocument()

    const event = promptEvent('dismissed')
    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Instalar la app' }))
    })
    expect(event.prompt).toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Instalá YGOUltraLab' })).toBeInTheDocument()
  })

  it('si acepta el aviso, se va sin recargar', async () => {
    await renderCard()
    act(() => {
      window.dispatchEvent(promptEvent('accepted'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Instalar la app' }))
    })
    expect(screen.queryByRole('region', { name: 'Instalá YGOUltraLab' })).not.toBeInTheDocument()
  })

  it('con «appinstalled» se va', async () => {
    await renderCard()
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(screen.queryByRole('region', { name: 'Instalá YGOUltraLab' })).not.toBeInTheDocument()
  })

  it('«Ahora no» la esconde y lo recuerda; pasados 30 días vuelve', async () => {
    await renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(screen.queryByRole('region', { name: 'Instalá YGOUltraLab' })).not.toBeInTheDocument()
    expect(Date.parse(localStorage.getItem(INSTALL_HIDDEN_KEY)!)).toBeGreaterThan(Date.now() - DAY)
    cleanup()

    await renderCard()
    expect(screen.queryByRole('region', { name: 'Instalá YGOUltraLab' })).not.toBeInTheDocument()
    cleanup()

    localStorage.setItem(INSTALL_HIDDEN_KEY, new Date(Date.now() - 31 * DAY).toISOString())
    await renderCard()
    expect(screen.getByRole('region', { name: 'Instalá YGOUltraLab' })).toBeInTheDocument()
  })

  it('iPhone: los pasos de iOS; escritorio y la app instalada: nada', async () => {
    setDevice(IPHONE)
    await renderCard()
    expect(screen.getByText('Tocá «Compartir» y elegí «Añadir a pantalla de inicio».')).toBeInTheDocument()
    cleanup()

    setDevice(DESKTOP, { coarse: false })
    await renderCard()
    expect(screen.queryByRole('region', { name: 'Instalá YGOUltraLab' })).not.toBeInTheDocument()
    cleanup()

    setDevice(ANDROID, { standalone: true })
    await renderCard()
    expect(screen.queryByRole('region', { name: 'Instalá YGOUltraLab' })).not.toBeInTheDocument()
  })
})
