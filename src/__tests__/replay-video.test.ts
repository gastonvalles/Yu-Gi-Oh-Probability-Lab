import { describe, expect, it } from 'vitest'

import { buildDuelReplay, duelReplayAt, type ReplayInput } from '../app/duel-replay'
import type { WireAct } from '../app/mat-public'
import { easeInOut } from '../app/motion'
import { createMatState, type MatAction } from '../app/practice-mat'
import { muxMp4 } from '../components/replays/video/mp4-mux'
import { lifeMs, lifeOf, overlaysOf } from '../components/replays/video/video-fx'
import { placesOf, poseAt, transitionOf, type Motion } from '../components/replays/video/video-motion'
import { handRects, replayScenes, sceneAt, videoLayout, VIDEO_HEIGHT_OF, type Rect, type Scene } from '../components/replays/video/video-scene'
import { videoSupport } from '../components/replays/video/video-support'
import { FPS, frameDurations, frameOf, INTRO_MS, OUTRO_MS, STEP_MS, videoDurationMs, videoFileName } from '../components/replays/video/video-timeline'
import { fakeAssets } from './support/video-fakes'

// Un duelo chico (como el de `duel-replay.test.ts`): invoco, coloco, activo y paso; el rival roba, invoca y me ataca.
const deck = Array.from({ length: 20 }, (_, i) => `card-${14558127 + (i % 7) * 1000}-${Math.floor(i / 7) + 1}`)
const mine = createMatState(deck, ['card-90000000-1'], 5)
const theirs = createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5)
const [h0, h1, h2] = mine.hand as [string, string, string]
const myActions: MatAction[] = [
  { type: 'phase', phase: 'main1' },
  { type: 'place', id: h0, zone: 'mz', index: 0, pos: 'atk', how: 'normal' },
  { type: 'place', id: h1, zone: 'st', index: 0, pos: 'set' },
  { type: 'activate', id: h2 },
  { type: 'phase', phase: 'end' },
]
const rivalActs: WireAct[] = [
  { action: { type: 'draw', count: 1 }, reveal: {} },
  { action: { type: 'place', id: 'c6', zone: 'mz', index: 2, pos: 'def', how: 'special' }, reveal: { c6: 'card-55144522-1' } },
  { action: { type: 'attack', id: 'c6', target: h0 }, reveal: {} },
]
const input: ReplayInput = {
  mode: 'solo-auto',
  view: 'public',
  players: ['Ana', 'Beto'],
  starter: 0,
  mine: { initial: mine, actions: myActions },
  theirs: { initial: theirs, acts: rivalActs },
  order: ['mine', 'mine', 'mine', 'mine', 'mine', 'theirs', 'theirs', 'theirs'],
  life: [{ at: 0, lp: [8000, 8000] }],
  nameOf: (code) => `Carta ${code}`,
  result: { winner: 1, reason: 'lp' },
  now: new Date('2026-10-29T12:00:00Z'),
}
const replay = buildDuelReplay(input)
const scenes = [...replayScenes(replay, 720)]
const last = scenes.at(-1)!
const inside = (inner: Rect, outer: Rect) => inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01 && inner.x + inner.w <= outer.x + outer.w + 0.01 && inner.y + inner.h <= outer.y + outer.h + 0.01
const cardIn = (scene: Scene, side: 0 | 1, rect: Rect) => scene.sides[side].slots.find((slot) => slot.card && slot.rect.x === rect.x && slot.rect.y === rect.y)?.card

