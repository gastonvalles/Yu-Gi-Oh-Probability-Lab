import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { EASE_IN_OUT, EASE_OUT, prefersReducedMotion, supportsAdditiveAnimation } from '../../app/motion'
import { fxVars } from './MatFx'

/**
 * El ataque en la mesa: una espada y un rayo rojo cruzan del monstruo que ataca a su objetivo (una carta o la barra de vida) y, al llegar, estalla el
 * impacto y el objetivo se sacude. Es decorativo (`aria-hidden`; lo que pasó lo dicen la barra de pasos y el cartel del rival) y se apaga con
 * `prefers-reduced-motion`. Se mide en pantalla (los dos extremos cambian con el tamaño de la mesa) y se dibuja en un portal, encima de todo.
 */

/** Dónde empieza y dónde termina un ataque, en pantalla: del centro del atacante al del objetivo. */
export interface Strike {
  key: number
  ax: number
  ay: number
  bx: number
  by: number
  /** Distancia entre los dos puntos (lo que viaja la espada) y ángulo del rayo, en radianes. */
  len: number
  ang: number
  /** Lo que ataca (su carta): pone el cuerpo, se adelanta hacia el objetivo y vuelve. */
  attacker: Element
  /** Lo que se sacude al impactar (la carta atacada o la casilla de vida); null si no hay un elemento. */
  target: Element | null
}

export interface StrikeSpec {
  /** Selectores CSS del atacante y, si ataca a una carta, de su objetivo; sin `to` el ataque es directo. */
  from: string
  to?: string
  /** A cuál de las dos barras de vida va un ataque directo (la del rival si ataca el jugador, la propia si ataca el rival). */
  direct?: 'theirs' | 'mine'
  /** La mesa: de ahí salen las cosas que se buscan (así dos mesas en una misma página no se cruzan) y, sin barra de vida (la práctica, sin rival), su borde es adonde llega el directo. */
  bounds?: Element | null
}

/** Primer elemento que cumple el selector, o null: los ids de las cartas del rival llegan por la red y pueden no ser un selector válido. */
function find(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector)
  } catch {
    return null
  }
}

const centerOf = (element: Element) => {
  const rect = element.getBoundingClientRect()

  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/** Mide un ataque; null si el atacante (o la carta atacada) no está en pantalla: no hay de dónde ni hacia dónde. */
export function measureStrike({ from, to, direct = 'theirs', bounds }: StrikeSpec): Strike | null {
  const root = bounds ?? document
  const attacker = find(root, from)

  if (!attacker) {
    return null
  }

  const a = centerOf(attacker)
  let target: Element | null
  let b: { x: number; y: number }

  if (to !== undefined) {
    target = find(root, to)

    if (!target) {
      return null
    }

    b = centerOf(target)
  } else {
    target = find(root, `[data-lp="${direct}"]`)

    if (target) {
      b = centerOf(target)
    } else {
      // Sin barra de vida (la práctica): el directo termina en el borde de la mesa, en línea recta con el atacante.
      const edge = (bounds ?? document.documentElement).getBoundingClientRect()
      b = { x: a.x, y: direct === 'theirs' ? edge.top : edge.bottom }
    }
  }

  return { key: Date.now(), ax: a.x, ay: a.y, bx: b.x, by: b.y, len: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), attacker, target }
}

/** Lo que tarda la espada en llegar (el impacto empieza ahí), lo que dura la sacudida y cuándo se va todo (la onda del impacto es lo último en apagarse). */
export const IMPACT_MS = 300
const SHAKE_MS = 360
const STRIKE_MS = 1050

const SHAKE_FRAMES = [
  { transform: 'translate(0, 0)' },
  { transform: 'translate(-5px, 2px)' },
  { transform: 'translate(5px, -2px)' },
  { transform: 'translate(-3px, 0)' },
  { transform: 'translate(0, 0)' },
]

