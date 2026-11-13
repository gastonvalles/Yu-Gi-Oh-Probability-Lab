import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { HITSTOP_MS } from '../../app/card-weight'
import { ringAt, shakeField, shakeOf } from '../../app/field-impact'
import { EASE_IN_OUT, EASE_OUT, prefersReducedMotion } from '../../app/motion'
import { cx } from '../ui/cx'
import { fxVars } from './MatFx'
import { FX_RGB } from './practice-styles'

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

/**
 * El dibujo de la estela, de 30 × 18 px: dos chevrones rojos (`FX_RGB.red`, el del rayo) con borde blanco y su halo, el segundo más tenue. Va de fondo de un solo elemento: el halo se dibuja
 * una vez (sin `filter` en lo que se mueve) y la estela entera son dos nodos, mida lo que mida.
 */
const chevronAt = (x: number, alpha: number) =>
  `<path d="M${x} 1.5 L${x + 7} 9 L${x} 16.5 L${x + 4} 16.5 L${x + 11} 9 L${x + 4} 1.5 Z" fill="rgb(${FX_RGB.red})" fill-opacity="${alpha}" stroke="#fff" stroke-opacity="${alpha}" stroke-width="1.1" stroke-linejoin="round" filter="url(#g)"/>`
const CHEVRONS = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="18"><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="1.6" flood-color="rgb(${FX_RGB.red})"/></filter>${chevronAt(2, 1)}${chevronAt(17, 0.55)}</svg>`,
)}")`

/** Dónde va la estela, en px de su capa: de dónde sale (`x`, `y`), cuánto mide y hacia dónde va (radianes). */
export interface TrailGeometry {
  x: number
  y: number
  len: number
  ang: number
}

/**
 * La estela de un ataque (Gastón aprobó la referencia de Master Duel: «quién ataca a quién», a la vista mientras se apunta y mientras se responde): un renglón de chevrones rojos que avanza del atacante
 * a su objetivo, en una caja girada hacia él y con las puntas desvanecidas. Sólo se anima `translate` (`animate-chevrons`); con el movimiento reducido (o `still`), quieta. Decorativa: quién ataca
 * a quién lo dicen el cartel del rival y la pregunta.
 */
export function ChevronTrail({ x, y, len, ang, still = false }: TrailGeometry & { still?: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-fx="trail"
      className="pointer-events-none absolute -mt-[9px] h-[18px] origin-left overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_14px,#000_calc(100%-10px),transparent)]"
      style={{ left: x, top: y, width: len, transform: `rotate(${ang}rad)` }}
    >
      <span className={cx('absolute inset-y-0 -left-[30px] right-0 bg-repeat-x', still ? 'animate-none' : 'animate-chevrons motion-reduce:animate-none')} style={{ backgroundImage: CHEVRONS }} />
    </div>
  )
}

/** Dos estelas iguales (al medio píxel y a la milésima de radián): medir de nuevo no debería dibujar de nuevo. */
const sameTrail = (a: TrailGeometry | null, b: TrailGeometry | null) => a === b || (a !== null && b !== null && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.len - b.len) < 0.5 && Math.abs(a.ang - b.ang) < 0.001)

/**
 * Sale del borde del atacante (el 42 % de su alto, desde el centro) y entra un poco en la carta atacada, como la maqueta aprobada; a las vidas (un directo) llega hasta su borde, sin tapar el número.
 * Null si no queda camino.
 */
export function trailOf(strike: Strike): TrailGeometry | null {
  const own = strike.attacker.getBoundingClientRect().height
  const box = strike.target?.getBoundingClientRect()
  const start = own * 0.42
  const lives = strike.target?.hasAttribute('data-lp') && box
  // Del centro de las vidas a su borde, en la dirección de la estela.
  const edge = lives ? Math.min(box.width / 2 / Math.abs(Math.cos(strike.ang) || 1e-6), box.height / 2 / Math.abs(Math.sin(strike.ang) || 1e-6)) : 0
  const len = lives ? strike.len - start - edge : strike.len - Math.min(own, box?.height ?? own) * 0.55

  return len < 12 ? null : { x: strike.ax + Math.cos(strike.ang) * start, y: strike.ay + Math.sin(strike.ang) * start, len, ang: strike.ang }
}

/**
 * La estela entre dos cartas de la mesa (`measureStrike`), en una capa de la mesa que va sobre el campo y la mano y **debajo** de la pregunta del medio (`z-[125]`, la pregunta es `z-[130]`): nunca
 * tapa el texto de «¿Activás algo ahora?» (en el celular la pregunta tapa el campo del rival; plegada, se ve entera). Se queda mientras esté montada: se vuelve a medir cuando la mesa cambia de tamaño,
 * se desplaza la página o cambia lo que se pide (otro objetivo bajo el mouse); si el atacante o el objetivo no están, no se dibuja.
 */
