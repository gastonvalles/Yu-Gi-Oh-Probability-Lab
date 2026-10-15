import { describe, expect, it } from 'vitest'

import {
  encodeAct,
  mapActionIds,
  mapMatIds,
  mirrorApply,
  mirrorUndo,
  openMirror,
  openPublic,
  senderKnown,
  type WireAct,
} from '../app/mat-public'
import { allMatIds, createMatState, matReducer, replayMat, type MatAction, type MatState } from '../app/practice-mat'
import { random, randomAction } from './support/random-mat'

// Veinte cartas de main, tres del Extra y la mano de cinco (las primeras): como los ids reales de la mesa, llevan la identidad.
const main = Array.from({ length: 20 }, (_, index) => `card-${1000 + index}-1`)
const extra = ['card-9001-1', 'card-9002-1', 'card-9003-1']
const start = createMatState(main, extra, 5)

/** Un duelo de dos lados: las jugadas se aplican a la mesa propia y, por JSON como en la red, al espejo del rival. */
function duel(initial: MatState = start) {
  const open = openPublic(initial)
  let sender = open.sender
  let state = initial
  let mirror = openMirror(open.masked, open.reveal)
  const wires: WireAct[] = []

  return {
    open,
    wires,
    get state() {
      return state
    },
    get sender() {
      return sender
    },
    get mirror() {
      return mirror
    },
    opaque: (id: string) => open.sender.opaque[id] ?? id,
    play(action: MatAction) {
      const sent = encodeAct(sender, state, action)
      const wire = JSON.parse(JSON.stringify(sent.wire)) as WireAct
      sender = sent.sender
      state = matReducer(state, action)
      mirror = mirrorApply(mirror, wire)
      wires.push(wire)
      return wire
    },
  }
}

