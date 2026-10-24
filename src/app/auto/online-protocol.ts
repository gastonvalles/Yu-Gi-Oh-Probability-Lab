import type { AutoEvent, CoreAnswer, Seat } from './protocol'

/**
 * El duelo automático por enlace (diseño: `docs/duelos-automaticos.md`, «Duelo online»): los mensajes de texto que el anfitrión (que corre el núcleo con los dos asientos) y el
 * invitado (que no lo corre) se mandan por el mismo relay, al lado del protocolo manual de `duel-protocol.ts`, que los ignora (`parseMessage` da `null` con un `t` que no conoce).
 * Es puro: tipos, límites, validación (`parseAutoMessage`), troceo de lo que no entra en un mensaje y el marcapasos del que manda. El relay no cambia: reenvía texto, con tope de
 * 16 KB por mensaje y 30 por segundo (ráfaga de 60).
 *
 * ESQUELETO: los tipos y las constantes ya son los definitivos (los usan en paralelo los paquetes de pantalla y de sala); las funciones las implementa el paquete del protocolo.
 */

export const AUTO_PROTOCOL_VERSION = 1
/** Más de esto se trocea en `autoPart` (deja margen al tope de 16 KB del relay: el sobre del `autoEvent` y, si algún día va cifrado, el base64). */
export const MAX_AUTO_BYTES = 12 * 1024
export const MAX_PARTS = 16
/** Lo que el que manda se permite por segundo (el relay deja 30 con ráfaga de 60; el manual necesita algo también). */
export const AUTO_RATE_PER_SECOND = 25
export const AUTO_BURST = 40

/** Un deck como `[passcode, copias]` (el del builder, contado): lo que el invitado le manda al anfitrión. */
export interface AutoDeckWire {
  main: [number, number][]
  extra: [number, number][]
}
export interface AutoPlayerWire {
  lp: number
  hand: number
  draw: number
}
/** Lo que el invitado necesita saber de una carta que el núcleo le dejó ver (el `.cdb` lo tiene el anfitrión): el tipo para el adaptador, el nombre y los rótulos de efectos para la pantalla. */
export interface AutoCardInfo {
  code: number
  type: number
  name?: string
  strs?: string[]
}

export type AutoMessage =
  /** Invitado → anfitrión: mi deck (al ver `settings.auto`, cada vez que cambia, y al volver). */
  | { t: 'autoDeck'; v: number; main: [number, number][]; extra: [number, number][] }
  /** Anfitrión → invitado: si se puede jugar con esos dos decks. `bad`: los códigos del invitado sin reglas; `theirsBad`: cuántas del anfitrión. `reason` cuando no es por reglas. */
  | { t: 'autoCheck'; v: number; ok: boolean; bad: number[]; theirsBad: number; reason?: 'version' | 'off' | 'data' | 'lost' }
  /** Anfitrión → invitado: el duelo que empieza. `seat` es el asiento del invitado; `mine` su deck en códigos del núcleo como lo puso el anfitrión; `theirs`, sólo cuántas cartas tiene el anfitrión. */
  | { t: 'autoInit'; v: number; seed: number; seat: Seat; players: [AutoPlayerWire, AutoPlayerWire]; mine: { main: number[]; extra: number[]; hand: number[] }; theirs: { main: number; extra: number } }
  /** Anfitrión → invitado: lo que sigue es una re-emisión desde cero; las primeras `skip` preguntas tuyas ya están contestadas (no animes, no preguntes). */
  | { t: 'autoReplay'; skip: number }
  /** Anfitrión → invitado: un evento del anfitrión del núcleo ya filtrado para tu asiento, con los datos de las cartas que ves por primera vez. */
  | { t: 'autoEvent'; event: AutoEvent; cards?: AutoCardInfo[] }
  /** Un trozo de un mensaje grande (`id` lo agrupa, `i` de `n`): se reensambla y se vuelve a parsear. */
  | { t: 'autoPart'; id: number; i: number; n: number; text: string }
  /** Invitado → anfitrión: la respuesta a la pregunta pendiente (`askId` es el de esa pregunta; otro, se descarta). */
  | { t: 'autoAnswer'; askId: number; answer: CoreAnswer }
  /** Invitado → anfitrión: me perdí algo (o acabo de entrar): mandame el duelo de nuevo. */
  | { t: 'autoResync' }

export type AutoMessageKind = AutoMessage['t']
/** Lo que cada lado acepta recibir (se descarta lo demás, sin avisar). */
export const HOST_ACCEPTS: readonly AutoMessageKind[] = ['autoDeck', 'autoAnswer', 'autoResync']
export const GUEST_ACCEPTS: readonly AutoMessageKind[] = ['autoCheck', 'autoInit', 'autoReplay', 'autoEvent', 'autoPart']

export function encodeAutoMessage(message: AutoMessage): string {
  return JSON.stringify(message)
}

/** Si el texto es de este protocolo (empieza con `{"t":"auto`): lo que mira el enlace antes de parsear. */
export const isAutoText = (text: string): boolean => text.startsWith('{"t":"auto')

/** ESQUELETO. Una copia con forma conocida (y dentro de los topes) o `null`. */
export function parseAutoMessage(_text: string): AutoMessage | null {
  return null
}

/** ESQUELETO. Parte un texto grande en `autoPart` de `MAX_AUTO_BYTES`; uno chico va entero (`[text]`). */
export function chunkAutoText(text: string): string[] {
  return [text]
}

/** Junta los `autoPart` de un mensaje grande; devuelve el texto entero cuando llegan todos. */
export interface Reassembler {
  push(part: Extract<AutoMessage, { t: 'autoPart' }>): string | null
}
/** ESQUELETO. */
export function createReassembler(_now?: () => number): Reassembler {
  return { push: () => null }
}

/** El marcapasos de quien manda: una cola con `AUTO_RATE_PER_SECOND` por segundo. Un `key` repetido reemplaza al que sigue en la cola (`stats` de un asiento: sólo cuenta el último). */
export interface Pacer {
  push(text: string, key?: string): void
  destroy(): void
}
/** ESQUELETO. */
export function createPacer(send: (text: string) => void, _now?: () => number): Pacer {
  return { push: (text) => send(text), destroy: () => {} }
}
