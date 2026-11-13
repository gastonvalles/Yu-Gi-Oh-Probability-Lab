import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { CHAIN_ALONE_MS, CHAIN_LEAVE_MS, CHAIN_LINK_MS, CHAIN_SOLVE_MS, chainFeed } from '../app/auto/chain-feed'
import { buildDuelReplay, replayChainSteps, type ReplayChainStep, type ReplayInput } from '../app/duel-replay'
import { createMatState } from '../app/practice-mat'
import { LAYOUT } from '../components/auto/ChainNotice'
import { BACK_POSE, CHAIN_TILT, tiltPoint, chainOverlays, chainSnapshots, drawMedal, medalTracks, MEDAL, poseOfClasses, STAGE_MS, stageBox, stageEpisodes, stagePoseOf, START_POSE } from '../components/replays/video/video-chain'
import { overlaysOf } from '../components/replays/video/video-fx'
import { cellsOf, fieldRect, placeRect, replayScenes, videoLayout } from '../components/replays/video/video-scene'
import { chainBeats, chainMs, chainTimeline, frameDurations, INTRO_MS, OUTRO_MS, paceOf, STEP_MS, VIDEO_PACE, videoDurationMs } from '../components/replays/video/video-timeline'
import { fakeAssets, fakeCtx } from './support/video-fakes'

// El duelo del reproductor (`duel-replay-ui.test.tsx`): activo algo, el rival encadena, se resuelve del último al primero; después el rival pasa a su Standby Phase.
const mine = createMatState(Array.from({ length: 20 }, (_, i) => `card-${14558127 + (i % 7) * 1000}-${Math.floor(i / 7) + 1}`), [], 5)
const h0 = mine.hand[0]!
const TWO_LINKS: ReplayChainStep[] = [
  { at: 1, kind: 'chain', index: 0, link: { code: 14558127, side: 0, place: [0, 8, 0] } },
  { at: 1, kind: 'chain', index: 1, link: { code: 55144522, side: 1, place: [1, 4, 2] } },
  { at: 1, kind: 'solving', index: 1 },
  { at: 1, kind: 'solved', index: 1 },
  { at: 1, kind: 'solving', index: 0 },
  { at: 1, kind: 'solved', index: 0 },
  { at: 1, kind: 'end', index: -1 },
]
const input = (chain?: ReplayChainStep[]): ReplayInput => ({
  mode: 'solo-auto',
  view: 'public',
  players: ['Ana', 'Beto'],
  starter: 0,
  mine: { initial: mine, actions: [{ type: 'activate', id: h0 }] },
  theirs: { initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5), acts: [{ action: { type: 'phase', phase: 'standby' }, reveal: {} }] },
  order: ['mine', 'theirs'],
  life: [{ at: 0, lp: [8000, 8000] }],
  nameOf: (code) => `Carta ${code}`,
  ...(chain ? { chain } : {}),
})
const withChain = buildDuelReplay(input(TWO_LINKS))
const without = buildDuelReplay(input())
const steps = replayChainSteps(withChain, 0)