describe('el diseño del cuadro', () => {
  it('es 9:16, la mesa entra centrada entre las dos manos y 1080 es 720 por 1,5', () => {
    const layout = videoLayout(720)
    expect(VIDEO_HEIGHT_OF(720)).toBe(1280)
    expect(VIDEO_HEIGHT_OF(1080)).toBe(1920)
    const first = layout.cellAt(0, 0)
    const end = layout.cellAt(6, 4)
    expect(first.x).toBeCloseTo(720 - (end.x + end.w))
    expect(first.y).toBeGreaterThan(layout.theirHand.y + layout.theirHand.h)
    expect(end.y + end.h).toBeLessThan(layout.myHand.y)
    expect(layout.myHand.y + layout.myHand.h).toBeLessThan(layout.text.y)
    expect(layout.footer.y + layout.footer.h).toBeLessThanOrEqual(1280)
    expect(videoLayout(1080).cellAt(6, 4)).toEqual({ x: end.x * 1.5, y: end.y * 1.5, w: end.w * 1.5, h: end.h * 1.5 })
  })

  it('las cartas de la mano entran en su franja: separadas si son pocas, encimadas si son muchas', () => {
    const area = videoLayout(720).myHand
    expect(handRects(area, 0)).toEqual([])
    const few = handRects(area, 3)
    expect(few[1]!.x).toBeGreaterThan(few[0]!.x + few[0]!.w)
    const many = handRects(area, 20)
    expect(many.every((rect) => inside(rect, area))).toBe(true)
    expect(many[1]!.x).toBeLessThan(many[0]!.x + many[0]!.w)
  })
})

describe('la escena de cada jugada', () => {
  it('hay una por jugada, más la mesa al empezar', () => {
    expect(scenes).toHaveLength(replay.steps.length + 1)
    expect(scenes[0]!.stepText).toBe('')
    expect(scenes[0]!.focus).toEqual([])
  })

  it('pone cada carta en su casilla: lo mío abajo y derecho, lo del rival arriba, espejado y de cabeza; lo colocado, de dorso', () => {
    const layout = last.layout
    const summoned = cardIn(last, 0, layout.cellAt(4, 0))
    expect(summoned).toMatchObject({ id: replay.steps[1]![1].type === 'place' ? replay.steps[1]![1].id : '', faceDown: false, sideways: false, upsideDown: false, name: 'Carta 14558127' })
    // El arte va por el proxy (del mismo origen: el lienzo se puede leer).
    expect(summoned?.art).toMatch(/^\/api\/card-image\/cards_small\/14558127\.jpg\?w=128$/)
    expect(cardIn(last, 0, layout.cellAt(5, 0))).toMatchObject({ faceDown: true, sideways: false, art: null, name: '' })
    // La zona 3 del rival (índice 2) queda en la columna del medio; en defensa, acostada.
    expect(cardIn(last, 1, layout.cellAt(2, 2))).toMatchObject({ id: 'c6', faceDown: false, sideways: true, upsideDown: true, name: 'Carta 55144522' })
  })

  it('las pilas llevan cuántas cartas tienen y el deck va de dorso', () => {
    const deckSlot = last.sides[0].slots.find((slot) => slot.rect.x === last.layout.cellAt(6, 4).x && slot.rect.y === last.layout.cellAt(6, 4).y)!
    expect(deckSlot.count).toBe(duelReplayAt(replay, replay.steps.length).states[0].deck.length)
    expect(deckSlot.card?.faceDown).toBe(true)
  })

  it('la mano propia va boca arriba sólo con «mi mano»; la del rival, siempre de dorso', () => {
    expect(last.sides[0].hand.every((slot) => slot.card?.faceDown)).toBe(true)
    const withHand = buildDuelReplay({ ...input, view: 'mine' })
    const end = [...replayScenes(withHand, 720)].at(-1)!
    expect(end.sides[0].hand.length).toBeGreaterThan(0)
    expect(end.sides[0].hand.every((slot) => !slot.card?.faceDown && slot.card?.art)).toBe(true)
    expect(end.sides[1].hand.every((slot) => slot.card?.faceDown)).toBe(true)
  })

  it('resalta lo que tocó la jugada y la cuenta con el texto del reproductor; a quién ataca, con su nombre', () => {
    const attack = last
    expect(attack.stepText).toBe('Beto: Atacás a Carta 14558127 con Carta 55144522')
    expect(attack.focus).toEqual([last.layout.cellAt(2, 2), last.layout.cellAt(4, 0)])
    // Un cambio de fase no resalta ninguna casilla (no hay fila de fases): lo dice su cartel, que sale de `matEffects`.
    expect(scenes[1]!.focus).toEqual([])
    expect(scenes[1]!.phase).toBe('main1')
    expect(scenes[1]!.effects?.banner).toMatchObject({ phase: 'main1' })
    expect(scenes[1]!).toMatchObject({ actor: 0, action: { type: 'phase', phase: 'main1' } })
  })

  it('sceneAt da lo mismo saltando que recorriendo', () => {
    const at = 4
    const before = duelReplayAt(replay, at - 1).states[replay.steps[at - 1]![0]]
    // `layout` lleva una función (`cellAt`): se compara todo lo demás.
    const plain = ({ layout, ...rest }: Scene) => ({ ...rest, cell: layout.cell })
    expect(plain(sceneAt(replay, duelReplayAt(replay, at), at, before, 720))).toEqual(plain(scenes[at]!))
  })
})

