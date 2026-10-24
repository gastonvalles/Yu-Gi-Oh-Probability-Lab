import type { DuelSnapshot } from '../duel-session'
import type { AutoCardInfo } from './online-protocol'
import type { DataLoader, DataSource } from './auto-data'
import type { AutoSession, TransportFactory } from './auto-session'
import type { DeckList } from './deck-map'
import type { Seat } from './protocol'

/**
 * El enlace del duelo automático por enlace (diseño: `docs/duelos-automaticos.md`, «Duelo online»): lo que une la sala de siempre (`createDuel`: saludo, listos, tirada, chat,
 * vidas, revancha) con la sesión del núcleo. El anfitrión corre `AutoSession` con el asiento del invitado como remoto (sus preguntas salen por la red) y le manda su vista filtrada
 * por el árbitro; el invitado corre la misma sesión sobre ese flujo, sin núcleo, y contesta con la misma `ask-ui`. Los textos viajan por el mismo relay que el protocolo manual.
 *
 * ESQUELETO: los tipos son los definitivos (los usan en paralelo la pantalla y la sala); `createHostLink` / `createGuestLink` las implementa el paquete del protocolo.
 */

/** Lo que el enlace necesita del relay: mandar y escuchar texto (un `DuelTransport` lo cumple; en las pruebas, un par en memoria). */
export interface OnlineTransport {
  send(text: string): void
  onMessage(listener: (text: string) => void): () => void
}

export type OnlinePhase = 'idle' | 'awaitingDeck' | 'outdated' | 'checking' | 'blocked' | 'ready' | 'starting' | 'playing' | 'ended' | 'lost'

export interface OnlineSnapshot {
  phase: OnlinePhase
  /** Lo que impide empezar: los códigos propios sin reglas (para listarlos con nombre), cuántas del otro, o la razón. */
  problems: { mine: number[]; theirs: number; reason: 'version' | 'off' | 'data' | 'lost' | null }
  /** La sesión del duelo que corre (anfitrión o invitado), o null antes de `ordered`. Cambia de objeto en cada revancha. */
  session: AutoSession | null
  /** Las cartas del rival que el núcleo dejó ver (invitado) o todas las del `.cdb` del duelo (anfitrión): nombre, tipo y rótulos por código. */
  cards: ReadonlyMap<number, AutoCardInfo>
  /** Mi asiento del núcleo (0 empieza), o null hasta `ordered`. */
  seat: Seat | null
}

export interface OnlineLink {
  getSnapshot(): OnlineSnapshot
  subscribe(listener: () => void): () => void
  /** La sala avanza: el enlace mira `peerPresent`, `peerSid`, `opening.ordered`, `starter`, `series.game` y `settings.auto` y hace lo suyo. Se llama con cada snapshot de `createDuel`. */
  observe(snapshot: DuelSnapshot): void
  /** El invitado volvió a conectarse (o entró): pide el duelo de nuevo. Lo llama la pantalla en cada `peerPresent` que pasa de false a true después del primero. */
  resync(): void
  destroy(): void
}

export interface HostLinkOptions {
  transport: OnlineTransport
  loader: DataLoader
  /** El deck del anfitrión como lo pide la sesión. */
  deck: DeckList
  handSize: number
  /** `workerTransport()` en la app; `localTransport(core)` en las pruebas. */
  makeTransport: TransportFactory
  /** `AUTO_ONLINE` del manifiesto (`features.online`): apagado, se contesta `autoCheck{ok:false, reason:'off'}`. */
  enabled: () => Promise<boolean>
  now?: () => number
  random?: () => number
}

export interface GuestLinkOptions {
  transport: OnlineTransport
  source: DataSource
  deck: DeckList
  now?: () => number
}

/** ESQUELETO: el enlace del anfitrión. */
export function createHostLink(_options: HostLinkOptions): OnlineLink {
  throw new Error('createHostLink: sin implementar (paquete del protocolo)')
}

/** ESQUELETO: el enlace del invitado. */
export function createGuestLink(_options: GuestLinkOptions): OnlineLink {
  throw new Error('createGuestLink: sin implementar (paquete del protocolo)')
}

/** Lo que la pantalla de la sala le pasa a la mesa online mientras el duelo no empieza (la sala de siempre la dibuja `DuelRoom`; ver `AutoDuelScreen`). */
export interface RoomAutoState {
  /** Con `false`, «Estoy listo» no se puede tocar (todavía no se revisaron los dos decks, o no se puede jugar con ellos). */
  canReady: boolean
  /** Lo que se le dice a quien espera o no puede empezar (debajo del deck): una línea y, si hay cartas sin reglas, su lista. */
  notice: { tone: 'info' | 'warning' | 'danger'; text: string; cards?: { code: number; name: string }[] } | null
}