describe('la cadena en la línea de tiempo del video', () => {
  it('cuenta la cadena de una jugada como el reproductor: cada eslabón que entra 0,7 s, cada uno que se resuelve 0,9 s, y el último mensaje sin esperar', () => {
    expect(chainBeats(steps, 1)).toEqual([
      { at: 0, from: 0, seen: 1 },
      { at: CHAIN_LINK_MS, from: 0, seen: 2 },
      // El CL2 se resuelve (su `solving` y su `solved` juntos)…
      { at: 2 * CHAIN_LINK_MS, from: 0, seen: 4 },
      // …y el CL1, con el final.
      { at: 2 * CHAIN_LINK_MS + CHAIN_SOLVE_MS, from: 0, seen: 6 },
      { at: 2 * CHAIN_LINK_MS + 2 * CHAIN_SOLVE_MS, from: 0, seen: 7 },
    ])
    expect(chainMs(steps, 1)).toBe(2 * CHAIN_LINK_MS + 2 * CHAIN_SOLVE_MS)
    // La jugada siguiente no trae mensajes: la cadena (ya terminada) sigue como estaba y no suma nada.
    expect(chainBeats(steps, 2)).toEqual([{ at: 0, from: 7, seen: 7 }])
    expect(chainMs(steps, 2)).toBe(0)
  })

  it('una activación sola dura 1 s en total, como en la mesa', () => {
    const alone = replayChainSteps(buildDuelReplay(input([TWO_LINKS[0]!, { at: 1, kind: 'solving', index: 0 }, { at: 1, kind: 'solved', index: 0 }, { at: 1, kind: 'end', index: -1 }])), 0)
    expect(chainMs(alone, 1)).toBe(CHAIN_ALONE_MS)
  })

  it('la jugada con cadena dura lo suyo más la cadena (a 2×, todo a la mitad); sin cadena, nada cambia', () => {
    // Todo a `VIDEO_PACE` (1,25×); «Rápido (2×)», al doble de eso.
    const plain = frameDurations({ kind: 'duel', replay: without })
    expect(plain).toEqual([INTRO_MS, 720, 320, OUTRO_MS])
    expect(frameDurations({ kind: 'duel', replay: withChain })).toEqual([INTRO_MS, (STEP_MS + chainMs(steps, 1)) / VIDEO_PACE, 320, OUTRO_MS])
    expect(frameDurations({ kind: 'duel', replay: withChain }, paceOf(2))).toEqual([INTRO_MS, (STEP_MS + chainMs(steps, 1)) / 2.5, 160, OUTRO_MS])
    expect(videoDurationMs({ kind: 'duel', replay: withChain }) - videoDurationMs({ kind: 'duel', replay: without })).toBe(2560)
    expect(chainBeats(replayChainSteps(without, 0), 1)).toEqual([])
  })

  it('cuándo entra la escena y cuándo cada medallón, en ms de video', () => {
    const durations = frameDurations({ kind: 'duel', replay: withChain })
    const starts = durations.reduce<number[]>((list, ms) => [...list, list.at(-1)! + ms], [0])
    const timeline = chainTimeline(steps, starts)
    const feedAt = (t: number) => chainFeed(steps, timeline.filter((beat) => beat.t <= t).at(-1)?.seen ?? 0)

    // Los tiempos de la mesa (0,7 · 1,4 · 2,3 · 3,2 s) a `VIDEO_PACE`.
    expect(timeline.map((beat) => beat.t)).toEqual([INTRO_MS, INTRO_MS + 560, INTRO_MS + 1120, INTRO_MS + 1840, INTRO_MS + 2560, starts[2]])
    // Al empezar la jugada, el CL1 armado; después, el CL2; después empieza a resolverse (la escena se va y salen los medallones); al final, nada.
    expect(feedAt(INTRO_MS)?.rows.map((row) => row.state)).toEqual(['chained'])
    expect(feedAt(INTRO_MS + 560)?.rows.map((row) => row.state)).toEqual(['chained', 'chained'])
    expect(feedAt(INTRO_MS + 1120)).toMatchObject({ resolving: true, current: 1 })
    expect(feedAt(INTRO_MS + 1840)).toMatchObject({ resolving: true, current: 0 })
    expect(feedAt(INTRO_MS + 2560)).toMatchObject({ done: true })
    // A 2×, a la mitad.
    const fast = frameDurations({ kind: 'duel', replay: withChain }, paceOf(2)).reduce<number[]>((list, ms) => [...list, list.at(-1)! + ms], [0])
    expect(chainTimeline(steps, fast, paceOf(2)).map((beat) => beat.t)).toEqual([INTRO_MS, INTRO_MS + 280, INTRO_MS + 560, INTRO_MS + 920, INTRO_MS + 1280, fast[2]])
  })
})

const startsOf = (durations: number[]) => durations.reduce<number[]>((list, ms) => [...list, list.at(-1)! + ms], [0])

