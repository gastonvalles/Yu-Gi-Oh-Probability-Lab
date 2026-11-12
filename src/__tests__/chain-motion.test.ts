import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { ACT_AT, CLOSE_MS, cuesBetween, LINK_MS, play, READ_MS, RELEASE_AT, resolveSchedule, type Clock, type ScheduleStep } from '../app/chain-motion'

// La cadena animada (Gastón, 2026-11-10: «las cadenas son justamente cadenas y cada efecto es un eslabón»): la secuencia es pura y se prueba con un reloj de mentira.

/** Un reloj que avanza a mano. */
function fakeClock() {
  let now = 0
  let timers: Array<{ id: number; at: number; run: () => void }> = []
  let next = 1
  const clock: Clock = {
    setTimeout: (run, ms) => (timers.push({ id: next, at: now + ms, run }), next++),
    clearTimeout: (id) => void (timers = timers.filter((timer) => timer.id !== id)),
  }

  return {
    clock,
    now: () => now,
    advance: (ms: number) => {
      const end = now + ms

      for (let due = timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at); due.length > 0; due = timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at)) {
        const timer = due[0]!

        timers = timers.filter((item) => item !== timer)
        now = timer.at
        timer.run()
      }
      now = end
    },
  }
}

describe('la cadena: la secuencia de resolver', () => {
  it('tres eslabones se resuelven de atrás para adelante en 2,45 s: 750 ms cada uno y 200 de cierre; uno negado suma 1,6 s para leerlo', () => {
    const run = (fates: Parameters<typeof resolveSchedule>[0]) => {
      const { steps, total } = resolveSchedule(fates)
      const time = fakeClock()
      const seen: Array<[number, string]> = []

      play(steps, (step: ScheduleStep) => seen.push([time.now(), 'done' in step ? 'fin' : `CL${step.link} ${step.state}`]), time.clock)
      time.advance(total)
      return { total, seen }
    }

    expect(run(['solved', 'solved', 'solved']).total).toBe(2450)
    const { total, seen } = run(['solved', 'negated', 'solved'])

    expect(total).toBe(3 * LINK_MS + READ_MS + CLOSE_MS)
    expect(seen).toEqual([
      [0, 'CL3 solving'],
      [ACT_AT, 'CL3 solved'],
      [LINK_MS, 'CL2 solving'],
      [LINK_MS + ACT_AT, 'CL2 negated'],
      [2 * LINK_MS + READ_MS, 'CL1 solving'],
      [2 * LINK_MS + READ_MS + ACT_AT, 'CL1 solved'],
      [3 * LINK_MS + READ_MS, 'fin'],
    ])
  })

  it('cada cambio de estado da sus pasos: encaja, se tensa a los 120, ejecuta a los 320, se suelta a los 480 y se va a los 750; terminada, se disuelve', () => {
    const at = (cues: ReturnType<typeof cuesBetween>) => cues.map(({ at, cue }) => `${at} ${cue.kind}${'link' in cue ? ` CL${cue.link}` : ''}`)

    expect(at(cuesBetween([{ number: 1, state: 'chained' }], [{ number: 1, state: 'chained' }, { number: 2, state: 'chained' }]))).toEqual(['0 enter CL2', '300 entered CL2'])
    expect(at(cuesBetween([{ number: 1, state: 'chained' }], [{ number: 1, state: 'solving' }]))).toEqual(['120 pull CL1', '320 act CL1', '320 pulled CL1'])
    // El estado final llega a los ACT_AT de empezar: se suelta a los RELEASE_AT y se va justo cuando empieza el siguiente; lo negado o sin efecto, READ_MS más tarde (se lee).
    const release = (state: 'solved' | 'negated' | 'disabled') => cuesBetween([{ number: 1, state: 'solving' }], [{ number: 1, state }]).map(({ at, cue }) => [ACT_AT + at, cue.kind])

    expect(release('solved')).toEqual([
      [RELEASE_AT, 'release'],
      [LINK_MS, 'gone'],
    ])
    for (const state of ['negated', 'disabled'] as const) {
      expect(release(state)).toEqual([
        [RELEASE_AT + READ_MS, 'release'],
        [LINK_MS + READ_MS, 'gone'],
      ])
    }
    expect(at(cuesBetween([{ number: 1, state: 'solved' }], [{ number: 1, state: 'solved' }], true, false))).toEqual(['0 dissolve'])
    // Montada ya resuelta (abrir la pila después): lo resuelto no está y nada entra.
    expect(at(cuesBetween(null, [{ number: 1, state: 'solved' }, { number: 2, state: 'chained' }]))).toEqual(['0 gone CL1'])
  })

  it('tocar la mesa termina la cadena de una: lo que falta pasa ya y en orden', () => {
    const { steps } = resolveSchedule(['solved', 'disabled'])
    const time = fakeClock()
    const seen: string[] = []
    const run = play(steps, (step) => seen.push('done' in step ? 'fin' : `CL${step.link} ${step.state}`), time.clock)

    time.advance(100)
    run.finish()
    time.advance(5000)
    expect(seen).toEqual(['CL2 solving', 'CL2 disabled', 'CL1 solving', 'CL1 solved', 'fin'])
  })
})

describe('la cadena anima sólo `transform` y `opacity`', () => {
  const SRC = path.resolve(__dirname, '..')
  const css = readFileSync(path.join(SRC, 'index.css'), 'utf8')
  const files = ['components/auto/chain-parts.tsx', 'components/auto/ChainNotice.tsx', 'components/probability/MatFx.tsx', 'components/playground/sections/ChainProposal.tsx']
  const CHAIN = ['link-in', 'lift', 'act', 'seg-in', 'seg-num-in', 'glow-in', 'rise', 'pull-l', 'pull-r', 'split-a', 'split-b', 'split-fade', 'slide-off', 'slash-in', 'fade-out']

  it('cada `animate-*` de la cadena existe en `@theme` y su `@keyframes` sólo toca transform y opacity; cada uso lleva `motion-reduce:animate-none`', () => {
    const used = new Set(files.flatMap((file) => [...readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').matchAll(/(?<![\w:-])animate-([a-z][a-z0-9-]*)/g)].map((match) => match[1]!)).filter((name) => CHAIN.includes(name)))

    expect([...used].sort()).toEqual([...CHAIN].sort())
    for (const name of used) {
      const keyframes = new RegExp(`--animate-${name}:\\s*([a-z-]+)\\s`).exec(css)?.[1]

      expect(keyframes, name).toBeDefined()
      const body = new RegExp(`@keyframes ${keyframes} \\{([\\s\\S]*?)\\n  \\}`).exec(css)?.[1] ?? ''
      const props = new Set([...body.matchAll(/^\s*([a-z-]+):/gm)].map((match) => match[1]!))

      expect(props.size, name).toBeGreaterThan(0)
      for (const prop of props) expect(['transform', 'opacity'], `${name}: ${prop}`).toContain(prop)
    }
    // Cada clase de la cadena va con su apagado: sin movimiento, nada se mueve.
    for (const file of files.slice(0, 2)) {
      const code = readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

      for (const match of code.matchAll(/'([^'\n]*\banimate-(?:link-in|rise|pull-l|pull-r|split-a|split-b|split-fade|slide-off|slash-in|glow-in|fade-out)\b[^'\n]*)'/g)) expect(match[1], file).toContain('motion-reduce:animate-none')
    }
  })
})
