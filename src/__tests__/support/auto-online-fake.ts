// El enlace de mentira del duelo automático por enlace para las pruebas de pantalla: cumple `OnlineLink` y la prueba lo maneja a mano (la fase, los problemas, la sesión —una
// `fakeSession`—, el asiento, las cartas del rival que el núcleo dejó ver y el pedido de pasar a manual); anota lo que la pantalla le pide: cada snapshot de la sala (`observe`),
// `resync`, `manual`, `undo`, `phase` y `destroy`.
import type { OnlineLink, OnlineSnapshot, PhaseView } from '../../app/auto/online'
import type { DuelSnapshot } from '../../app/duel-session'

export interface FakeLink extends OnlineLink {
  /** El último snapshot de la sala que le pasó la pantalla. */
  room: DuelSnapshot | null
  resyncs: number
  /** Lo que la pantalla pidió de pasar a manual, en orden (`true` pedir o aceptar, `false` rechazar o retirar). */
  manuals: boolean[]
  /** Lo mismo con deshacer. */
  undos: boolean[]
  /** Lo que la pantalla dijo de su mesa (`phase`), en orden. */
  phases: PhaseView[]
  destroyed: boolean
  /** Cambia lo que sabe el enlace y avisa. Una sesión nueva destruye la anterior, como hace el de verdad en la revancha. */
  set(patch: Partial<OnlineSnapshot>): void
}

export function fakeOnlineLink(initial: Partial<OnlineSnapshot> = {}): FakeLink {
  let snapshot: OnlineSnapshot = { phase: 'idle', problems: { mine: [], theirs: 0, reason: null }, session: null, cards: new Map(), seat: null, ...initial }
  const listeners = new Set<() => void>()
  const link: FakeLink = {
    room: null,
    resyncs: 0,
    manuals: [],
    undos: [],
    phases: [],
    destroyed: false,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    observe(room) {
      link.room = room
    },
    resync() {
      link.resyncs += 1
    },
    manual(yes) {
      link.manuals.push(yes)
    },
    undo(yes) {
      link.undos.push(yes)
    },
    phase(view) {
      link.phases.push(view)
    },
    destroy() {
      link.destroyed = true
    },
    set(patch) {
      if (patch.session !== undefined && snapshot.session && patch.session !== snapshot.session) snapshot.session.destroy()
      snapshot = { ...snapshot, ...patch }
      listeners.forEach((listener) => listener())
    },
  }

  return link
}