describe('la escena de la cadena en el video', () => {
  const starts = startsOf(frameDurations({ kind: 'duel', replay: withChain }))

  it('se mueve con las clases de `ChainStage` (los lugares del celular) y con sus tiempos', () => {
    const deg = (value: number) => (value * Math.PI) / 180
    // Con su inclinación 3D (`chain-tilt-front`, `chain-tilt-back-flip`…).
    expect(poseOfClasses(LAYOUT.narrow.left.depth[0]!)).toEqual({ x: -0.4, y: 0.5, rotate: deg(-8), scale: 1.4, opacity: 1, tiltX: deg(10), tiltY: deg(-7) })
    expect(poseOfClasses(LAYOUT.narrow.right.depth[3]!)).toEqual({ x: -0.1, y: -0.75, rotate: deg(-3), scale: 0.6, opacity: 1, tiltX: deg(-8), tiltY: deg(-6) })
    expect(START_POSE).toEqual({ x: 0, y: 0, rotate: 0, scale: 1.5, opacity: 0, tiltX: 0, tiltY: 0 })
    expect(BACK_POSE).toEqual({ x: 0, y: -1, rotate: 0, scale: 0.5, opacity: 0, tiltX: 0, tiltY: 0 })
    // Impar a la izquierda, par a la derecha; desde el quinto lugar, se va hacia arriba.
    expect(stagePoseOf(0, 1).x).toBeLessThan(0)
    expect(stagePoseOf(0, 2).x).toBeGreaterThan(0)
    expect(stagePoseOf(4, 5)).toBe(BACK_POSE)
    // Las clases y los tiempos que copia el video siguen en `ChainStage`.
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'auto', 'ChainNotice.tsx'), 'utf8')
    for (const text of ['starting:translate-x-0 starting:translate-y-0 starting:rotate-0 starting:scale-150 starting:opacity-0', "'-translate-y-full scale-50 opacity-0'", `duration-${STAGE_MS.move}`, `delay-${STAGE_MS.newest} duration-${STAGE_MS.word}`, `'delay-${STAGE_MS.newest}'`, `delay-${STAGE_MS.bondDelay}`, 'left-1/3 top-2/7 aspect-[421/614] w-1/3', 'aspect-3/4 h-full max-w-full', 'top-2/5', 'bg-chain-veil/65', 'bg-chain-veil/45']) expect(source).toContain(text)
  })

  it('cada carta lleva la inclinación 3D de la mesa (`chain-tilt-*` de `index.css`, con su perspectiva): la de adelante se ve más ancha abajo y más alta del lado que se acerca', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.css'), 'utf8')
    const [fx, fy] = CHAIN_TILT.front
    const [bx, by] = CHAIN_TILT.back
    for (const [name, x, y] of [['front', fx, fy], ['back', bx, by], ['front-flip', fx, -fy], ['back-flip', bx, -by]] as const)
      expect(css).toMatch(new RegExp(`@utility chain-tilt-${name} \\{\\s*transform: perspective\\(56rem\\) rotateX\\(${x}deg\\) rotateY\\(${y}deg\\);`))
    const { tiltX, tiltY } = poseOfClasses('chain-tilt-front')
    const at = (x: number, y: number) => tiltPoint(x, y, tiltX, tiltY, 896)
    // Una carta de 100 × 146: rotateX(10°) acerca el borde de abajo (más ancho que el de arriba) y rotateY(−7°), el de la derecha (más alto que el de la izquierda).
    expect(at(50, 73)[0] - at(-50, 73)[0]).toBeGreaterThan(at(50, -73)[0] - at(-50, -73)[0])
    expect(at(50, 73)[1] - at(50, -73)[1]).toBeGreaterThan(at(-50, 73)[1] - at(-50, -73)[1])
    expect(at(0, 0)).toEqual([0, 0])
  })

  it('va sobre el campo, de su alto y 3:4, centrada', () => {
    const layout = videoLayout(720)
    const field = fieldRect(cellsOf(layout, 5))
    const box = stageBox(layout)
    expect(box.h).toBeCloseTo(field.h)
    expect(box.w / box.h).toBeCloseTo(3 / 4)
    expect(box.x + box.w / 2).toBeCloseTo(field.x + field.w / 2)
  })

  it('entra con la jugada, suma el CL2 a los 0,7 s, empieza a irse cuando se resuelve y se va en `CHAIN_LEAVE_MS`', () => {
    const [episode, ...more] = stageEpisodes(chainSnapshots(steps, starts, 1), starts.at(-1)!, 1)
    expect(more).toEqual([])
    expect(episode).toMatchObject({ start: INTRO_MS, mounts: [INTRO_MS, INTRO_MS + CHAIN_LINK_MS], over: INTRO_MS + 2 * CHAIN_LINK_MS, end: INTRO_MS + 2 * CHAIN_LINK_MS + CHAIN_LEAVE_MS })
    expect(episode!.rows.map((row) => row.number)).toEqual([1, 2])
    // A 2×, todo a la mitad.
    const fast = startsOf(frameDurations({ kind: 'duel', replay: withChain }, 2))
    expect(stageEpisodes(chainSnapshots(steps, fast, 2), fast.at(-1)!, 2)[0]).toMatchObject({ mounts: [INTRO_MS, INTRO_MS + 350], over: INTRO_MS + 700, end: INTRO_MS + 800 })
  })

  it('pinta cada momento sin romperse y, sin cadena, no hay escena', () => {
    const stage = chainOverlays(withChain, starts, 1, videoLayout(720), fakeAssets).find((overlay) => overlay.kind === 'chain')
    expect(stage).toMatchObject({ kind: 'chain', start: INTRO_MS, duration: 2 * CHAIN_LINK_MS + CHAIN_LEAVE_MS })
    for (const p of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
      const ctx = fakeCtx()
      stage!.draw(ctx, p)
      expect(ctx.calls).toBeGreaterThan(0)
    }
    expect(chainOverlays(without, startsOf(frameDurations({ kind: 'duel', replay: without })), 1, videoLayout(720), fakeAssets)).toEqual([])
  })

  it('con la cadena guardada, lo que se activa no sale grande (lo dice la escena); sin ella, sí', () => {
    const scenes = [...replayScenes(withChain, 720)]
    expect(overlaysOf(scenes[0]!, scenes[1]!, [], fakeAssets, 1, 0, 'duel').map((overlay) => overlay.kind)).toContain('stage')
    expect(overlaysOf(scenes[0]!, scenes[1]!, [], fakeAssets, 1, 0, 'duel', true).map((overlay) => overlay.kind)).not.toContain('stage')
  })
})

