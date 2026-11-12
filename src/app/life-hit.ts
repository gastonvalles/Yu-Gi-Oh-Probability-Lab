import { EASE_IN_OUT, EASE_OUT, EASE_SNAP, cancelWhenDone } from './motion'

/**
 * El golpe de unas vidas que cambian (`LifeScore`): Web Animations en `replace` que animan sólo `scale`/`translate` y `opacity`, cada movimiento en su elemento (el número se
 * infla, la capa del fogonazo se enciende, el «±N» flota) y cancelados al terminar. La sacudida de la casilla es `sacudir` (`AttackFx`), que no corre a la vez que la de un ataque.
 */

/** Las vidas que se ven rojas y laten: en esto o menos (un cuarto de las 8000), hasta 1. En 0 no: ahí manda el resultado del duelo. */
export const CRITICAL_LP = 2000

export const isCritical = (life: number) => life > 0 && life <= CRITICAL_LP

/** El golpe chico de la chapa (`LifeBadge`): el número crece a 1,08 y vuelve en 240 ms. Corre sobre el mismo elemento en cada cambio, sin volver a montarlo. */
export const BUMP_FRAMES: Keyframe[] = [{ scale: '1' }, { scale: '1.08', offset: 0.5 }, { scale: '1' }]
export const BUMP_MS = 240

/** El número se infla y vuelve (en su propio elemento, no en el que cuenta el texto). */
export const PUNCH_FRAMES: Keyframe[] = [{ scale: '1' }, { scale: '1.25', offset: 0.25 }, { scale: '0.96', offset: 0.6 }, { scale: '1' }]
/** La capa del fogonazo (rojo al bajar, verde al subir): se enciende y se apaga. */
export const FLASH_FRAMES: Keyframe[] = [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }]
/**
 * El «−N» del golpe sube hasta debajo del número y se funde contra él: no lo cruza (encima del número que cuenta, en rojo los dos, no se leía ninguno) ni llega al nombre.
 */
export const RISE_FRAMES: Keyframe[] = [
  { opacity: 0, translate: '0 14px', scale: '0.6' },
  { opacity: 1, translate: '0 0', scale: '1.15', offset: 0.2 },
  { opacity: 1, translate: '0 -2px', scale: '1', offset: 0.7 },
  { opacity: 0, translate: '0 -6px', scale: '1' },
]
/** El «+N» de una subida (y cualquier «±N» con movimiento reducido): aparece, se queda debajo del número y se funde, quieto. */
export const FADE_FRAMES: Keyframe[] = [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
/** El latido del crítico: dos golpes por ciclo de 1,1 s (lejos de los 3 destellos por segundo de WCAG 2.3.1), en la opacidad de una capa ya dibujada. */
export const CRITICAL_FRAMES: Keyframe[] = [{ opacity: 0.25 }, { opacity: 0.9, offset: 0.15 }, { opacity: 0.4, offset: 0.3 }, { opacity: 0.8, offset: 0.45 }, { opacity: 0.25 }]

/** Lo que dura el «−N» del golpe y el «+N» de una subida (lo mismo que se quedaba antes, `DELTA_MS`). */
export const RISE_MS = 1200
export const FADE_MS = 1600

export interface LifeHitParts {
  /** Lo que se infla (envuelve al número). */
  punch: HTMLElement
  /** La capa del fogonazo. */
  flash: HTMLElement
  /** El «±N». */
  floater: HTMLElement
}

/**
 * Lo que pasa cuando las vidas que se ven cambian `delta`. Al bajar: el número se infla, el fogonazo rojo y el «−N» sube; al subir: el fogonazo verde y el «+N» quieto, sin golpe.
 * Con movimiento reducido, sólo el «±N» fundido. Sin Web Animations (jsdom), nada.
 */
export function playLifeChange(parts: LifeHitParts, delta: number, reduced: boolean): Animation[] {
  if (typeof parts.floater.animate !== 'function' || delta === 0) return []
  if (reduced) return [cancelWhenDone(parts.floater.animate(FADE_FRAMES, { duration: FADE_MS, easing: EASE_OUT }))]
  if (delta > 0) {
    return [parts.flash.animate(FLASH_FRAMES, { duration: 900, easing: EASE_OUT }), parts.floater.animate(FADE_FRAMES, { duration: FADE_MS, easing: EASE_OUT })].map(cancelWhenDone)
  }

  return [
    parts.punch.animate(PUNCH_FRAMES, { duration: 440, easing: EASE_SNAP }),
    parts.flash.animate(FLASH_FRAMES, { duration: 700, easing: EASE_OUT }),
    parts.floater.animate(RISE_FRAMES, { duration: RISE_MS, easing: EASE_OUT }),
  ].map(cancelWhenDone)
}

/** El latido de la capa del crítico. No termina: se corta al salir del crítico. Null con movimiento reducido (el resplandor queda quieto) o sin Web Animations. */
export function playCritical(glow: HTMLElement, reduced: boolean): Animation | null {
  if (reduced || typeof glow.animate !== 'function') return null

  return glow.animate(CRITICAL_FRAMES, { duration: 1100, iterations: Infinity, easing: EASE_IN_OUT })
}
