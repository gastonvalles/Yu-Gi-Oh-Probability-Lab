import type { BotView } from './bot'

/**
 * Los castigos del rival (Black-Winged Assault Dragon: 700 cada vez que activás un efecto de monstruo; una Angelechy Destrier como Continua: 500 por cada activación): el bot no lee
 * la carta que castiga, lo deduce de lo que pasa, como un jugador. Cada acción suya es de una **clase** (`ActionClass`); si después de una pierde vidas sin batalla en el medio ni
 * una activación tuya (que podría ser la que daña), esa clase tiene ese **precio**. Lo aprende pagando la primera vez y lo olvida si una acción de esa clase ya no cuesta o si deja tu
 * campo boca arriba alguna de las cartas que estaban cuando lo aprendió (una de ellas castigaba). Con varias acciones de clases distintas en la misma cadena, el daño se reparte
 * por igual (ponytail: una aproximación; con dos castigos de clases distintas a la vez, cada precio sale promediado).
 *
 * Con precio, `allows` decide: nunca lo deja en 0, nunca al alcance de lo que tenés boca arriba para atacarle (`reach`), lo que puede sacarte cartas va primero y, pasado el tope
 * del turno (`CAP` de sus vidas al empezarlo), sólo paga si no tiene monstruos (lo mínimo para defenderse). Puro: sin núcleo ni React; el estado vive en el `Bot` que lo usa.
 */

export type ActionClass = 'monster' | 'spell' | 'trap' | 'summon' | 'special'

/**
 * Lo que paga por precios en un turno no pasa de esta fracción de sus vidas al empezarlo. Con la vara (`auto-bot-medicion.slow.test.ts`, Elfnote contra Black-Winged Assault Dragon,
 * 30 manos): 0,15 pierde 840 y deja 1,7 monstruos; 0,25, 1500 y 1,8; 0,4, 2800 y 2,7. Un cuarto: casi lo mismo de campo que 0,15 por mucho menos que 0,4.
 */
export const CAP = 0.25

const MONSTER = 0x1
const TRAP = 0x4

/** La clase de activar una carta: por lo impreso (un monstruo activa un efecto de monstruo). */
export const activationClass = (type: number): ActionClass => ((type & MONSTER) !== 0 ? 'monster' : (type & TRAP) !== 0 ? 'trap' : 'spell')

/** Tus cartas boca arriba, por código (lo que estaba cuando aprendió un precio). */
const yourFaceUp = (view: BotView) => [...view.them.monsters, ...view.them.spells].flatMap((card) => (card && card.code !== 0 && card.pos !== 'set' ? [card.code] : []))

/** Lo que le podés pegar en tu próximo turno con lo que tenés boca arriba: tus ATK, sacando uno por cada monstruo suyo que lo frena (de igual o más ATK, del más fuerte al más débil). */
export function reach(view: BotView): number {
  const yours = view.them.monsters.flatMap((card) => (card && card.code !== 0 && card.pos !== 'set' ? [card.stats?.attack ?? 0] : [])).sort((a, b) => b - a)
  const blockers = view.me.monsters.flatMap((card) => (card && card.pos !== 'set' ? [card.stats?.attack ?? 0] : [])).sort((a, b) => b - a)
  let total = 0

  for (const atk of yours) {
    const at = blockers.findIndex((blocker) => blocker >= atk)

    if (at >= 0) blockers.splice(at, 1)
    else total += atk
  }
  return total
}

export interface Punishments {
  /** Lo que aprendió desde su última pregunta: se llama al empezar cada decisión. */
  observe: (view: BotView) => void
  /** Hizo una acción de esa clase (activar, Invocar): queda esperando ver si le cuesta. */
  acted: (view: BotView, kind: ActionClass) => void
  price: (kind: ActionClass) => number
  /** Si sabe de algún precio. */
  any: () => boolean
  /** Si puede hacer una acción de esa clase ahora; `removes`: puede sacarte cartas (quizá la que castiga). */
  allows: (view: BotView, kind: ActionClass, removes: boolean) => boolean
}

export function createPunishments(): Punishments {
  const prices = new Map<ActionClass, { lp: number; field: number[] }>()
  let pending: { kinds: ActionClass[]; lp: number; history: number } | null = null
  let turn = { at: -1, start: 0, spent: 0 }

  const observe = (view: BotView) => {
    if (view.turn !== turn.at) turn = { at: view.turn, start: view.lp.me, spent: 0 }
    const now = new Set(yourFaceUp(view))

    for (const [kind, known] of prices) if (known.field.some((code) => !now.has(code))) prices.delete(kind)
    if (!pending || view.chain.length > 0) return
    const since = view.history.slice(pending.history)
    const drop = pending.lp - view.lp.me
    const unclear = since.some((event) => event.kind === 'attack' || (event.kind === 'activate' && event.side === 'them'))

    if (!unclear) {
      const share = Math.max(0, drop) / pending.kinds.length

      for (const kind of new Set(pending.kinds)) {
        if (share > 0) prices.set(kind, { lp: share, field: [...now] })
        else prices.delete(kind)
      }
      if (drop > 0) turn.spent += drop
    }
    pending = null
  }

  return {
    observe,
    acted: (view, kind) => {
      if (pending && view.chain.length > 0) pending.kinds.push(kind)
      else pending = { kinds: [kind], lp: view.lp.me, history: view.history.length }
    },
    price: (kind) => prices.get(kind)?.lp ?? 0,
    any: () => prices.size > 0,
    allows: (view, kind, removes) => {
      const price = prices.get(kind)?.lp ?? 0

      if (price === 0) return true
      if (view.lp.me - price <= reach(view)) return false
      if (removes) return true
      return turn.spent + price <= turn.start * CAP || view.me.monsters.every((card) => card === null)
    },
  }
}
