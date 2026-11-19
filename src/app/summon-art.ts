import { useSyncExternalStore } from 'react'

import { cardImageSrc } from './card-image-source'
import type { ArrivalTone } from './field-impact'
import { EASE_IN_OUT, EASE_OUT, EASE_SNAP, cancelWhenDone } from './motion'
import { entranceAllowed, stageOf } from './summon-entrance'

/**
 * «Imagen de la carta al invocar (beta)», de Opciones del duelo (el ⚙ del automático y «La mesa» del ⋯ de la mesa manual y del duelo por enlace): la imagen de un monstruo irrumpe en grande la
 * primera vez que se invoca en el duelo. Apagada de fábrica; se recuerda en el navegador. Lo vigila `summon-art.test.tsx`.
 */
export const SUMMON_ART_KEY = 'ygo-lab:summon-art'

function read(): boolean {
  try {
    return localStorage.getItem(SUMMON_ART_KEY) === 'on'
  } catch {
    return false
  }
}

let current = read()
const listeners = new Set<() => void>()

/** Para leerla fuera de un dibujo (el efecto de la mesa que lanza la irrupción). */
export const summonArtOn = () => current

export function setSummonArt(next: boolean): void {
  if (current === next) return
  current = next
  listeners.forEach((listener) => listener())

  try {
    if (next) localStorage.setItem(SUMMON_ART_KEY, 'on')
    else localStorage.removeItem(SUMMON_ART_KEY)
  } catch {
    // Sin almacenamiento (ventana privada, cuota): vale hasta recargar.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSummonArt(): boolean {
  return useSyncExternalStore(subscribe, () => current, () => false)
}

/**
 * Qué Invocaciones la llevan (el criterio del Jefe, a corregir por Gastón): Normal, por Sacrificio y Especial, que no tienen entrada propia. Fusión, Sincronía, Xyz, Enlace y Ritual ya muestran la
 * carta grande (`playEntrance`) y el Péndulo tiene su escena; Colocar y la Invocación por Volteo no llegan acá (la mesa no las da como llegada volando).
 */
export const summonArtFits = (tone: ArrivalTone) => tone === 'special' || tone === 'tribute'

/**
 * ¿Ya irrumpió la carta que el duelo por enlace muestra grande al invocar (`rivalEffect`, un dibujo después de la llegada)? Entonces se saltea: no se suman las dos. La misma carta y no más
 * de 1,5 s entre una y otra (las dos llevan la hora en que salieron).
 */
export const burstReplaces = (effect: { kind: string; key: number; cards: readonly { id: string }[] }, burst: { id: string; at: number } | null) =>
  burst !== null && (effect.kind === 'normal' || effect.kind === 'special') && effect.cards.length === 1 && effect.cards[0]!.id === burst.id && Math.abs(effect.key - burst.at) < 1500

/**
 * Cuánto dura, de punta a punta: entra en 340 ms, se queda y sale en los últimos 150. Corre sobre el vuelo de la llegada y se va cuando la carta toca su casilla (el golpe, a ~410 ms de un vuelo
 * largo, y su anillo, que dura ~1 s, se ven): nadie la espera.
 */
export const SUMMON_ART_MS = 650
const LEAVE_MS = 150

/**
 * Las capas del prototipo («Irrupción en capas» de `/playground#sensacion`), cada una con su retraso: el fondo desde la izquierda, el arte desde la derecha (crece de ×1,2) y los cortes desde la
 * izquierda, con `ease` (la pasada); el destello aditivo, quieto, sólo cambia su opacidad. Sólo `translate`, `scale` y `opacity`.
 */
export function burstLayers([back, mid, front]: readonly [Element, Element, Element], flash: Element | null, ease: string): void {
  cancelWhenDone(back.animate([{ translate: '-30% 0' }, { translate: '0 0' }], { duration: 260, easing: ease, fill: 'backwards' }))
  cancelWhenDone(mid.animate([{ translate: '45% 0', scale: '1.2' }, { translate: '0 0', scale: '1' }], { duration: 260, delay: 40, easing: ease, fill: 'backwards' }))
  cancelWhenDone(front.animate([{ translate: '-70% 0' }, { translate: '0 0' }], { duration: 240, delay: 80, easing: ease, fill: 'backwards' }))
  if (flash) cancelWhenDone(flash.animate([{ opacity: 0, scale: '0.8' }, { opacity: 0.9, offset: 0.3 }, { opacity: 0, scale: '1.3' }], { duration: 260, delay: 60, easing: EASE_IN_OUT }))
}

/** La pasada de lo que entra entero (`--ease-out-back` de index.css, leído en el momento: la Web Animations API no resuelve `var()`). */
export const easeOutBack = () => getComputedStyle(document.documentElement).getPropertyValue('--ease-out-back').trim() || EASE_SNAP

// Las piezas del prototipo, en una franja en el medio de la pantalla. El arte es la imagen entera de la carta que la mesa ya usa: el recorte la centra en la ilustración.
const ROOT = 'pointer-events-none fixed inset-x-4 top-1/2 z-[140] mx-auto -mt-28 h-56 max-w-md overflow-hidden bg-background'
const LAYERS = `<div class="absolute -inset-8"><svg viewBox="0 0 100 60" preserveAspectRatio="none" class="block h-full w-full"><polygon points="0,0 38,0 22,60 0,60" opacity="0.35" class="fill-primary"/><polygon points="46,0 70,0 54,60 30,60" opacity="0.22" class="fill-primary"/><polygon points="78,0 100,0 100,60 62,60" opacity="0.35" class="fill-primary"/></svg></div><div class="absolute inset-x-10 inset-y-4 overflow-hidden [clip-path:polygon(16%_0,100%_0,84%_100%,0_100%)]"><img alt="" decoding="async" class="block h-full w-full object-cover object-[50%_30%]"></div><div class="absolute -inset-4"><svg viewBox="0 0 100 60" preserveAspectRatio="none" class="block h-full w-full"><line x1="4" y1="58" x2="30" y2="2" stroke-width="1.4" class="stroke-fx-energia" vector-effect="non-scaling-stroke"/><line x1="70" y1="58" x2="96" y2="2" stroke-width="1.4" class="stroke-fx-energia" vector-effect="non-scaling-stroke"/><line x1="10" y1="58" x2="36" y2="2" stroke-width="0.6" class="stroke-white" vector-effect="non-scaling-stroke"/></svg></div><div class="absolute inset-0 bg-radial from-white to-transparent to-75% opacity-0 mix-blend-plus-lighter"></div>`

/**
 * La irrupción en la mesa: la imagen `art` de la carta que se invoca entra en capas en una franja del medio y se va de costado. No tapa toques ni frena el duelo. Con «Efectos: Livianos» o
 * movimiento reducido no va (`entranceAllowed`, lo mismo que las entradas largas). Centrada en el campo (`field`, sin los paneles laterales: `stageOf`), con el mismo ancho. Devuelve la animación de
 * la franja (su final la saca), o `null` si no va.
 */
export function playSummonArt(art: string, field: Element | null = null): Animation | null {
  if (!entranceAllowed()) return null
  const root = document.createElement('div')
  root.className = ROOT
  // Corrida lo que el centro del campo se aparta del de la ventana (en el celular, nada).
  const box = stageOf(field)
  const shift = Math.round(box.left + box.width / 2 - window.innerWidth / 2)
  if (shift !== 0) Object.assign(root.style, { left: `calc(1rem + ${shift}px)`, right: `calc(1rem - ${shift}px)` })
  root.dataset.fx = 'summon-art'
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML = LAYERS
  const [back, mid, front, flash] = [...root.children]
  // La misma dirección que la casilla (`CardArt`, por el proxy): sale de la caché del navegador. Si el proxy falla, la directa, como hace la casilla.
  const image = mid!.querySelector('img')!
  image.addEventListener('error', () => (image.src = art), { once: true })
  image.src = cardImageSrc(art)
  document.body.append(root)
  burstLayers([back!, mid!, front!], flash!, easeOutBack())
  const master = root.animate(
    [
      { opacity: 0, translate: '0 0', easing: EASE_OUT },
      { opacity: 1, translate: '0 0', offset: 80 / SUMMON_ART_MS },
      { opacity: 1, translate: '0 0', offset: 1 - LEAVE_MS / SUMMON_ART_MS, easing: EASE_IN_OUT },
      { opacity: 0, translate: '3rem 0' },
    ],
    { duration: SUMMON_ART_MS },
  )
  const finish = () => root.remove()
  master.addEventListener('finish', () => {
    master.cancel()
    finish()
  })
  master.addEventListener('cancel', finish)
  return master
}
