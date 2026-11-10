import { useCallback, useState, useSyncExternalStore } from 'react'

/**
 * «Instalá YGOUltraLab», la tarjeta de «Inicio»: qué caso le toca a este navegador. Hay dos caminos porque desde Chrome 108 en el celular la página se instala desde el menú sin
 * service worker, pero el aviso propio (`beforeinstallprompt`) sigue pidiendo uno con `fetch`, y hoy no hay ninguno (fuentes: el blog de Chrome sobre los criterios de
 * instalación y la guía de MDN para hacer instalable una PWA). Con el evento, un botón que abre el aviso; sin él, los pasos a mano. En iOS (Safari, Chrome y Edge desde
 * iOS 16.4) el evento no existe: siempre los pasos. Si se suma un service worker, el botón aparece solo en Chrome.
 *
 * El evento llega temprano, antes de que baje «Inicio»: lo escucha este módulo desde el arranque (`app/landing.ts` lo importa) y el hook lo lee después.
 */

export type InstallCase = 'installed' | 'prompt' | 'android' | 'ios' | 'none'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallEnv {
  standalone: boolean
  hasPrompt: boolean
  userAgent: string
  maxTouchPoints: number
  /** `(pointer: coarse)`: un celular o una tableta. */
  coarse: boolean
}

/** El caso, sin DOM: en la app instalada nada; en un navegador de escritorio, nada; con el evento, el botón; si no, los pasos de Android o de iOS. */
export function installCase({ standalone, hasPrompt, userAgent, maxTouchPoints, coarse }: InstallEnv): InstallCase {
  if (standalone) return 'installed'
  // El iPad con iPadOS se declara Mac: lo delata la pantalla táctil.
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  if (!coarse && !ios) return 'none'
  if (hasPrompt) return 'prompt'
  if (ios) return 'ios'

  return /Android/.test(userAgent) ? 'android' : 'none'
}

/** «Ahora no» la esconde 30 días: la fecha en que se tocó. */
export const INSTALL_HIDDEN_KEY = 'ygo-lab:install-hidden'
const HIDE_MS = 30 * 24 * 60 * 60 * 1000

export function isInstallHidden(stored: string | null, now: number): boolean {
  const at = stored === null ? NaN : Date.parse(stored)

  return now - at < HIDE_MS
}

let deferred: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)

  return () => listeners.delete(listener)
}
// La foto que mira React: cambia sólo cuando cambia uno de los dos.
let snapshot: { deferred: InstallPromptEvent | null; installed: boolean } = { deferred, installed }
const getSnapshot = () => (snapshot.deferred === deferred && snapshot.installed === installed ? snapshot : (snapshot = { deferred, installed }))

const matches = (query: string) => typeof window.matchMedia === 'function' && window.matchMedia(query).matches

function readHidden(): boolean {
  try {
    return isInstallHidden(window.localStorage.getItem(INSTALL_HIDDEN_KEY), Date.now())
  } catch {
    return false
  }
}

/** El caso de este navegador (`hidden` si eligió «Ahora no» hace menos de 30 días), y las dos acciones de la tarjeta. */
export function useInstallPrompt(): { kind: InstallCase | 'hidden'; install: () => Promise<void>; hide: () => void } {
  const state = useSyncExternalStore(subscribe, getSnapshot)
  const [hidden, setHidden] = useState(readHidden)
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const kind = installCase({
    standalone: state.installed || nav.standalone === true || matches('(display-mode: standalone)'),
    hasPrompt: state.deferred !== null,
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    coarse: matches('(pointer: coarse)'),
  })

  const install = useCallback(async () => {
    const event = deferred
    if (!event) return
    // El evento sirve una sola vez: si cancela, la tarjeta sigue con los pasos a mano (Chrome puede volver a mandarlo).
    deferred = null
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') installed = true
    notify()
  }, [])

  const hide = useCallback(() => {
    try {
      window.localStorage.setItem(INSTALL_HIDDEN_KEY, new Date().toISOString())
    } catch { /* sin almacenamiento, vuelve a salir la próxima vez: nada se rompe */ }
    setHidden(true)
  }, [])

  return { kind: hidden && kind !== 'installed' ? 'hidden' : kind, install, hide }
}