describe('las transiciones', () => {
  const motions = scenes.slice(1).map((scene, index) => transitionOf(scenes[index]!, scene))

  it('la carta que se mueve va de su lugar de antes al de después, con la curva de los vuelos de la mesa; lo que no cambia no se mueve', () => {
    // Jugada 2: invoco h0 de la mano a mi zona 1; las otras cartas de la mano se reacomodan.
    const summon = motions[1]!
    const placed = cardIn(scenes[2]!, 0, scenes[2]!.layout.cellAt(4, 0))!
    const move = summon.find((motion) => motion.key === `0:${placed.id}`)!
    expect(move.from).toEqual(placesOf(scenes[1]!).get(`0:${placed.id}`)!.pose)
    expect(move.to).toEqual(placesOf(scenes[2]!).get(`0:${placed.id}`)!.pose)
    expect(poseAt(move, 0)).toEqual(move.from)
    expect(poseAt(move, 1)).toEqual(move.to)
    const mid = poseAt(move, 0.5)
    expect((mid.y - move.from!.y) / (move.to.y - move.from!.y)).toBeCloseTo(easeInOut(0.5))
    // Lo del rival no se movió.
    expect(summon.every((motion) => motion.key.startsWith('0:'))).toBe(true)
    // Un cambio de fase no mueve nada.
    expect(motions[0]).toEqual([])
  })

  it('lo que sale de una pila arranca en la pila (el rival roba: del deck a la mano, de dorso)', () => {
    const deckRect = scenes[5]!.layout.cellAt(0, 0)
    const drawn = motions[5]!.find((motion) => motion.from && Math.abs(motion.from.x - (deckRect.x + deckRect.w / 2)) < 1 && Math.abs(motion.from.y - (deckRect.y + deckRect.h / 2)) < 1)
    expect(drawn?.to.y).toBeLessThan(deckRect.y)
    expect(drawn?.card.faceDown).toBe(true)
  })

  it('en la vista pública ningún cuadro muestra una carta que nadie mostró, ni durante una transición', () => {
    const hidden = [14559127, 14561127, 14562127, 14563127, 14564127].map(String)
    const faces = (cards: Motion['card'][]) => cards.flatMap((card) => [card.art ?? '', card.name])
    const all = [
      ...scenes.flatMap((scene) => faces(scene.sides.flatMap((side) => [...side.slots, ...side.hand].flatMap((slot) => (slot.card ? [slot.card] : []))))),
      ...motions.flat().flatMap((motion) => faces([motion.card, ...(motion.fromCard ? [motion.fromCard] : [])])),
      // La carta grande del centro.
      ...scenes.flatMap((scene) => Object.values(scene.spotlit ?? {}).flatMap((face) => [face.art ?? '', face.name])),
    ]
    expect(all.filter((text) => hidden.some((code) => text.includes(code)))).toEqual([])
    // Y lo que sí se mostró aparece (la prueba no pasa por no mirar nada).
    expect(all.some((text) => text.includes('14558127'))).toBe(true)
  })

  it('el ataque cruza del atacante a su objetivo; el rival que roba no se muestra grande (en un duelo sólo activar, mostrar y declarar); las vidas cuentan', () => {
    const fx = (index: number) => overlaysOf(scenes[index - 1]!, scenes[index]!, [], fakeAssets, 1, 0, 'duel').map((overlay) => overlay.kind)
    expect(fx(replay.steps.length)).toEqual(['attack'])
    expect(fx(6)).toEqual([])
    expect(fx(4)).toEqual(['stage'])
    // 8000 → 7000 de mi lado: cuenta como en la mesa (`lifeMs`), con «−1000» abajo.
    const hit = { ...last, sides: [{ ...last.sides[0], lp: 7000 }, last.sides[1]] as Scene['sides'] }
    const life = lifeOf(last, hit, 1)!
    expect(life(0)).toEqual([8000, 8000])
    expect(life(200)![0]).toBeLessThan(8000)
    expect(life(lifeMs(-1000))).toBeNull()
    expect(lifeOf(last, last, 1)).toBeNull()
    expect(overlaysOf(scenes.at(-2)!, hit, [], fakeAssets, 1, 0, 'duel').map((overlay) => overlay.kind)).toContain('delta')
  })
})

