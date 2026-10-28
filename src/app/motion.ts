/** Duración del reparto por carta y límite para las demás animaciones de la interfaz. */
export const UI_ANIMATION_MS = 240

/**
 * Las tres curvas del movimiento para la Web Animations API (`animate(…, { easing })`), que no resuelve `var(…)`: espejan `--ease-out`, `--ease-in-out` y
 * `--ease-snap` de `index.css` (un test lo verifica). La palabra `ease-out` de esa API es otra curva, no la del proyecto.
 */
/** Lo que entra o se queda: desacelera (también el default de las transiciones de Tailwind). */
export const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)'
/**
 * Lo que viaja de un lugar a otro de la pantalla (los vuelos de las cartas, el barajado, la espada del ataque): arranca suave y llega suave. Con `EASE_OUT` la
 * carta hacía la mitad del camino en el primer quinto del vuelo y se arrastraba el resto; con ésta (medido), la mitad cae al 40 % y el pico de velocidad baja de
 * 4 a 2,8 veces la velocidad media.
 */
export const EASE_IN_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)'
/** Lo que arranca ya en movimiento y se asienta (pops, lo que suelta un gesto, estallidos, la moneda, las medallas). */
export const EASE_SNAP = 'cubic-bezier(0.25, 1, 0.5, 1)'

/**
 * La curva de un `cubic-bezier(x1, y1, x2, y2)` como función: dado el tiempo recorrido (0 a 1), devuelve cuánto del camino va hecho, como en una transición.
 * Busca el punto de la curva cuyo `x` es ese tiempo (bisección: el `x` crece con el tiempo) y devuelve su `y`.
 */
export function bezierEase(curve: string): (time: number) => number {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = curve.match(/-?[\d.]+/g)?.map(Number) ?? []
  const at = (p1: number, p2: number, t: number) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3

  return (time) => {
    if (time <= 0) {
      return 0
    }

    if (time >= 1) {
      return 1
    }

    let low = 0
    let high = 1

    for (let step = 0; step < 30; step++) {
      const middle = (low + high) / 2

      if (at(x1, x2, middle) < time) {
        low = middle
      } else {
        high = middle
      }
    }

    return at(y1, y2, (low + high) / 2)
  }
}

/** `EASE_SNAP` en JS: el número que cuenta un anillo va con la misma curva que su arco (la transición CSS). */
export const easeSnap = bezierEase(EASE_SNAP)
/** `EASE_IN_OUT` en JS: dónde va una carta en pleno vuelo, sin medirla (la que se fue de la mesa a mitad de camino sale de ahí). */
export const easeInOut = bezierEase(EASE_IN_OUT)

/** ¿Puede una animación sumarse a otra (`composite: 'add'`)? Los giros en 3D de las cartas se suman a su `transform`; sin esto pisarían el vuelo, así que no se hacen. */
export function supportsAdditiveAnimation(): boolean {
  return typeof KeyframeEffect !== 'undefined' && 'composite' in KeyframeEffect.prototype
}

const movesTransform = (animation: Animation) => (animation.effect as KeyframeEffect | null)?.getKeyframes?.().some((frame) => 'transform' in frame) ?? false
const isTransition = (animation: Animation) => typeof CSSTransition === 'function' && animation instanceof CSSTransition

/**
 * La transición de `transform` que corre en el elemento, si hay. Una animación que la tapa (sale de su fin: `ownTransform`) la puede cancelar: dos animaciones de `transform` en un
 * elemento no van juntas en la GPU (Chromium saca a la otra: «incompatible»).
 */
export const transformTransition = (element: Element) => (element.getAnimations?.() ?? []).find((animation) => isTransition(animation) && movesTransform(animation))

/**
 * ¿Vuela? Otra animación (no su transición) ya mueve la `transform` del elemento (un vuelo entre zonas): ahí una animación nueva se suma (`composite: 'add'`), como siempre;
 * llevarle delante la base de este momento la dejaría clavada donde estaba.
 */
export function flying(element: Element): boolean {
  return (element.getAnimations?.() ?? []).some((animation) => movesTransform(animation) && !isTransition(animation))
}

/**
 * La `transform` de un elemento lista para ir delante de otras funciones en los cuadros de una animación en `replace`, que la GPU compone sola (`''` si no tiene). Si su
 * transición corre (la carta que se acuesta, la mano que se abre al robar), la de adonde va: una animación de `transform` tapa la transición (medido en Edge: también
 * sumándose con `add`), así que la carta ya se veía en su lugar.
 */
export function ownTransform(element: Element): string {
  const transition = transformTransition(element)
  const base = transition ? String((transition.effect as KeyframeEffect).getKeyframes().at(-1)?.transform ?? 'none') : getComputedStyle(element).transform

  return !base || base === 'none' ? '' : `${base} `
}

/**
 * Una animación sin relleno hacia adelante que terminó se cancela (no cambia lo que se ve): Chromium la sigue contando en el elemento y, terminada y de una
 * Web Animation (que va arriba de las transiciones), le saca a la GPU cualquier transición de `transform` que llegue después («animación incompatible»). Pasaba
 * con el reparto y el barajado: después, abrir o cerrar el abanico de la mano corría en el hilo principal.
 */
export function cancelWhenDone(animation: Animation): Animation {
  animation.addEventListener?.('finish', () => animation.cancel())
  return animation
}

/** ¿Pidió la persona reducir el movimiento? Se consulta en el momento (no se guarda). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