describe('la mesa que se manda al rival no dice qué cartas son', () => {
  it('la mesa inicial va con ids opacos únicos, sin ninguna identidad, y no revela nada', () => {
    const { open } = duel()

    expect(JSON.stringify(open.masked)).not.toContain('card-')
    expect(open.reveal).toEqual({})
    expect(allMatIds(open.masked)).toHaveLength(main.length + extra.length)
    expect(new Set(allMatIds(open.masked)).size).toBe(main.length + extra.length)
    expect(allMatIds(open.masked).every((id) => /^c\d+$/.test(id))).toBe(true)
  })

  it('robar, barajar y volver al deck no revelan nada: la mano y el deck siguen siendo secretos', () => {
    const game = duel()

    const wires = [
      game.play({ type: 'draw', count: 2 }),
      game.play({ type: 'shuffle', seed: 7 }),
      game.play({ type: 'move', id: 'card-1000-1', to: 'deck' }),
      game.play({ type: 'move', id: 'card-1001-1', to: 'deck-bottom', shuffle: 9 }),
    ]

    expect(wires.map((wire) => wire.reveal)).toEqual([{}, {}, {}, {}])
    expect(game.mirror.known).toEqual({})
    expect(JSON.stringify(game.wires)).not.toContain('card-')
  })

  it('una carta boca abajo no se revela; al darla vuelta, sí', () => {
    const game = duel()
    const card = 'card-1000-1'

    expect(game.play({ type: 'place', id: card, zone: 'st', index: 1, pos: 'set' }).reveal).toEqual({})
    expect(JSON.stringify(game.wires)).not.toContain(card)

    expect(game.play({ type: 'position', id: card, pos: 'atk' }).reveal).toEqual({ [game.opaque(card)]: card })
    expect(game.mirror.known).toEqual({ [game.opaque(card)]: card })
  })

  it('lo que va al cementerio o se invoca boca arriba se revela una sola vez, aunque vuelva a la mano', () => {
    const game = duel()
    const card = 'card-1002-1'

    expect(game.play({ type: 'move', id: card, to: 'gy' }).reveal).toEqual({ [game.opaque(card)]: card })
    expect(game.play({ type: 'move', id: card, to: 'hand' }).reveal).toEqual({})
    expect(game.play({ type: 'place', id: card, zone: 'mz', index: 0, pos: 'atk' }).reveal).toEqual({})
  })

  it('agregar a la mano una carta del deck (buscarla) la muestra una vez; robar sigue siendo secreto', () => {
    const game = duel()
    const searched = 'card-1010-1'

    expect(game.play({ type: 'draw', count: 1 }).reveal).toEqual({})
    expect(game.play({ type: 'move', id: searched, to: 'hand', shuffle: 5 }).reveal).toEqual({ [game.opaque(searched)]: searched })
    expect(game.mirror.known).toEqual({ [game.opaque(searched)]: searched })
    // Una carta que ya estaba en la mano (o que vuelve de otro lado) no se muestra de nuevo.
    expect(game.play({ type: 'move', id: searched, to: 'deck' }).reveal).toEqual({})
    expect(game.play({ type: 'move', id: searched, to: 'hand' }).reveal).toEqual({})
  })

  it('el destierro boca abajo es secreto y boca arriba no', () => {
    const game = duel()

    expect(game.play({ type: 'move', id: 'card-1000-1', to: 'banished', faceDown: true }).reveal).toEqual({})
    expect(game.play({ type: 'move', id: 'card-1001-1', to: 'banished' }).reveal).toEqual({ [game.opaque('card-1001-1')]: 'card-1001-1' })
  })

  it.each<[string, MatAction]>([
    ['mostrar una carta de la mano', { type: 'reveal', id: 'card-1003-1' }],
    ['declarar el nombre de una carta', { type: 'declare', id: 'card-1003-1' }],
    ['activar sin costo una carta de la mano', { type: 'activate', id: 'card-1003-1' }],
  ])('%s la revela aunque la mesa no cambie', (_name, action) => {
    const game = duel()
    const wire = game.play(action)

    expect(game.state).toEqual(start)
    expect(wire.reveal).toEqual({ [game.opaque('card-1003-1')]: 'card-1003-1' })
  })

  it('activar con costo la manda al cementerio y la revela una vez', () => {
    const game = duel()
    const wire = game.play({ type: 'activate', id: 'card-1003-1', cost: 'discard' })

    expect(wire.reveal).toEqual({ [game.opaque('card-1003-1')]: 'card-1003-1' })
    expect(game.mirror.state.gy).toEqual([game.opaque('card-1003-1')])
  })

  it('las invocaciones del Extra y los materiales que van al cementerio se revelan; las fichas viajan tal cual', () => {
    const game = duel()

    game.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'set' })
    game.play({ type: 'token', zone: 'mz', index: 1 })
    const wire = game.play({ type: 'summon', id: 'card-9001-1', how: 'link', materials: ['card-1000-1', 'token-1'], zone: 'emz', index: 0, pos: 'atk' })

    expect(Object.values(wire.reveal).sort()).toEqual(['card-1000-1', 'card-9001-1'])
    expect(wire.action).toMatchObject({ materials: [game.opaque('card-1000-1'), 'token-1'] })
    expect(Object.values(game.mirror.known).some((id) => id.startsWith('token'))).toBe(false)
  })

  it('cada jugada con ids viaja renombrada (y las que no llevan, intactas)', () => {
    const upper = (id: string) => id.toUpperCase()
    const actions: MatAction[] = [
      { type: 'move', id: 'a', to: 'gy' },
      { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'tribute', id: 'a', tributes: ['b', 'c'], zone: 'mz', index: 0, pos: 'atk' },
      { type: 'summon', id: 'a', how: 'xyz', materials: ['b', 'c'], zone: 'emz', index: 0, pos: 'atk' },
      { type: 'attach', id: 'a', to: 'b' },
      { type: 'position', id: 'a', pos: 'def' },
      { type: 'counter', id: 'a', delta: 1 },
      { type: 'activate', id: 'a' },
      { type: 'reveal', id: 'a' },
      { type: 'declare', id: 'a' },
      { type: 'target', id: 'a' },
    ]

    expect(actions.map((action) => JSON.stringify(mapActionIds(action, upper)))).toEqual(
      actions.map((action) => JSON.stringify(action).replace(/"([abc])"/g, (_whole, id: string) => `"${id.toUpperCase()}"`)),
    )

    const plain: MatAction[] = [{ type: 'draw', count: 1 }, { type: 'mill', count: 1 }, { type: 'shuffle', seed: 3 }, { type: 'token', zone: 'mz', index: 0 }, { type: 'phase', phase: 'main1' }]
    expect(plain.map((action) => mapActionIds(action, upper))).toEqual(plain)
  })
})

