import { RateLimiter } from '../duel-relay-rules'
import type { DuelSnapshot } from '../duel-session'
import { whoseTurn } from '../duel-turn'
import { encodeAutoMessage, isAutoText, parseAutoMessage, type AutoMessage, type ResumeWhy } from './online-protocol'
import type { OnlineTransport } from './online'
import type { PlacedCard, Seat, Setup } from './protocol'
import { placedCards, tableMatches, whyNotResume } from './resume'

/**
 * Pasar de manual a automático en el duelo por enlace (diseño: `docs/duelo-automatico-enlace.md`): el pedido de un lado mientras la sala sigue a mano (el enlace del núcleo no
 * existe en ese rato: éste escucha el mismo relay, sólo `autoResume`). Lo pide quien tiene el turno, en su Main Phase 1 o 2, sin fichas ni cartas bajo el control del otro
 * (`whyNotResume`), y el otro acepta o no; uno a la vez (si los dos piden a la vez vale el del anfitrión), vence a los `RESUME_WAIT_MS` y se cae si el otro se va. El invitado
 * manda su mesa entera con el pedido (o con su sí) y el anfitrión la compara con lo que ve de él (`tableMatches`) antes de acordar: así el `setup` del núcleo sale de las dos mesas
 * como las ve el anfitrión. El acuerdo (`start`) lo anuncia el enlace del núcleo del anfitrión (`createHostLink` con `resume`), ya escuchando: el invitado pasa con ese `yes`. Las
 * versiones que lo saben hacer se saludan con `hello`: sin el del otro, no se ofrece.
 */

export type ResumeState = 'idle' | 'asking' | 'asked' | 'switching' | 'agreed' | 'declined' | 'expired' | 'refused'

export interface ResumeSnapshot {
  state: ResumeState
  /** Por qué no se puede pedir ahora, visto desde acá (null: se puede): `peer`, el otro no lo sabe hacer; `absent`, no está en la sala o todavía no hay mesa. */
  blocked: ResumeWhy | 'peer' | 'absent' | null
  /** Con `refused`: por qué el otro no pudo aceptar mi pedido. */
  why: ResumeWhy | null
  /** El anfitrión que acordó: la mesa rearmada (las dos, por asiento; el 0 tiene el turno) y su asiento. El invitado pasa con `state: 'agreed'`. */
  start: { setup: Setup; seat: Seat } | null
}

export interface ResumeLink {
  getSnapshot(): ResumeSnapshot
  subscribe(listener: () => void): () => void
  /** La sala avanza: el enlace mira la mesa de los dos, de quién es el turno, las vidas y si el otro está. Se llama con cada snapshot de `createDuel`. */
  observe(snapshot: DuelSnapshot): void
  /** `true` pide (o acepta el pedido del otro); `false` lo rechaza o retira el mío. */
  want(yes: boolean): void
  destroy(): void
}

export interface ResumeLinkOptions {
  host: boolean
  transport: OnlineTransport
  now?: () => number
}

/** Cuánto espera un pedido la respuesta del otro (y el invitado que aceptó, el acuerdo del anfitrión). Como el pase a manual. */
export const RESUME_WAIT_MS = 30_000

type ResumeMessage = Extract<AutoMessage, { t: 'autoResume' }>

/** El código de una carta por su id de la mesa (`card-<código>-<copia>`); 0 si no lo lleva (una ficha, un id opaco). */
export const codeOfId = (id: string) => Number(id.split('-')[1] ?? 0)