describe('los tiempos y el nombre del archivo', () => {
  const subject = { kind: 'duel', replay } as const
  it('«Rápido (2×)»: cada jugada a la mitad; el principio y el cierre, igual', () => {
    const normal = frameDurations(subject, 1)
    const fast = frameDurations(subject, 2)
    expect(fast[2]).toBe(STEP_MS / 2)
    expect(fast.at(-1)).toBe(OUTRO_MS)
    expect(fast[0]).toBe(INTRO_MS)
    expect(fast.at(-1)).toBe(OUTRO_MS)
    expect(videoDurationMs(subject, 2)).toBe(fast.reduce((sum, ms) => sum + ms, 0))
    expect(fast.slice(1, -1)).toEqual(normal.slice(1, -1).map((ms) => ms / 2))
  })

  it('la mesa al empezar, cada jugada (las fases más rápido), el cierre con el resultado; a cuadros constantes', () => {
    const durations = frameDurations(subject)
    expect(durations).toHaveLength(replay.steps.length + 2)
    expect(durations[0]).toBe(INTRO_MS)
    expect(durations[1]).toBeLessThan(STEP_MS)
    expect(durations[2]).toBe(STEP_MS)
    expect(durations.at(-2)).toBe(STEP_MS)
    expect(durations.at(-1)).toBe(OUTRO_MS)
    expect(frameDurations({ kind: 'duel', replay: { ...replay, steps: [] } })).toEqual([INTRO_MS + OUTRO_MS])
    // 30 cuadros por segundo, sin que el redondeo se acumule: el cuadro de cada momento sale de la cuenta desde el principio.
    expect(FPS).toBe(30)
    expect(frameOf(1000)).toBe(30)
    expect(frameOf(videoDurationMs(subject))).toBe(Math.round((videoDurationMs(subject) * 30) / 1000))
    expect(frameOf(400) + (frameOf(1300) - frameOf(400))).toBe(frameOf(1300))
  })

  it('el archivo se llama como el duelo, con la fecha', () => {
    expect(videoFileName(subject)).toBe('Ana-vs-Beto-2026-10-29.mp4')
    expect(videoFileName({ kind: 'duel', replay: { ...replay, players: ['', ''] } })).toBe('Duelista-vs-Rival-2026-10-29.mp4')
  })
})