describe('los medallones en el video', () => {
  const starts = startsOf(frameDurations({ kind: 'duel', replay: withChain }))
  const layout = videoLayout(720)

  it('van donde se activó cada eslabón: el CL1 en mi Zona de Mágicas 1, el CL2 en la Zona de Monstruos 3 del rival (espejada), en las casillas de la mesa del celular', () => {
    const [cl1, cl2] = [...medalTracks(chainSnapshots(steps, starts, 1))].sort((a, b) => a.number - b.number)
    expect(cl1).toMatchObject({ side: 0, place: 'st:0' })
    expect(cl2).toMatchObject({ side: 1, place: 'mz:2' })
    expect(placeRect(layout, cl1!.side, cl1!.place)).toEqual(layout.cellAt(4, 1))
    expect(placeRect(layout, cl2!.side, cl2!.place)).toEqual(layout.cellAt(1, 3))
  })

  it('cada lugar de la mesa (zonas, Zonas Extra, pilas y mano) cae donde el video pone sus cartas', () => {
    const last = [...replayScenes(withChain, 720)].at(-1)!
    for (const side of [0, 1] as const) {
      const pileAt = (pile: string) => last.sides[side].slots.find((slot) => slot.pile === pile)!.rect
      for (const pile of ['deck', 'extra', 'gy', 'banished']) expect(placeRect(layout, side, pile)).toEqual(pileAt(pile))
      expect(placeRect(layout, side, 'mz:0')).toEqual(layout.cellAt(side === 0 ? 3 : 1, side === 0 ? 1 : 5))
      expect(placeRect(layout, side, 'st:4')).toEqual(layout.cellAt(side === 0 ? 4 : 0, side === 0 ? 5 : 1))
      expect(placeRect(layout, side, 'field')).toEqual(layout.cellAt(side === 0 ? 3 : 1, side === 0 ? 0 : 6))
      expect(placeRect(layout, side, 'hand')).toEqual(side === 0 ? layout.myHand : layout.theirHand)
    }
    // La Zona Extra 1 tuya es la 2 del rival (`SharedZone`): la misma casilla.
    expect(placeRect(layout, 0, 'emz:0')).toEqual(placeRect(layout, 1, 'emz:1'))
    expect(placeRect(layout, 0, 'emz:0')).toEqual(layout.cellAt(2, 2))
    expect(placeRect(layout, 0, 'nada')).toBeNull()
  })

  it('salen al empezar a resolverse, del último al primero: el CL2 late y se va a los 0,9 s, el CL1 late después y se va al terminar', () => {
    const [cl1, cl2] = [...medalTracks(chainSnapshots(steps, starts, 1))].sort((a, b) => a.number - b.number)
    const resolve = INTRO_MS + 2 * CHAIN_LINK_MS
    expect(cl2).toMatchObject({ enter: resolve, leave: resolve + CHAIN_SOLVE_MS, resolving: [{ t: resolve, on: true }], xs: [{ t: resolve, x: 0 }] })
    expect(cl1).toMatchObject({ enter: resolve, leave: resolve + 2 * CHAIN_SOLVE_MS, resolving: [{ t: resolve + CHAIN_SOLVE_MS, on: true }] })
    // Una capa mientras se ven, que termina cuando se apagó el último.
    const medals = chainOverlays(withChain, starts, 1, layout, fakeAssets).filter((overlay) => overlay.kind === 'medal')
    expect(medals).toMatchObject([{ start: resolve, duration: 2 * CHAIN_SOLVE_MS + MEDAL.fade }])
    // Se pinta entrando, quieto, latiendo y yéndose; antes de entrar y después de irse, nada.
    const calls = (now: number) => {
      const ctx = fakeCtx()
      drawMedal(ctx, cl2!, now, layout, fakeAssets, 1)
      return ctx.calls
    }
    expect(calls(resolve - 1)).toBe(0)
    for (const now of [resolve + 30, resolve + 100, resolve + 600, resolve + CHAIN_SOLVE_MS + 100]) expect(calls(now)).toBeGreaterThan(0)
    expect(calls(resolve + CHAIN_SOLVE_MS + MEDAL.fade)).toBe(0)
  })
})