import { playMascotSocial, type MascotId } from './mascot'

/**
 * Lo que pasa entre las mascotas que están afuera: cada una avisa dónde está (`reportMascotBody`) y, con eso:
 * - Si dos se juntan (quedan a menos de `NEAR_AIR` de aire), se saludan: la primera saluda y la otra le contesta un instante después.
 *   Se saludan una vez por encuentro: hasta que no se separan de nuevo no vuelven a hacerlo; y si una se está arrastrando, esperan a que la suelten.
 * - Si una que se arrastra toca a otra (la empuja, ver `use-draggable-position`), a la empujada no le gusta.
 * Todo se muestra con las animaciones que ya tienen (saludar, frustrarse): sólo si están en reposo (ver `playMascotSocial`).
 */
export interface MascotBody {
  x: number
  y: number
  /** El lado del cuadro (es cuadrado, como en `fab-position`). */
  size: number
  dragging: boolean
}

/** Aire entre los bordes de dos mascotas para que se vean y se saluden. */
export const NEAR_AIR = 48
/** Aire por debajo del cual se están tocando (el empujón deja `GROUP_GAP` = 8 px). */
const TOUCH_AIR = 14
/** Cuánto después de la primera saluda la otra (contestándole). */
export const REPLY_DELAY_MS = 650
const GREET_MS = 2400
const BUMP_MS = 1500
/** Una misma mascota no se enoja más seguido que esto aunque la sigan empujando. */
const BUMP_COOLDOWN_MS = 3000

const bodies = new Map<MascotId, MascotBody>()
/** Los pares que están cerca y ya se saludaron en este encuentro (clave: `a|b` en orden alfabético). */
const met = new Map<string, boolean>()
const lastBump = new Map<MascotId, number>()

const pairKey = (a: MascotId, b: MascotId) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Aire entre los bordes de dos cuerpos redondos (negativo si se pisan). */
export function airBetween(a: MascotBody, b: MascotBody): number {
  return Math.hypot(a.x + a.size / 2 - (b.x + b.size / 2), a.y + a.size / 2 - (b.y + b.size / 2)) - (a.size + b.size) / 2
}

/** Dónde está una mascota ahora; con eso se ve si se juntó con otra, o si la tocó mientras se arrastraba. */
export function reportMascotBody(id: MascotId, body: MascotBody, now = Date.now()): void {
  const first = !bodies.has(id)

  bodies.set(id, body)

  for (const [otherId, other] of bodies) {
    if (otherId === id) {
      continue
    }

    const key = pairKey(id, otherId)
    const air = airBetween(body, other)

    if (air >= NEAR_AIR) {
      met.delete(key)
    } else if (!met.has(key)) {
      // Si ya estaban juntas cuando aparecieron (una pantalla recién abierta), no se saludan: ya se conocen.
      met.set(key, first)
    }

    // Para saludarse no puede haber una arrastrándose: el saludo se hace al soltarla.
    if (air < NEAR_AIR && met.get(key) === false && !body.dragging && !other.dragging) {
      met.set(key, true)
      playMascotSocial(id, 'waving', GREET_MS)
      setTimeout(() => playMascotSocial(otherId, 'waving', GREET_MS), REPLY_DELAY_MS)
    }

    // Choque: la que se arrastra toca a la otra (la empujada es la que no se arrastra).
    const pushed = body.dragging && !other.dragging ? otherId : other.dragging && !body.dragging ? id : null

    if (pushed && air < TOUCH_AIR && now - (lastBump.get(pushed) ?? -Infinity) >= BUMP_COOLDOWN_MS) {
      lastBump.set(pushed, now)
      playMascotSocial(pushed, 'failed', BUMP_MS)
    }
  }
}

/** La mascota se fue a descansar: ya no cuenta para nada. */
export function forgetMascotBody(id: MascotId): void {
  bodies.delete(id)
  lastBump.delete(id)

  for (const key of [...met.keys()]) {
    if (key.split('|').includes(id)) {
      met.delete(key)
    }
  }
}

/** Para los tests: nadie está en ningún lado. */
export function resetMascotInterplayForTests(): void {
  bodies.clear()
  met.clear()
  lastBump.clear()
}
