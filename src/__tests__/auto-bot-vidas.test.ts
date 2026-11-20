import { describe, expect, it } from 'vitest'
import { copyIds } from '../app/auto/adapter'
import { createAutoSession } from '../app/auto/auto-session'
import type { Bot, BotView } from '../app/auto/bot/bot'
import type { Seat } from '../app/auto/protocol'
import { createMatState } from '../app/practice-mat'
import { fakeHost, IDLE, loader } from './support/auto-core-fake'

/**
 * Seguir en automático con vidas distintas (`resume.lp`: las tuyas y las del rival): cada asiento ve las suyas como suyas. El bot decide el letal y el tope con `view.lp`; antes,
 * el adaptador del asiento que no es el tuyo las recibía cruzadas. El anfitrión de mentira sólo mueve las vidas del asiento 0 (`fakeHost`): las del 1 quedan las del arranque.
 */

const codeOf = (id: string) => Number(id.split('-')[1] ?? 0)
const DECK = { main: [[1, 8]] as [number, number][], extra: [] as [number, number][] }

async function resumeAt(seat: Seat) {
  const views: BotView[] = []
  // Todas las preguntas son del bot y su Main Phase (una ventana de cadena se pasa sola mientras la mesa rearmada alcanza su fase); después de la primera, el anfitrión se queda
  // «pensando» (si no, contesta y pregunta sin fin).
  const host = fakeHost(() => (1 - seat) as Seat, undefined, 1, () => IDLE)
  const bot: Bot = (ask, view) => {
    views.push(view)
    host.state.hold = true
    return { answer: ask.type === 'select_chain' ? { type: 'select_chain', index: null } : { type: 'select_idlecmd', action: 7, index: null } }
  }
  const session = createAutoSession({
    loader: loader(),
    deck: DECK,
    transport: host.factory,
    seed: 7,
    seat,
    thinkingMs: 0,
    bot,
    resume: { mine: createMatState(copyIds([1, 1, 1, 1, 1, 1, 1, 1]), [], 0), codeOf: (_side, id) => codeOf(id), lp: [6400, 7200] },
  })

  for (let i = 0; i < 100 && views.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 5))
  const overlay = session.getSnapshot().overlay

  session.destroy()
  return { overlay, view: views[0] }
}

describe('las vidas al seguir en automático, vistas desde cada asiento', () => {
  it('vos en el asiento 0: el bot (asiento 1) ve sus 7200 como suyas', async () => {
    const { view } = await resumeAt(0)

    expect(view?.lp.me).toBe(7200)
  })

  it('vos en el asiento 1: tus 6400 son las del asiento 1, y el bot (asiento 0) ve tus 6400 como las tuyas', async () => {
    const { overlay, view } = await resumeAt(1)

    expect(overlay.lp[1]).toBe(6400)
    expect(view?.lp.them).toBe(6400)
  })
})