describe('el soporte de WebCodecs', () => {
  const fake = (answer: (codec: string) => boolean | Error) => ({
    VideoFrame: class {},
    VideoEncoder: {
      isConfigSupported: async (config: VideoEncoderConfig) => {
        const value = answer(config.codec)
        if (value instanceof Error) throw value
        return { supported: value, config }
      },
    },
  })

  it('sin WebCodecs no hay video (y se dice por qué)', async () => {
    expect(await videoSupport({})).toEqual({ ok: false, reason: 'webcodecs' })
    expect(await videoSupport({ VideoEncoder: fake(() => true).VideoEncoder })).toEqual({ ok: false, reason: 'webcodecs' })
  })

  it('usa el primer perfil H.264 que acepta, y si ninguno, avisa', async () => {
    expect(await videoSupport(fake((codec) => codec.startsWith('avc1.42')))).toEqual({ ok: true, codec: 'avc1.42e028' })
    expect(await videoSupport(fake((codec) => (codec === 'avc1.640028' ? new Error('no') : codec === 'avc1.4d0028')))).toEqual({ ok: true, codec: 'avc1.4d0028' })
    expect(await videoSupport(fake(() => false))).toEqual({ ok: false, reason: 'h264' })
  })
})

describe('el MP4', () => {
  const boxes = (data: Uint8Array, from = 0, to = data.length) => {
    const view = new DataView(data.buffer, data.byteOffset)
    const out: { type: string; at: number; size: number }[] = []
    for (let at = from; at < to; ) {
      const size = view.getUint32(at)
      out.push({ type: new TextDecoder().decode(data.subarray(at + 4, at + 8)), at, size })
      at += size
    }
    return out
  }
  const find = (data: Uint8Array, type: string) => {
    const at = new TextDecoder('latin1').decode(data).indexOf(type) - 4
    return { at, view: new DataView(data.buffer, data.byteOffset + Math.max(0, at)) }
  }
  const avcC = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 0])
  const samples = [
    { data: new Uint8Array([1, 2, 3]), timestamp: 0, duration: 2_000_000, key: true },
    { data: new Uint8Array([4, 5]), timestamp: 2_000_000, duration: 900_000, key: false },
    { data: new Uint8Array([6]), timestamp: 2_900_000, duration: 900_000, key: false },
    { data: new Uint8Array([7, 8, 9, 10]), timestamp: 3_800_000, duration: 3_000_000, key: true },
  ]
  const file = (() => {
    const parts = muxMp4({ width: 720, height: 1280, avcC, colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false } }, samples)
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let at = 0
    for (const part of parts) {
      out.set(part, at)
      at += part.length
    }
    return out
  })()

  it('ftyp, moov adelante y mdat con los cuadros, en orden', () => {
    const top = boxes(file)
    expect(top.map((box) => box.type)).toEqual(['ftyp', 'moov', 'mdat'])
    expect(top.reduce((sum, box) => sum + box.size, 0)).toBe(file.length)
    const mdat = top[2]!
    expect([...file.subarray(mdat.at + 8)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    // stco apunta al primer byte de los cuadros.
    expect(find(file, 'stco').view.getUint32(16)).toBe(mdat.at + 8)
  })

  it('cada cuadro dura lo suyo (stts, en 90 kHz), los clave en stss y la duración total en mvhd', () => {
    const stts = find(file, 'stts').view
    expect(stts.getUint32(12)).toBe(3)
    expect([stts.getUint32(16), stts.getUint32(20), stts.getUint32(24), stts.getUint32(28), stts.getUint32(32), stts.getUint32(36)]).toEqual([1, 180_000, 2, 81_000, 1, 270_000])
    const stss = find(file, 'stss').view
    expect([stss.getUint32(12), stss.getUint32(16), stss.getUint32(20)]).toEqual([2, 1, 4])
    expect(find(file, 'mvhd').view.getUint32(24)).toBe(6800)
    expect(find(file, 'ctts').at).toBe(-5)
    expect(find(file, 'colr').view.getUint16(12)).toBe(1)
  })
})
