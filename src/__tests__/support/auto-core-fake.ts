import type { DataLoader } from '../../app/auto/auto-data'
import type { TransportFactory } from '../../app/auto/auto-session'
import type { MappedDeck } from '../../app/auto/deck-map'
import type { AutoCommand, AutoEvent, CoreAnswer, CoreAsk, Seat } from '../../app/auto/protocol'

/** Lo que comparten las pruebas rápidas de la sesión del duelo automático y del enlace del duelo por enlace: un anfitrión del núcleo de mentira y su cargador. */

export const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: false, to_ep: true, shuffle: false }
export const CHAIN: CoreAsk = { type: 'select_chain', player: 1, spe_count: 0, forced: false, hint_timing: 0, hint_timing_other: 0, selects: [] }
export const END: CoreAnswer = { type: 'select_idlecmd', action: 7, index: null }
export const PASS: CoreAnswer = { type: 'select_chain', index: null }

export const mapped = (main: number[]): MappedDeck => ({ main, extra: [], missing: [], noRules: [] })
export const loader = (mine = mapped([1, 1, 1, 1, 1])): DataLoader => ({
  manifest: async () => ({ version: 't', tokens: [], filler: [2, 2, 2, 2, 2] }),
  load: async () => ({ decks: [mine, mapped([2, 2, 2, 2, 2])], cards: [], scripts: {}, names: { 1: 'One' }, version: 't' }),
})

/**
 * Un anfitrión de mentira con las reglas del de verdad que la sesión usa: cada tanda empieza con `loading` 0, re-simular vuelve a mandar
 * todo desde cero, una respuesta vieja se descarta. La pregunta k es del asiento `seatOf(k)`; antes de cada una las vidas del asiento 0
 * bajan a 8000 - k (así la mesa dice cuántas respuestas lleva) y, en las tres primeras, el asiento 0 roba una carta (una jugada de la
 * mesa); el asiento que no elige recibe `waiting`, como del núcleo. `hold` deja colgada la próxima respuesta (el núcleo «pensando»). `askOf` cambia qué se pregunta (por defecto,
 * `IDLE` al asiento 0 y `CHAIN` al 1).
 */
export function fakeHost(seatOf: (k: number) => Seat = (k) => (k % 3 === 2 ? 1 : 0), react?: (command: AutoCommand, emit: (event: AutoEvent) => void) => boolean, firstCode = 1, askOf = (_k: number, seat: Seat): CoreAsk => (seat === 0 ? IDLE : CHAIN)) {
  const commands: AutoCommand[] = []
  const state = { hold: false, transports: 0 }
  let askId = 0
  const factory: TransportFactory = (data) => {
    let listener: ((event: AutoEvent) => void) | null = null
    let alive = true
    let answers: CoreAnswer[] = []
    let pending: { askId: number; seat: Seat } | null = null
    const emit = (event: AutoEvent) => alive && listener?.(event)
    const ask = () => {
      const k = answers.length
      const seat = seatOf(k)

      pending = { askId: ++askId, seat }
      for (const viewer of [0, 1] as const) {
        emit({
          t: 'events',
          seat: viewer,
          n: k,
          events: [
            { type: 'lpupdate', player: 0, lp: 8000 - k },
            ...(k < 3 ? [{ type: 'draw' as const, player: 0, drawn: [{ code: viewer === 0 ? firstCode : 0, position: 10 }] }] : []),
            ...(viewer === seat ? [] : [{ type: 'waiting' as const }]),
          ],
        })
      }
      emit({ t: 'ask', seat, askId: pending.askId, ask: askOf(k, seat) })
    }
    const run = (replay: readonly CoreAnswer[]) => {
      emit({ t: 'loading', done: 0, total: 1 })
      answers = []
      ask()
      for (const answer of replay) {
        answers.push(answer)
        ask()
      }
    }

    state.transports += 1
    return {
      send(command) {
        commands.push(command)
        void data.then(() => {
          if (!alive || react?.(command, emit)) return
          if (command.t === 'create') run(command.answers ?? [])
          if (command.t === 'rewind') run(answers.slice(0, command.to))
          if (command.t === 'answer' && pending?.askId === command.askId && !state.hold) {
            answers.push(command.answer)
            ask()
          }
        })
      },
      onEvent: (next) => void (listener = next),
      terminate: () => void (alive = false),
    }
  }

  return { factory, commands, state }
}