describe('el espejo del rival', () => {
  it('deshacer devuelve la mesa de antes y no olvida lo ya revelado (quien juega no lo vuelve a mandar)', () => {
    const game = duel()
    game.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    game.play({ type: 'place', id: 'card-1001-1', zone: 'mz', index: 1, pos: 'atk' })

    const undone = mirrorUndo(game.mirror)
    expect(undone.state).toEqual(mapMatIds(replayMat(start, [{ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' }]), game.opaque))
    expect(undone.known).toEqual(game.mirror.known)
    expect(mirrorUndo(openMirror(game.open.masked))).toEqual(openMirror(game.open.masked))

    // Quien juega repite la jugada: no revela de nuevo y el espejo sigue sabiendo qué carta es.
    const again = game.play({ type: 'place', id: 'card-1001-1', zone: 'mz', index: 1, pos: 'atk' })
    expect(again.reveal).toEqual({})
  })

  it('quien se reconecta recupera todo con lo que ya sabía el rival más las jugadas', () => {
    const game = duel()
    game.play({ type: 'move', id: 'card-1000-1', to: 'gy' })
    game.play({ type: 'place', id: 'card-1001-1', zone: 'st', index: 0, pos: 'set' })
    game.play({ type: 'draw', count: 1 })

    const rebuilt = game.wires.reduce(mirrorApply, openMirror(game.open.masked, senderKnown(game.sender)))

    expect(rebuilt.state).toEqual(game.mirror.state)
    expect(rebuilt.known).toEqual(game.mirror.known)
  })

  it('ignora revelaciones de cartas que no existen o con forma rara, y la primera revelación manda', () => {
    const game = duel()
    const mirror = mirrorApply(game.mirror, {
      action: { type: 'draw', count: 1 },
      reveal: { zzz: 'card-1', c1: '', c2: 'x'.repeat(500), c3: 'card-5-1' },
    })

    expect(mirror.known).toEqual({ c3: 'card-5-1' })
    expect(mirrorApply(mirror, { action: { type: 'draw', count: 0 }, reveal: { c3: 'card-6-1' } }).known).toEqual({ c3: 'card-5-1' })
  })
})

// --- Sobre miles de jugadas al azar: el espejo no se desincroniza ni filtra, y no oculta lo que se ve ---

// Qué ve el rival, escrito aparte de la implementación y a propósito simple.
function visible(state: MatState, action?: MatAction, before?: MatState): string[] {
  const cards = [...state.gy, ...state.banished.filter((id) => !state.facedown.includes(id))]

  for (const placed of [...state.mz, ...state.emz, ...state.st, state.field]) {
    if (placed && placed.pos !== 'set') {
      cards.push(placed.id, ...placed.materials)
    }
  }

  if (action && (action.type === 'reveal' || action.type === 'declare' || action.type === 'activate')) {
    cards.push(action.id)
  }

  // Buscar una carta del deck y agregarla a la mano la muestra.
  if (action && before && action.type === 'move' && action.to === 'hand' && before.deck.includes(action.id)) {
    cards.push(action.id)
  }

  return cards.filter((id) => !id.startsWith('token-'))
}

describe('sobre jugadas al azar', () => {
  it('el espejo queda idéntico a la mesa de quien juega, no filtra nada secreto y conoce todo lo que se ve', { timeout: 60_000 }, () => {
    const effective: Record<string, number> = {}

    for (let run = 1; run <= 150; run += 1) {
      const next = random(run)
      const game = duel(createMatState(main, extra, 5))
      const everVisible = new Set<string>()
      const real = allMatIds(game.state)

      for (let step = 0; step < 120; step += 1) {
        const action = randomAction(game.state, next)
        const before = game.state
        const wire = game.play(action)

        if (game.state !== before) {
          effective[action.type] = (effective[action.type] ?? 0) + 1
        }

        visible(game.state, action, before).forEach((id) => everVisible.add(id))

        // 1. Misma mesa que la de quien juega, con ids opacos.
        expect(game.mirror.state).toEqual(mapMatIds(game.state, game.opaque))

        // 2. Nada secreto sale por la red: ni se revela una carta que no se ve, ni su id viaja en la jugada.
        const serialized = JSON.stringify(wire)
        const leaked = [
          ...Object.values(wire.reveal).filter((id) => !everVisible.has(id)),
          ...real.filter((id) => !everVisible.has(id) && serialized.includes(`"${id}"`)),
        ]
        expect(leaked, `jugada ${action.type} de la corrida ${run}`).toEqual([])

        // 3. Todo lo que el rival puede ver, lo conoce.
        const unknown = visible(game.state, action, before).filter((id) => game.mirror.known[game.opaque(id)] !== id)
        expect(unknown, `jugada ${action.type} de la corrida ${run}`).toEqual([])
      }
    }

    // La prueba no es vacía: las jugadas con efecto cubren los tipos que mueven cartas.
    for (const type of ['move', 'place', 'position', 'counter', 'token', 'tribute', 'summon', 'attach', 'activate', 'draw']) {
      expect(effective[type] ?? 0, `jugadas ${type} con efecto`).toBeGreaterThan(20)
    }
  })
})