export function AttackTrail({ from, to, direct, boundsRef }: Omit<StrikeSpec, 'bounds'> & { boundsRef: { readonly current: Element | null } }) {
  const [trail, setTrail] = useState<TrailGeometry | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    let frame = 0
    const measure = () => {
      const strike = measureStrike({ from, ...(to === undefined ? {} : { to }), ...(direct ? { direct } : {}), bounds: boundsRef.current })
      const found = strike && trailOf(strike)
      const origin = layerRef.current?.getBoundingClientRect()

      const next = found && origin ? { ...found, x: found.x - origin.left, y: found.y - origin.top } : found

      // Si no se movió nada (un scroll de otra cosa, un cambio de la mesa que no la corre), se queda el mismo objeto y no se vuelve a dibujar.
      setTrail((now) => (sameTrail(now, next) ? now : next))
    }
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const observer = typeof ResizeObserver === 'function' && boundsRef.current ? new ResizeObserver(later) : null

    measure()
    if (boundsRef.current) observer?.observe(boundsRef.current)
    window.addEventListener('resize', later)
    window.addEventListener('scroll', later, { capture: true, passive: true })

    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', later)
      window.removeEventListener('scroll', later, { capture: true })
    }
  }, [from, to, direct, boundsRef])

  return (
    <div ref={layerRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[125]">
      {trail ? <ChevronTrail {...trail} /> : null}
    </div>
  )
}

/** Lo que tarda la espada en llegar (el impacto empieza ahí), lo que dura la sacudida y cuándo se va todo (la onda del impacto es lo último en apagarse). */
export const IMPACT_MS = 300
const SHAKE_MS = 360
const STRIKE_MS = 1050

/** La sacudida, en px y en el plano de la casilla (una carta de costado se sacude a lo largo de su lado). */
const SHAKE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-5, 2],
  [5, -2],
  [-3, 0],
  [0, 0],
]

/** Un número de píxeles para una curva CSS, sin notación científica (un coseno de 1e-16 sale 0). */
const px = (value: number) => `${Math.round(value * 100) / 100}px`

/**
 * Un empujón como valores de `translate` en `replace` (la GPU lo compone sola; `composite: 'add'` corría en el hilo principal), sin pisar lo que el elemento ya tiene: suma
 * su `translate` (la de pasar el mouse) y, con `local`, gira el empujón con su `transform` (una carta de costado), como cuando se sumaba a esa `transform`.
 */
function nudger(target: Element, local: boolean): (x: number, y: number) => string {
  const style = getComputedStyle(target)
  const [bx = 0, by = 0] = !style.translate || style.translate === 'none' ? [] : style.translate.split(' ').map(parseFloat)
  const m = local && style.transform && style.transform !== 'none' && typeof DOMMatrixReadOnly === 'function' ? new DOMMatrixReadOnly(style.transform) : null

  return (x, y) => `${px(bx + (m ? m.a * x + m.c * y : x))} ${px(by + (m ? m.b * x + m.d * y : y))}`
}

/** El atacante embiste: se adelanta hasta `LUNGE_PX`, o el `LUNGE_SHARE` del camino si es más corto, y vuelve. Llega a la espada al impacto. */
const LUNGE_PX = 28
const LUNGE_SHARE = 0.18

/** Lo que dura el tajo de la carta atacada que sale del campo (`animate-card-split-a/b`). */
const SPLIT_MS = 520

/** Dónde estaba la carta atacada (en pantalla) y cómo se veía (`face`, una copia sin sus marcas), para partirla cuando sale del campo. */
interface Split {
  left: number
  top: number
  width: number
  height: number
  face: HTMLElement
}

/** Las marcas por las que la mesa busca sus cartas: la copia no las lleva (nadie la confunde con la de verdad). */
const CARD_MARKS = ['data-card-id', 'data-rival-card-id', 'data-lp', 'data-life-score']

/** Una copia quieta de la carta, que llena la caja de cada mitad (su giro, el de una carta del rival o de costado, se queda). */
function faceOf(card: Element): HTMLElement {
  const face = card.cloneNode(true) as HTMLElement

  for (const node of [face, ...face.querySelectorAll('*')]) for (const mark of CARD_MARKS) node.removeAttribute(mark)
  face.setAttribute('aria-hidden', 'true')
  face.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;margin:0;translate:none;transition:none;animation:none'

  return face
}