/** El atacante pone el cuerpo: se adelanta hasta `LUNGE_PX`, o el `LUNGE_SHARE` del camino si es más corto, y vuelve. Llega a la espada al impacto. */
const LUNGE_PX = 18
const LUNGE_SHARE = 0.12

/** Quién sacude una casilla, y es el id de su animación: `strike` (un ataque) corta la sacudida de las vidas que haya; `life` (una pérdida de vidas) no se suma a la de un ataque. */
export type Sacudida = 'strike' | 'life'

/**
 * Sacude una carta o una casilla de vidas (`SHAKE_FRAMES`, sumada a lo que ya tenga; `delay`, lo que espera). Nunca corren dos a la vez en la misma casilla:
 * un ataque corta la de las vidas que estuviera, y una pérdida de vidas no hace nada si ya la sacude un ataque. Null si no se anima (sin soporte o con movimiento reducido).
 */
export function sacudir(target: Element, quien: Sacudida, delay = 0): Animation | null {
  if (!supportsAdditiveAnimation() || prefersReducedMotion()) {
    return null
  }

  const enCurso = target.getAnimations()

  if (quien === 'life' && enCurso.some((animation) => animation.id === 'strike')) {
    return null
  }

  if (quien === 'strike') {
    enCurso.filter((animation) => animation.id === 'life').forEach((animation) => animation.cancel())
  }

  return target.animate(SHAKE_FRAMES, { id: quien, duration: SHAKE_MS, delay, easing: EASE_OUT, composite: 'add' })
}

/** Un número de píxeles para una curva CSS, sin notación científica (un coseno de 1e-16 sale 0). */
const px = (value: number) => `${Math.round(value * 100) / 100}px`

/** Adónde salen las chispas del impacto (en rem, desde el centro del objetivo). */
const SPARKS = [
  [3.2, -1.1],
  [1.3, -3.1],
  [-2.2, -2.6],
  [-3.3, 0.7],
  [-1.2, 3.1],
  [2.6, 2.4],
] as const

const delayed: CSSProperties = { animationDelay: `${IMPACT_MS}ms` }

/** La espada mirando a la derecha (+x): hoja blanca con filo rojo, guarda y empuñadura. Mide 56 × 22. */
function Blade() {
  return (
    <svg viewBox="0 0 56 22" aria-hidden="true" className="absolute -ml-7 -mt-[11px] h-[22px] w-14 animate-fx-blade overflow-visible drop-shadow-[0_0_6px_rgb(var(--fx-rgb))] motion-reduce:hidden">
      <path d="M23 8.2 L48.5 9.6 Q52 10.2 55 11 Q52 11.8 48.5 12.4 L23 13.8 Z" strokeWidth="1" strokeLinejoin="round" className="fill-white stroke-[color:rgb(var(--fx-rgb))]" />
      <path d="M26 11 H47" strokeWidth="0.8" className="stroke-[color:rgb(var(--fx-rgb)/0.55)]" />
      <rect x="19" y="3" width="4.2" height="16" rx="2" strokeWidth="0.8" className="fill-[color:rgb(var(--fx-rgb))] stroke-white" />
      <rect x="8.5" y="9.4" width="10.6" height="3.2" rx="1.4" strokeWidth="0.6" className="fill-[color:rgb(var(--fx-rgb)/0.55)] stroke-white" />
      <circle cx="6" cy="11" r="3.4" strokeWidth="0.8" className="fill-[color:rgb(var(--fx-rgb))] stroke-white" />
    </svg>
  )
}

interface AttackFxProps {
  strike: Strike
  /** Cuando termina (se desmonta solo): quien lo muestra lo saca. */
  onDone: () => void
}

