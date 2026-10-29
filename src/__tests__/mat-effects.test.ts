import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { matEffects } from '../app/mat-effects'
import { createMatState, replayMat, type MatAction } from '../app/practice-mat'

// Mano: a1, a2, b1 (una Magia), c1, d1. Deck: e1 y f1. Extra: x1 y x2.
const start = () => createMatState(['a1', 'a2', 'b1', 'c1', 'd1', 'e1', 'f1'], ['x1', 'x2'], 5)
const after = (actions: MatAction[]) => replayMat(start(), actions)
const place = (id: string, index: number, pos: 'atk' | 'def' | 'set' = 'atk', how?: 'normal' | 'special' | 'scale'): MatAction => ({ type: 'place', id, zone: 'mz', index, pos, how })

describe('los efectos de una jugada', () => {
  it('activar un efecto destaca la carta; revelar y declarar también, cada uno con su color', () => {
    expect(matEffects(start(), { type: 'activate', id: 'a1' })).toEqual({ spotlight: { id: 'a1', kind: 'activate' } })
    expect(matEffects(start(), { type: 'reveal', id: 'a1' })).toEqual({ spotlight: { id: 'a1', kind: 'reveal' } })
    expect(matEffects(start(), { type: 'declare', id: 'a1' })).toEqual({ spotlight: { id: 'a1', kind: 'declare' } })
    // Una carta que no existe (un combo guardado a mano o viejo) no destella.
    expect(matEffects(start(), { type: 'activate', id: 'zzz' })).toEqual({})
  })

  it('marcar un objetivo lo destaca; quitar la marca, no', () => {
    const marked = after([{ type: 'target', id: 'a1' }])

    expect(matEffects(start(), { type: 'target', id: 'a1' })).toEqual({ spotlight: { id: 'a1', kind: 'target' } })
    expect(matEffects(marked, { type: 'target', id: 'a1' })).toEqual({})
    expect(matEffects(start(), { type: 'target', id: 'zzz' })).toEqual({})
  })

  it('una Magia o Trampa que sale boca arriba se activa; colocada boca abajo, no', () => {
    expect(matEffects(start(), { type: 'place', id: 'b1', zone: 'st', index: 1, pos: 'atk' })).toEqual({ spotlight: { id: 'b1', kind: 'activate' } })
    expect(matEffects(start(), { type: 'place', id: 'b1', zone: 'field', index: 0, pos: 'atk' })).toEqual({ spotlight: { id: 'b1', kind: 'activate' } })
    expect(matEffects(start(), { type: 'place', id: 'b1', zone: 'st', index: 1, pos: 'set' })).toEqual({})

    // Dar vuelta una Magia colocada es activarla.
    const set = after([{ type: 'place', id: 'b1', zone: 'st', index: 1, pos: 'set' }])
    expect(matEffects(set, { type: 'position', id: 'b1', pos: 'atk' })).toEqual({ spotlight: { id: 'b1', kind: 'activate' } })
  })

  it('un monstruo que sale boca arriba a una zona cae con un destello: Normal desde la mano, Especial desde cualquier otro lado', () => {
    expect(matEffects(start(), place('a1', 2, 'atk', 'normal'))).toEqual({
      landing: { spot: 'mz', index: 2, tone: 'normal', flies: true },
      showcase: { ids: ['a1'], kind: 'normal' },
    })
    expect(matEffects(start(), place('a1', 2, 'def', 'special'))).toEqual({
      landing: { spot: 'mz', index: 2, tone: 'special', flies: true },
      showcase: { ids: ['a1'], kind: 'special' },
    })
    // Sin `how` (combos guardados antes): desde la mano es Normal y desde el cementerio, Especial.
    expect(matEffects(start(), place('a1', 0))).toMatchObject({ landing: { tone: 'normal' } })
    const milled = after([{ type: 'mill', count: 1 }])
    expect(matEffects(milled, place('e1', 0))).toMatchObject({ landing: { tone: 'special' } })
    // Desde el deck sale de dorso: se muestra dándose vuelta.
    expect(matEffects(start(), place('e1', 0, 'atk', 'special'))).toMatchObject({ showcase: { ids: ['e1'], kind: 'special', flip: true } })
  })

  it('Colocar boca abajo, mover una carta que ya está en el campo o soltar en una zona ocupada no destellan', () => {
    expect(matEffects(start(), place('a1', 0, 'set', 'normal'))).toEqual({})
    // Mover una Magia que ya está boca arriba de una zona a otra no es activarla.
    const spell = after([{ type: 'place', id: 'b1', zone: 'st', index: 1, pos: 'atk' }])
    expect(matEffects(spell, { type: 'place', id: 'b1', zone: 'st', index: 3, pos: 'atk' })).toEqual({})

    const onField = after([place('a1', 0)])
    expect(matEffects(onField, place('a1', 3))).toEqual({})
    expect(matEffects(onField, place('a2', 0))).toEqual({})
  })

  it('las invocaciones desde el Extra tienen el color de su tipo y salen de dorso, y los Sacrificios son una Invocación Normal', () => {
    const field = after([place('a1', 0), place('a2', 1)])

    expect(matEffects(field, { type: 'summon', id: 'x1', how: 'xyz', materials: ['a1', 'a2'], zone: 'emz', index: 0, pos: 'atk' })).toEqual({
      landing: { spot: 'emz', index: 0, tone: 'xyz', flies: true },
      showcase: { ids: ['x1'], kind: 'xyz', flip: true },
    })
    expect(matEffects(field, { type: 'summon', id: 'x2', how: 'link', materials: ['a1'], zone: 'mz', index: 2, pos: 'atk' })).toMatchObject({ landing: { tone: 'link' } })
    // Sin materiales también se invoca (los materiales son una opción): sale con el color de su tipo.
    expect(matEffects(field, { type: 'summon', id: 'x1', how: 'fusion', materials: [], zone: 'emz', index: 0, pos: 'atk' })).toMatchObject({ landing: { tone: 'fusion' } })
    // Una carta que no está en el Extra no se invoca desde ahí: sin efecto.
    expect(matEffects(field, { type: 'summon', id: 'a1', how: 'fusion', materials: [], zone: 'emz', index: 0, pos: 'atk' })).toEqual({})

    expect(matEffects(field, { type: 'tribute', id: 'c1', tributes: ['a1', 'a2'], zone: 'mz', index: 4, pos: 'atk' })).toEqual({
      landing: { spot: 'mz', index: 4, tone: 'normal', flies: true },
      showcase: { ids: ['c1'], kind: 'normal' },
    })
    expect(matEffects(field, { type: 'tribute', id: 'c1', tributes: ['a1'], zone: 'mz', index: 4, pos: 'set' })).toEqual({})
  })

  it('la ficha aparece de la nada y el monstruo que pasa boca arriba a ataque es una Invocación por Volteo', () => {
    expect(matEffects(start(), { type: 'token', zone: 'mz', index: 1 })).toEqual({ landing: { spot: 'mz', index: 1, tone: 'special', flies: false } })
    // Sobre una zona ocupada no se crea nada.
    const occupied = after([place('a1', 1)])
    expect(matEffects(occupied, { type: 'token', zone: 'mz', index: 1 })).toEqual({})

    const set = after([place('a1', 0, 'set', 'normal')])
    expect(matEffects(set, { type: 'position', id: 'a1', pos: 'atk' })).toEqual({
      landing: { spot: 'mz', index: 0, tone: 'normal', flies: false },
      showcase: { ids: ['a1'], kind: 'normal' },
    })
    // Voltearlo en defensa no es una invocación.
    expect(matEffects(set, { type: 'position', id: 'a1', pos: 'def' })).toEqual({})
  })

  it('cambiar de fase muestra el cartel, con el turno cuando de la End Phase se pasa a la Draw Phase (y la carta que se roba sola)', () => {
    expect(matEffects(start(), { type: 'phase', phase: 'main1' })).toEqual({ banner: { phase: 'main1', turn: null } })
    // La misma fase no cambia nada.
    expect(matEffects(start(), { type: 'phase', phase: 'draw' })).toEqual({})

    const end = after([{ type: 'phase', phase: 'end' }])
    expect(matEffects(end, { type: 'phase', phase: 'draw' })).toEqual({
      banner: { phase: 'draw', turn: 2 },
      showcase: { ids: ['e1'], kind: 'hand', flip: true },
      hand: true,
    })
  })

  it('robar muestra todas las cartas del tope, de dorso, y una carta que entra a la mano la enmarca; mandar las del tope al cementerio no se muestra grande', () => {
    expect(matEffects(start(), { type: 'draw', count: 1 })).toEqual({ showcase: { ids: ['e1'], kind: 'hand', flip: true }, hand: true })
    expect(matEffects(start(), { type: 'draw', count: 2 })).toEqual({ showcase: { ids: ['e1', 'f1'], kind: 'hand', flip: true }, hand: true })
    // Con menos cartas que las pedidas, sólo las que hay; con el deck vacío, nada.
    expect(matEffects(start(), { type: 'draw', count: 5 })).toMatchObject({ showcase: { ids: ['e1', 'f1'] } })
    expect(matEffects(after([{ type: 'mill', count: 2 }]), { type: 'draw', count: 1 })).toEqual({})

    // El cementerio y el destierro son la única jugada que no se muestra grande: sólo se anotan (`quiet`). Y el deck no se baraja: las cartas se ven volar.
    expect(matEffects(start(), { type: 'mill', count: 2 })).toEqual({ quiet: { ids: ['e1', 'f1'], kind: 'gy' } })
  })

  it('mover una carta muestra a dónde va (de dorso sólo si sale del deck o del Extra; al cementerio o al destierro no se muestra grande) y devolverla a la mano enmarca la mano', () => {
    expect(matEffects(start(), { type: 'move', id: 'a1', to: 'gy' })).toEqual({ quiet: { ids: ['a1'], kind: 'gy' } })
    expect(matEffects(start(), { type: 'move', id: 'a1', to: 'banished', faceDown: true })).toEqual({ quiet: { ids: ['a1'], kind: 'banish' } })
    expect(matEffects(start(), { type: 'move', id: 'a1', to: 'extra' })).toEqual({ showcase: { ids: ['a1'], kind: 'extra' } })
    expect(matEffects(start(), { type: 'move', id: 'a1', to: 'deck' })).toEqual({ showcase: { ids: ['a1'], kind: 'deck' } })
    expect(matEffects(start(), { type: 'move', id: 'a1', to: 'deck-bottom' })).toEqual({ showcase: { ids: ['a1'], kind: 'deck' } })
    // Buscar en el deck y sacar del Extra: salen de dorso.
    expect(matEffects(start(), { type: 'move', id: 'e1', to: 'hand' })).toEqual({ showcase: { ids: ['e1'], kind: 'hand', flip: true }, hand: true })
    expect(matEffects(start(), { type: 'move', id: 'x1', to: 'gy' })).toEqual({ quiet: { ids: ['x1'], kind: 'gy' } })
    // Volver a la mano desde el campo.
    expect(matEffects(after([place('a1', 0)]), { type: 'move', id: 'a1', to: 'hand' })).toEqual({ showcase: { ids: ['a1'], kind: 'hand' }, hand: true })
    // Una carta que no existe, o una ficha que deja el campo, no muestran nada.
    expect(matEffects(start(), { type: 'move', id: 'zzz', to: 'gy' })).toEqual({})
    const token = after([{ type: 'token', zone: 'mz', index: 0 }])
    expect(matEffects(token, { type: 'move', id: 'token-1', to: 'gy' })).toEqual({})
  })

  it('el deck y la mano se barajan cuando la jugada baraja el deck (y, en la vista del rival, también cuando suma una carta a la mano), y con nada más', () => {
    // Barajan: «Barajar», buscar una carta en el deck (a la mano o al cementerio: la jugada trae la semilla), devolver una al azar o invocar una buscada en el deck.
    for (const action of [
      { type: 'shuffle', seed: 1 },
      { type: 'move', id: 'e1', to: 'hand', shuffle: 7 },
      { type: 'move', id: 'f1', to: 'gy', shuffle: 7 },
      { type: 'move', id: 'a1', to: 'deck', shuffle: 7 },
      { type: 'place', id: 'e1', zone: 'mz', index: 0, pos: 'atk', how: 'special', shuffle: 7 },
    ] as const) {
      expect(matEffects(start(), action).shuffle, `${action.type} ${'id' in action ? action.id : ''}`).toBe(true)
    }

    // Sumar una carta a tu mano (robar, o volver de otro lado) no baraja nada; en la mano del rival (`hiddenHand`) sí, para que no se adivine cuál es la nueva.
    for (const [before, action] of [
      [start(), { type: 'draw', count: 1 }],
      [start(), { type: 'move', id: 'e1', to: 'hand' }],
      [after([place('a1', 0)]), { type: 'move', id: 'a1', to: 'hand' }],
    ] as const) {
      expect(matEffects(before, action).shuffle, `tuya: ${action.type}`).toBeUndefined()
      expect(matEffects(before, action, true).shuffle, `del rival: ${action.type}`).toBe(true)
    }
    // Sin una carta nueva en la mano, la vista del rival tampoco baraja.
    expect(matEffects(start(), { type: 'mill', count: 1 }, true).shuffle).toBeUndefined()
    expect(matEffects(start(), { type: 'batch', actions: [{ type: 'draw', count: 1 }] }, true).shuffle).toBe(true)

    // No: mandar el tope al cementerio, desterrarlo o devolver una carta arriba o abajo del deck no barajan (la carta se ve volar y la pila da su golpe);
    // jugar una carta de la mano, mandarla al cementerio o cambiar de fase no tocan el deck. Una jugada que no cambia nada, tampoco.
    for (const action of [
      { type: 'mill', count: 1 },
      { type: 'move', id: 'e1', to: 'banished', faceDown: true },
      { type: 'move', id: 'a1', to: 'deck' },
      { type: 'move', id: 'a1', to: 'deck-bottom' },
      { type: 'move', id: 'zzz', to: 'gy', shuffle: 7 },
      place('a1', 0),
      { type: 'move', id: 'a1', to: 'gy' },
      { type: 'phase', phase: 'main1' },
    ] as const) {
      expect(matEffects(start(), action).shuffle, `${action.type} ${'id' in action ? action.id : ''}`).toBeUndefined()
    }
  })

  it('adjuntar un material muestra la carta; el resto (contadores) no agrega efectos propios, y barajar sólo baraja', () => {
    const xyz = after([{ type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk', how: 'special' }])

    expect(matEffects(xyz, { type: 'attach', id: 'a1', to: 'x1' })).toEqual({ showcase: { ids: ['a1'], kind: 'attach' } })
    expect(matEffects(xyz, { type: 'attach', id: 'x1', to: 'x1' })).toEqual({})
    expect(matEffects(start(), { type: 'shuffle', seed: 3 })).toEqual({ shuffle: true })
    expect(matEffects(after([place('a1', 0)]), { type: 'counter', id: 'a1', delta: 1 })).toEqual({})
  })

  it('un lote junta los efectos de sus partes: las cartas que se muestran, van en silencio o destacan se suman (la primera sigue en `id`), y baraja si alguna parte baraja', () => {
    const batch = (ids: string[], part: (id: string) => MatAction, ...around: MatAction[]): MatAction => ({ type: 'batch', actions: [...ids.map(part), ...around] })
    const mix: MatAction = { type: 'shuffle', seed: 2 }

    // Buscar dos en el deck (el barajado va primero): se muestran las dos, de dorso, y la mano y el deck se barajan.
    expect(matEffects(start(), { type: 'batch', actions: [mix, ...['e1', 'f1'].map((id): MatAction => ({ type: 'move', id, to: 'hand' }))] })).toEqual({ showcase: { ids: ['e1', 'f1'], kind: 'hand', flip: true }, hand: true, shuffle: true })
    // Al cementerio y al destierro, en silencio; al deck «al azar» (el barajado al final), se muestran y se baraja todo.
    expect(matEffects(start(), batch(['a1', 'a2', 'c1'], (id) => ({ type: 'move', id, to: 'gy' })))).toEqual({ quiet: { ids: ['a1', 'a2', 'c1'], kind: 'gy' } })
    expect(matEffects(start(), batch(['a1', 'a2'], (id) => ({ type: 'move', id, to: 'banished', faceDown: true })))).toEqual({ quiet: { ids: ['a1', 'a2'], kind: 'banish' } })
    expect(matEffects(start(), batch(['a1', 'a2'], (id) => ({ type: 'move', id, to: 'deck' }), mix))).toEqual({ showcase: { ids: ['a1', 'a2'], kind: 'deck' }, shuffle: true })
    // Revelar o marcar varias destaca la primera y trae todas en `ids`; una sola, como suelta (sin `ids`); quitarles el target no destaca nada.
    expect(matEffects(start(), batch(['e1', 'f1'], (id) => ({ type: 'reveal', id })))).toEqual({ spotlight: { id: 'e1', kind: 'reveal', ids: ['e1', 'f1'] } })
    expect(matEffects(start(), batch(['a1', 'a2', 'c1'], (id) => ({ type: 'target', id })))).toEqual({ spotlight: { id: 'a1', kind: 'target', ids: ['a1', 'a2', 'c1'] } })
    expect(matEffects(start(), batch(['a1'], (id) => ({ type: 'target', id })))).toEqual({ spotlight: { id: 'a1', kind: 'target' } })
    expect(matEffects(after([{ type: 'target', id: 'a1' }, { type: 'target', id: 'a2' }]), batch(['a1', 'a2'], (id) => ({ type: 'target', id })))).toEqual({})
    // Adjuntar varias a un Xyz: se muestran todas.
    const xyz = after([{ type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk', how: 'special' }])
    expect(matEffects(xyz, batch(['a1', 'a2'], (id) => ({ type: 'attach', id, to: 'x1' })))).toEqual({ showcase: { ids: ['a1', 'a2'], kind: 'attach' } })
    // Un lote mezclado no junta clases distintas: queda la de la primera parte que la tuvo.
    expect(matEffects(start(), { type: 'batch', actions: [{ type: 'move', id: 'a1', to: 'gy' }, { type: 'move', id: 'a2', to: 'banished' }] })).toEqual({ quiet: { ids: ['a1'], kind: 'gy' } })
    // Vacío, sin efecto o dentro de otro lote: nada.
    expect(matEffects(start(), { type: 'batch', actions: [] })).toEqual({})
    expect(matEffects(start(), batch(['zzz'], (id) => ({ type: 'move', id, to: 'gy' })))).toEqual({})
    expect(matEffects(start(), { type: 'batch', actions: [batch(['a1'], (id) => ({ type: 'move', id, to: 'gy' }))] })).toEqual({})
  })
})

describe('las animaciones que no paran de la mesa', () => {
  it('los aros que laten sólo corren con `prefers-reduced-motion: no-preference` (con movimiento reducido queda el aro quieto)', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const starts = [...css.matchAll(/animation:[^;]*(?:fx-ring-breathe|fx-halo-glow|fx-halo-wave|fx-point-pulse)/g)]

    expect(starts.length).toBeGreaterThan(0)
    for (const start of starts) {
      const before = css.slice(0, start.index)
      const media = [...before.matchAll(/@media \(prefers-reduced-motion: (no-preference|reduce)\)/g)].pop()

      expect(media?.[1]).toBe('no-preference')
    }
  })
})