/** La carta que se fue a otra pila vuela como un fantasma (`use-card-flights`): partida, ese fantasma no se ve (la pila se pone al día cuando llega). */
function hideGhost(id: string) {
  const ghost = document.querySelector<HTMLElement>(`[data-flight-ghost="${CSS.escape(id)}"]`)

  if (typeof ghost?.animate === 'function') ghost.animate({ opacity: [0, 0] }, { duration: SPLIT_MS, fill: 'forwards' })
}

/**
 * La carta atacada que sale del campo (destruida, desterrada, devuelta: el núcleo no dice el motivo) se parte en dos donde estaba. Mira, cuadro a cuadro y sin medir nada, si su elemento sigue en la
 * página mientras dura el ataque; si se fue y no hay otro con su id, devuelve dónde estaba. Sólo una carta (no las vidas de un directo) y nunca con el movimiento reducido. No espera ni retiene nada.
 */
function useSplitOnLeave(target: Element | null, watchMs: number): Split | null {
  const [split, setSplit] = useState<Split | null>(null)

  useEffect(() => {
    const id = target?.getAttribute('data-card-id') ?? target?.getAttribute('data-rival-card-id')

    if (!target || !id || prefersReducedMotion() || typeof CSS === 'undefined' || typeof CSS.escape !== 'function') return

    const rect = target.getBoundingClientRect()
    const face = faceOf(target)
    const until = performance.now() + watchMs
    const selector = `[data-card-id="${CSS.escape(id)}"], [data-rival-card-id="${CSS.escape(id)}"]`
    let frame = 0
    const watch = (now: number) => {
      if (target.isConnected) {
        if (now < until) frame = requestAnimationFrame(watch)
        return
      }
      if (document.querySelector(selector)) return
      hideGhost(id)
      setSplit({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, face })
    }

    frame = requestAnimationFrame(watch)

    return () => cancelAnimationFrame(frame)
  }, [target, watchMs])

  return split
}

/** Quién sacude una casilla, y es el id de su animación: `strike` (un ataque) corta la sacudida de las vidas que haya; `life` (una pérdida de vidas) no se suma a la de un ataque. */
export type Sacudida = 'strike' | 'life'

/**
 * Sacude una carta o una casilla de vidas (`SHAKE`, desde donde ya está; `delay`, lo que espera). Nunca corren dos a la vez en la misma casilla:
 * un ataque corta la de las vidas que estuviera, y una pérdida de vidas no hace nada si ya la sacude un ataque. Null si no se anima (sin soporte o con movimiento reducido).
 */
export function sacudir(target: Element, quien: Sacudida, delay = 0): Animation | null {
  if (typeof target.animate !== 'function' || prefersReducedMotion()) {
    return null
  }

  const enCurso = target.getAnimations()

  if (quien === 'life' && enCurso.some((animation) => animation.id === 'strike')) {
    return null
  }

  if (quien === 'strike') {
    enCurso.filter((animation) => animation.id === 'life').forEach((animation) => animation.cancel())
  }

  const at = nudger(target, true)

  return target.animate(SHAKE.map(([x, y]) => ({ translate: at(x, y) })), { id: quien, duration: SHAKE_MS, delay, easing: EASE_OUT })
}

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
    <svg viewBox="0 0 56 22" aria-hidden="true" className="absolute -ml-7 -mt-[11px] h-[22px] w-14 animate-fx-blade overflow-visible motion-reduce:hidden">
      {/* El halo, dibujado: la misma hoja, más gorda y tenue, detrás (un `filter` sobre lo que se mueve y escala se vuelve a pintar). */}
      <path d="M23 8.2 L48.5 9.6 Q52 10.2 55 11 Q52 11.8 48.5 12.4 L23 13.8 Z" strokeWidth="7" strokeLinejoin="round" className="fill-[color:rgb(var(--fx-rgb)/0.3)] stroke-[color:rgb(var(--fx-rgb)/0.3)]" />
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

