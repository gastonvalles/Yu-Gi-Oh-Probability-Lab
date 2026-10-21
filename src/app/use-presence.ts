import { createContext, createElement, useCallback, useContext, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { EASE_OUT, prefersReducedMotion } from './motion'

/**
 * Lo que se cierra también sale (2026-10-21; Gastón: «animaciones y transiciones suaves y fluidas»): un menú, una hoja, un cajón o un diálogo sigue montado mientras hace
 * la inversa de su entrada y recién después se desmonta, como `CardOverlay.close`. Mientras sale es `inert` y no ataja toques (el siguiente cae en lo de abajo), y lo que
 * se ata a «abierto» (el foco, Escape, el bloqueo del scroll) ya se soltó: el foco vuelve enseguida, sin esperar la salida.
 */

/** Lo que dura una salida: lo que responde a un toque sale en 150 ms o menos. */
export const EXIT_MS = 150
/** Si la salida no avisa que terminó (la pestaña quedó atrás), se desmonta igual a su duración más este margen. */
const NET_MS = 100

/** La salida de cada entrada, por el nombre de su `@keyframes` en `index.css`: lo mismo al revés. Lo que no está acá no se anima al salir. */
const EXITS: Record<string, Keyframe> = {
  'dialog-enter': { opacity: 0, transform: 'scale(0.96)' },
  pop: { opacity: 0, transform: 'scale(0.7)' },
  'sheet-in': { opacity: 0, transform: 'translateY(10px)' },
  'sheet-up': { transform: 'translateY(100%)' },
  'side-drawer': { transform: 'translateX(100%)' },
  'nav-drawer': { transform: 'translateX(-100%)' },
  'nav-scrim': { opacity: 0 },
}

/** Sin la Web Animations API (jsdom) o con el movimiento reducido no hay salida: se desmonta enseguida, como antes (y las pruebas no cambian). */
function canExit(): boolean {
  return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function' && !prefersReducedMotion()
}

/** Abierto, `view`; al cerrarse (si hay salida), el último `view` abierto —quieto: no se vuelve a dibujar con lo que ya no está— mientras `leaving`, hasta `stop()`. */
function useKept<T>(open: boolean, view: T) {
  const [state, setState] = useState({ open, leaving: false })
  const kept = useRef(view)

  if (state.open !== open) {
    setState({ open, leaving: !open && canExit() })
  }

  useLayoutEffect(() => {
    if (open) kept.current = view
  })

  const stop = useCallback(() => setState((current) => (current.leaving ? { ...current, leaving: false } : current)), [])
  const leaving = state.leaving && !open

  return { shown: open ? view : leaving ? kept.current : null, leaving, stop }
}

/** Arranca la salida de cada raíz y de sus hijos directos (ahí van el velo y el panel) y devuelve cómo volver atrás si se abre de nuevo mientras sale. */
function startExit(roots: ReadonlyArray<HTMLElement | null | undefined>, done: () => void): () => void {
  const elements = roots.filter((root): root is HTMLElement => root instanceof HTMLElement)
  const running = elements.flatMap((root) => [root, ...Array.from(root.children)]).flatMap((element) => {
    const frame = EXITS[getComputedStyle(element).animationName]
    const animation = frame ? element.animate([frame], { duration: EXIT_MS, easing: EASE_OUT, fill: 'forwards' }) : null

    // Un `animate` de mentira (el de algunas pruebas) no trae `finished`: no cuenta como salida.
    return animation?.finished ? [animation] : []
  })

  if (running.length === 0) {
    done()
    return () => {}
  }

  const mark = (leaving: boolean) => {
    for (const element of elements) {
      element.inert = leaving
      element.style.pointerEvents = leaving ? 'none' : ''
      element.toggleAttribute('data-leaving', leaving)
    }
  }
  let over = false
  const end = () => {
    if (over) return
    over = true
    done()
  }
  const net = window.setTimeout(end, EXIT_MS + NET_MS)

  mark(true)
  void Promise.all(running.map((animation) => animation.finished)).then(end, () => {})

  return () => {
    window.clearTimeout(net)
    if (over) return
    over = true
    // Se volvió a abrir mientras salía: vuelve desde donde iba (la salida al revés), sin parpadeo y sin montar otro.
    mark(false)
    running.forEach((animation) => animation.reverse())
  }
}

/**
 * Lo que se cierra sigue montado mientras sale. `open` dice si está abierto; `view`, lo que dibuja abierto (el portal); `roots`, las raíces de ese dibujo: cada una y sus
 * hijos directos salen con la inversa de su entrada (`EXITS`, en `EXIT_MS` con `EASE_OUT`). Devuelve lo que hay que dibujar: `view`, el último `view` abierto mientras
 * sale, o `null`. Se desmonta cuando termina la salida o, como red, a su duración más un margen.
 */
export function usePresence<T>(open: boolean, view: T, roots: () => ReadonlyArray<HTMLElement | null | undefined>): T | null {
  const { shown, leaving, stop } = useKept(open, view)
  const leave = useEffectEvent(() => startExit(roots(), stop))

  useLayoutEffect(() => (leaving ? leave() : undefined), [leaving])

  return shown
}

const Leaving = createContext(false)

/** Adentro de un `Presence`: si lo que se dibuja ya se cerró y está saliendo (lo que se ata a «abierto», como el foco o Escape, se suelta). */
export function useLeaving(): boolean {
  return useContext(Leaving)
}

/**
 * Para lo que su padre monta sólo mientras está abierto (`{abierto ? <CardSheet …/> : null}`), que desde adentro no puede salir: al cerrarse conserva el último hijo
 * (con `useLeaving()` en true) hasta la duración de la salida más el margen. Si se vuelve a abrir mientras tanto, vuelve el mismo hijo (no se monta otro).
 */
export function Presence({ children }: { children?: ReactNode }) {
  const { shown, leaving, stop } = useKept(children !== null && children !== undefined && children !== false, children)

  useEffect(() => {
    if (!leaving) return
    const net = window.setTimeout(stop, EXIT_MS + NET_MS)

    return () => window.clearTimeout(net)
  }, [leaving, stop])

  return createElement(Leaving.Provider, { value: leaving }, shown)
}