export function createResumeLink({ host, transport, now = Date.now }: ResumeLinkOptions): ResumeLink {
  const listeners = new Set<() => void>()
  const limit = new RateLimiter(now(), 2, 8)
  let room: DuelSnapshot | null = null
  let here = false
  let peer = false
  let state: ResumeState = 'idle'
  let why: ResumeWhy | null = null
  let start: ResumeSnapshot['start'] = null
  // La mesa que mandó el invitado con su pedido (el anfitrión la guarda hasta contestar).
  let asked: PlacedCard[] | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false
  let snapshot: ResumeSnapshot = { state, blocked: 'absent', why, start }

  const say = (message: ResumeMessage) => transport.send(encodeAutoMessage(message))

  /** Visto desde acá: por qué quien tiene el turno (`who`) no puede pasar ahora, o null. */
  function whyNot(who: 'mine' | 'theirs'): ResumeWhy | 'absent' | null {
    if (!room?.mine || !room.theirs || !room.peerPresent) return 'absent'
    if (whoseTurn(room.me, room.mine, room.theirs.state, room.starter) !== who) return 'turn'

    return who === 'mine' ? whyNotResume(room.mine, room.theirs.state) : whyNotResume(room.theirs.state, room.mine)
  }

  function refresh() {
    const blocked = whyNot('mine') ?? (peer ? null : 'peer')

    if (snapshot.state === state && snapshot.blocked === blocked && snapshot.why === why && snapshot.start === start) return
    snapshot = { state, blocked, why, start }
    listeners.forEach((listener) => listener())
  }

  const go = (next: ResumeState, onWait?: () => void) => {
    clearTimeout(timer)
    timer = onWait ? setTimeout(onWait, RESUME_WAIT_MS) : undefined
    state = next
    refresh()
  }

  /** El asiento del invitado en el duelo rearmado: el 0 es de quien tiene el turno, el que pidió. */
  const guestSeat = (guestAsked: boolean): Seat => (guestAsked ? 0 : 1)

  /** El anfitrión acuerda: la mesa rearmada con las dos mesas como las ve él (la del invitado, la que mandó, ya comparada con su espejo) y las vidas de la sala. */
  function agree(guestAsked: boolean, table: readonly PlacedCard[]) {
    const r = room!
    const guest = guestSeat(guestAsked)
    const me = (1 - guest) as Seat
    const mine = placedCards(r.mine!, me, codeOfId)
    const turnState = guestAsked ? r.theirs!.state : r.mine!
    const otherState = guestAsked ? r.mine! : r.theirs!.state
    const lp = (seat: Seat) => r.life.lp[seat === me ? r.me : 1 - r.me]!
    const cards = guest === 0 ? [...table, ...mine] : [...mine, ...table]
    const phase = turnState.phase

    start = { setup: { cards, lp: [lp(0), lp(1)], ...(phase === 'main1' || phase === 'main2' ? { phase } : {}), turns: [turnState.turn, otherState.turn] }, seat: me }
    asked = null
    go('agreed')
  }

  /** El anfitrión mira la mesa que mandó el invitado contra su espejo: la devuelve si coincide, o le dice que no. */
  function checked(table: PlacedCard[] | undefined, guestAsked: boolean): PlacedCard[] | null {
    const reason = whyNot(guestAsked ? 'theirs' : 'mine')
    const bad: ResumeWhy | null = reason === 'absent' ? 'turn' : reason === null && (!table || !tableMatches(room!.theirs!.state, room!.theirs!.known, table, guestSeat(guestAsked))) ? 'table' : reason

    if (bad === null) return table!
    say({ t: 'autoResume', step: 'no', why: bad })

    return null
  }

  function receive(message: ResumeMessage) {
    switch (message.step) {
      case 'hello':
        // Se contesta siempre (el otro pudo recargar y volver sin que la sala lo notara), salvo a una contestación.
        if (!message.back) say({ t: 'autoResume', step: 'hello', back: true })
        if (!peer) {
          peer = true
          refresh()
        }
        return
      case 'ask':
        // Los dos a la vez: vale el del anfitrión (el invitado deja el suyo por el del anfitrión).
        if (state === 'asking' && host) return
        if (state === 'asked' || state === 'switching' || state === 'agreed') return
        if (host) {
          const table = checked(message.table, true)

          if (!table) return
          asked = table
          return go('asked')
        }
        {
          const reason = whyNot('theirs')

          if (reason !== null) return void say({ t: 'autoResume', step: 'no', why: reason === 'absent' ? 'turn' : reason })
        }
        return go('asked')
      case 'yes':
        if (!host) {
          if (state === 'asking' || state === 'switching') go('agreed')
          return
        }
        if (state !== 'asking') return void say({ t: 'autoResume', step: 'cancel' })
        {
          const table = checked(message.table, false)

          if (table) agree(false, table)
          else {
            why = 'table'
            go('refused')
          }
        }
        return
      case 'no':
        // También al invitado al que le pidieron (el anfitrión no pudo con lo que mandó): se entera de por qué.
        if (state === 'asking' || (!host && (state === 'switching' || state === 'asked'))) {
          why = message.why ?? null
          go(message.why ? 'refused' : state === 'asking' ? 'declined' : 'idle')
        }
        return
      case 'cancel':
        if (state === 'asked' || (!host && state === 'switching')) {
          asked = null
          go('idle')
        }
    }
  }

  const off = transport.onMessage((text) => {
    if (destroyed || !isAutoText(text) || !room?.settings.auto) return
    const message = parseAutoMessage(text)

    if (message?.t === 'autoResume' && limit.allow(now())) receive(message)
  })

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)

      return () => void listeners.delete(listener)
    },
    observe(next) {
      const before = room
      const arrived = next.settings.auto === true && next.peerPresent && next.mine !== null

      room = next
      if (destroyed) return
      if (!next.peerPresent && before?.peerPresent) {
        peer = false
        if (state === 'asking' || state === 'asked' || state === 'switching') {
          asked = null
          state = 'idle'
          clearTimeout(timer)
        }
      }
      if (arrived && !here) say({ t: 'autoResume', step: 'hello' })
      here = arrived
      refresh()
    },
    want(yes) {
      if (destroyed || state === 'agreed') return
      if (state === 'asked') {
        if (!yes) {
          asked = null
          say({ t: 'autoResume', step: 'no' })
          return go('idle')
        }
        if (host) return agree(true, asked ?? [])
        say({ t: 'autoResume', step: 'yes', table: placedCards(room!.mine!, 1, codeOfId) })
        // Si el acuerdo no llega (el anfitrión cambió de idea o se fue), el duelo sigue a mano.
        return go('switching', () => go('idle'))
      }
      if (state === 'asking') {
        if (!yes) {
          say({ t: 'autoResume', step: 'cancel' })
          go('idle')
        }
        return
      }
      if (yes && state !== 'switching' && snapshot.blocked === null) {
        say({ t: 'autoResume', step: 'ask', ...(host ? {} : { table: placedCards(room!.mine!, 0, codeOfId) }) })
        go('asking', () => {
          say({ t: 'autoResume', step: 'cancel' })
          go('expired')
        })
      }
    },
    destroy() {
      destroyed = true
      clearTimeout(timer)
      off()
      listeners.clear()
    },
  }
}
