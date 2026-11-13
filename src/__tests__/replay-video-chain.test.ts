import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { CHAIN_ALONE_MS, CHAIN_LEAVE_MS, CHAIN_LINK_MS, CHAIN_SOLVE_MS, chainFeed } from '../app/auto/chain-feed'
import { buildDuelReplay, replayChainSteps, type ReplayChainStep, type ReplayInput } from '../app/duel-replay'
import { createMatState } from '../app/practice-mat'
import { LAYOUT } from '../components/auto/ChainNotice'
import { BACK_POSE, chainOverlays, chainSnapshots, poseOfClasses, STAGE_MS, stageBox, stageEpisodes, stagePoseOf, START_POSE } from '../components/replays/video/video-chain'
import { overlaysOf } from '../components/replays/video/video-fx'
import { cellsOf, fieldRect, replayScenes, videoLayout } from '../components/replays/video/video-scene'
import { chainBeats, chainMs, chainTimeline, frameDurations, INTRO_MS, OUTRO_MS, STEP_MS, videoDurationMs } from '../components/replays/video/video-timeline'
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
    const plain = frameDurations({ kind: 'duel', replay: without })
    expect(plain).toEqual([INTRO_MS, STEP_MS, 400, OUTRO_MS])
    expect(frameDurations({ kind: 'duel', replay: withChain })).toEqual([INTRO_MS, STEP_MS + chainMs(steps, 1), 400, OUTRO_MS])
    expect(frameDurations({ kind: 'duel', replay: withChain }, 2)).toEqual([INTRO_MS, (STEP_MS + chainMs(steps, 1)) / 2, 200, OUTRO_MS])
    expect(videoDurationMs({ kind: 'duel', replay: withChain }) - videoDurationMs({ kind: 'duel', replay: without })).toBe(3200)
    expect(chainBeats(replayChainSteps(without, 0), 1)).toEqual([])
  })

  it('cuándo entra la escena y cuándo cada medallón, en ms de video', () => {
    const durations = frameDurations({ kind: 'duel', replay: withChain })
    const starts = durations.reduce<number[]>((list, ms) => [...list, list.at(-1)! + ms], [0])
    const timeline = chainTimeline(steps, starts)
    const feedAt = (t: number) => chainFeed(steps, timeline.filter((beat) => beat.t <= t).at(-1)?.seen ?? 0)

    expect(timeline.map((beat) => beat.t)).toEqual([INTRO_MS, INTRO_MS + 700, INTRO_MS + 1400, INTRO_MS + 2300, INTRO_MS + 3200, starts[2]])
    // Al empezar la jugada, el CL1 armado; 0,7 s después, el CL2; a los 1,4 s empieza a resolverse (la escena se va y salen los medallones); al final, nada.
    expect(feedAt(INTRO_MS)?.rows.map((row) => row.state)).toEqual(['chained'])
    expect(feedAt(INTRO_MS + 700)?.rows.map((row) => row.state)).toEqual(['chained', 'chained'])
    expect(feedAt(INTRO_MS + 1400)).toMatchObject({ resolving: true, current: 1 })
    expect(feedAt(INTRO_MS + 2300)).toMatchObject({ resolving: true, current: 0 })
    expect(feedAt(INTRO_MS + 3200)).toMatchObject({ done: true })
    // A 2×, a la mitad.
    const fast = frameDurations({ kind: 'duel', replay: withChain }, 2).reduce<number[]>((list, ms) => [...list, list.at(-1)! + ms], [0])
    expect(chainTimeline(steps, fast, 2).map((beat) => beat.t)).toEqual([INTRO_MS, INTRO_MS + 350, INTRO_MS + 700, INTRO_MS + 1150, INTRO_MS + 1600, fast[2]])
  })
})

const startsOf = (durations: number[]) => durations.reduce<number[]>((list, ms) => [...list, list.at(-1)! + ms], [0])

describe('la escena de la cadena en el video', () => {
  const starts = startsOf(frameDurations({ kind: 'duel', replay: withChain }))

  it('se mueve con las clases de `ChainStage` (los lugares del celular) y con sus tiempos', () => {
    expect(poseOfClasses(LAYOUT.narrow.left.depth[0]!)).toEqual({ x: -0.4, y: 0.5, rotate: (-8 * Math.PI) / 180, scale: 1.4, opacity: 1 })
    expect(poseOfClasses(LAYOUT.narrow.right.depth[3]!)).toEqual({ x: -0.1, y: -0.75, rotate: (-3 * Math.PI) / 180, scale: 0.6, opacity: 1 })
    expect(START_POSE).toEqual({ x: 0, y: 0, rotate: 0, scale: 1.5, opacity: 0 })
    expect(BACK_POSE).toEqual({ x: 0, y: -1, rotate: 0, scale: 0.5, opacity: 0 })
    // Impar a la izquierda, par a la derecha; desde el quinto lugar, se va hacia arriba.
    expect(stagePoseOf(0, 1).x).toBeLessThan(0)
    expect(stagePoseOf(0, 2).x).toBeGreaterThan(0)
    expect(stagePoseOf(4, 5)).toBe(BACK_POSE)
    // Las clases y los tiempos que copia el video siguen en `ChainStage`.
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'auto', 'ChainNotice.tsx'), 'utf8')
    for (const text of ['starting:translate-x-0 starting:translate-y-0 starting:rotate-0 starting:scale-150 starting:opacity-0', "'-translate-y-full scale-50 opacity-0'", `duration-${STAGE_MS.move}`, `delay-${STAGE_MS.newest} duration-${STAGE_MS.word}`, `'delay-${STAGE_MS.newest}'`, `delay-${STAGE_MS.bondDelay}`, 'left-1/3 top-2/7 aspect-[421/614] w-1/3', 'aspect-3/4 h-full max-w-full', 'top-2/5', 'bg-chain-veil/65', 'bg-chain-veil/45']) expect(source).toContain(text)
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
    const [stage] = chainOverlays(withChain, starts, 1, videoLayout(720), fakeAssets)
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