/** El ataque entero: el rayo y la espada en el atacante (que embiste) y, en el objetivo, la onda, el destello y las chispas del impacto; el objetivo se sacude y, si sale del campo, se parte en dos. */
export function AttackFx({ strike, onDone }: AttackFxProps) {
  // `onDone` cambia en cada render de quien lo muestra: se lee desde una ref para que el reloj no se reinicie con cada uno.
  const doneRef = useRef(onDone)

  useLayoutEffect(() => {
    doneRef.current = onDone
  })

  const split = useSplitOnLeave(strike.target, STRIKE_MS)
  const parted = split !== null
  const bornRef = useRef(0)

  // Se va pasado el impacto; si la carta se partió, cuando terminan sus mitades.
  useEffect(() => {
    if (!parted) bornRef.current = Date.now()
    const left = parted ? Math.max(STRIKE_MS - (Date.now() - bornRef.current), SPLIT_MS) : STRIKE_MS
    const timer = window.setTimeout(() => doneRef.current(), left)
    return () => window.clearTimeout(timer)
  }, [strike.key, parted])

  // El atacante pone el cuerpo: se adelanta hacia el objetivo y vuelve, llegando a la espada al impacto (a mitad de la animación). Va con `translate`, la propiedad
  // individual: se compone por fuera del giro de la carta, así se mueve en el plano del campo también si va de cabeza o de costado. Parte de la `translate` que ya tenga (`nudger`).
  const { attacker, len, ang } = strike

  useEffect(() => {
    if (typeof attacker.animate !== 'function' || prefersReducedMotion()) {
      return
    }

    const reach = Math.min(LUNGE_PX, len * LUNGE_SHARE)
    const at = nudger(attacker, false)
    // Al conectar, la pausa del golpe (hitstop, `HITSTOP_MS`): se queda clavado 3 cuadros y recién ahí vuelve.
    const total = 2 * IMPACT_MS + HITSTOP_MS
    const hit = at(Math.cos(ang) * reach, Math.sin(ang) * reach)
    const lunge = attacker.animate(
      [
        { translate: at(0, 0), easing: EASE_IN_OUT },
        { translate: hit, offset: IMPACT_MS / total },
        { translate: hit, offset: (IMPACT_MS + HITSTOP_MS) / total, easing: EASE_IN_OUT },
        { translate: at(0, 0) },
      ],
      { duration: total },
    )

    return () => lunge.cancel()
  }, [attacker, len, ang])

  // La sacudida del objetivo espera al impacto. Con `sacudir`, nunca corre a la vez que la sacudida de unas vidas en esa misma casilla.
  const { target } = strike

  useEffect(() => {
    const shake = target ? sacudir(target, 'strike', IMPACT_MS + HITSTOP_MS) : null

    return () => shake?.cancel()
  }, [target])

  // El impacto en la mesa (`field-impact.ts`): el anillo de energía donde conecta y, pasada la pausa del golpe, la sacudida del campo (fuerte si es directo, leve contra una carta).
  const { bx, by } = strike
  useEffect(() => {
    const direct = !target || target.hasAttribute('data-lp')

    ringAt(bx, by, IMPACT_MS)
    shakeField(attacker.closest<HTMLElement>('[data-field]'), shakeOf({ attack: direct ? 'direct' : 'card' }), IMPACT_MS + HITSTOP_MS)
  }, [attacker, target, bx, by])

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
        <span className="absolute -ml-9 -mt-9 size-[4.5rem] animate-fx-shock rounded-full border-[3px] border-[color:rgb(var(--fx-rgb))] bg-[radial-gradient(closest-side,transparent_60%,rgb(var(--fx-rgb)/0.4))] opacity-0 motion-reduce:hidden" style={delayed} />
        {SPARKS.map(([x, y]) => (
          <span
            key={`${x}:${y}`}
            // Con «Livianos», menos destellos a la vez: sin chispas.
            className="absolute -ml-2 -mt-2 size-4 animate-fx-spark bg-[radial-gradient(circle,#fff_20%,rgb(var(--fx-rgb)/0.8)_40%,transparent_70%)] opacity-0 motion-reduce:hidden fx-lite:hidden"
            style={{ ...delayed, '--dx': `${x}rem`, '--dy': `${y}rem` } as CSSProperties}
          />
        ))}
      </div>
      {/* La carta que salió del campo, partida en dos donde estaba: cada mitad se va para su lado girando y se funde. */}
      {split ? (
        <div data-fx="split" className="absolute" style={{ left: split.left, top: split.top, width: split.width, height: split.height }}>
          {(['a', 'b'] as const).map((half) => (
            <span
              key={half}
              // Cada mitad lleva su copia de la carta (la de la izquierda, la misma; la otra, otra copia): React no dibuja nada adentro.
              ref={(node) => {
                if (node && !node.firstChild) node.append(half === 'a' ? split.face : (split.face.cloneNode(true) as HTMLElement))
              }}
              className={cx('absolute inset-0 motion-reduce:hidden', half === 'a' ? 'animate-card-split-a [clip-path:inset(0_50%_0_0)]' : 'animate-card-split-b [clip-path:inset(0_0_0_50%)]')}
            />
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