/** El ataque entero: el rayo y la espada en el atacante y, en el objetivo, la onda, el destello y las chispas del impacto; el objetivo se sacude. */
export function AttackFx({ strike, onDone }: AttackFxProps) {
  // `onDone` cambia en cada render de quien lo muestra: se lee desde una ref para que el reloj no se reinicie con cada uno.
  const doneRef = useRef(onDone)

  useLayoutEffect(() => {
    doneRef.current = onDone
  })

  useEffect(() => {
    const timer = window.setTimeout(() => doneRef.current(), STRIKE_MS)
    return () => window.clearTimeout(timer)
  }, [strike.key])

  // El atacante pone el cuerpo: se adelanta hacia el objetivo y vuelve, llegando a la espada al impacto (a mitad de la animación). Va con `translate`, la propiedad
  // individual: se compone por fuera del giro de la carta, así se mueve en el plano del campo también si va de cabeza o de costado. Se suma (`composite: 'add'`) a lo que ya tenga.
  const { attacker, len, ang } = strike

  useEffect(() => {
    if (!supportsAdditiveAnimation() || prefersReducedMotion()) {
      return
    }

    const reach = Math.min(LUNGE_PX, len * LUNGE_SHARE)
    const lunge = attacker.animate(
      [
        { translate: '0px 0px', easing: EASE_IN_OUT },
        { translate: `${px(Math.cos(ang) * reach)} ${px(Math.sin(ang) * reach)}`, offset: 0.5, easing: EASE_IN_OUT },
        { translate: '0px 0px' },
      ],
      { duration: 2 * IMPACT_MS, composite: 'add' },
    )

    return () => lunge.cancel()
  }, [attacker, len, ang])

  // La sacudida del objetivo espera al impacto. Con `sacudir`, nunca corre a la vez que la sacudida de unas vidas en esa misma casilla.
  const { target } = strike

  useEffect(() => {
    const shake = target ? sacudir(target, 'strike', IMPACT_MS) : null

    return () => shake?.cancel()
  }, [target])

  return createPortal(
    <div aria-hidden="true" data-fx="strike" className="pointer-events-none fixed inset-0 z-[150]" style={fxVars('red')}>
      {/* Del atacante al objetivo: el grupo gira hacia el objetivo y lo que lleva adentro va derecho por su eje. */}
      <div className="absolute size-0" style={{ left: strike.ax, top: strike.ay, transform: `rotate(${strike.ang}rad)`, '--len': `${strike.len}px` } as CSSProperties}>
        <span className="absolute left-0 top-0 -mt-[3px] h-1.5 w-[var(--len)] origin-left animate-fx-beam rounded-full bg-[linear-gradient(90deg,transparent,rgb(var(--fx-rgb)/0.9)_70%,#fff)] shadow-[0_0_12px_3px_rgb(var(--fx-rgb)/0.75)] motion-reduce:hidden" />
        <Blade />
      </div>
      {/* El impacto: un destello, una onda que se expande y chispas, cuando la espada llega. */}
      <div className="absolute size-0" style={{ left: strike.bx, top: strike.by }}>
        <span className="absolute -ml-10 -mt-10 size-20 animate-fx-flash rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.95),rgb(var(--fx-rgb)/0.75)_35%,transparent_72%)] opacity-0 motion-reduce:hidden" style={delayed} />
        <span className="absolute -ml-9 -mt-9 size-[4.5rem] animate-fx-shock rounded-full border-[3px] border-[color:rgb(var(--fx-rgb))] opacity-0 shadow-[0_0_14px_rgb(var(--fx-rgb)/0.8)] motion-reduce:hidden" style={delayed} />
        {SPARKS.map(([x, y]) => (
          <span
            key={`${x}:${y}`}
            className="absolute -ml-[3px] -mt-[3px] size-1.5 animate-fx-spark bg-white opacity-0 shadow-[0_0_6px_2px_rgb(var(--fx-rgb))] motion-reduce:hidden"
            style={{ ...delayed, '--dx': `${x}rem`, '--dy': `${y}rem` } as CSSProperties}
          />
        ))}
      </div>
    </div>,
    document.body,
  )
}
