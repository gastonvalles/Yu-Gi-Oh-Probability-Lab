import { describe, expect, it } from 'vitest'

import { matEffects } from '../app/mat-effects'
import { createMatState, replayMat, type MatAction } from '../app/practice-mat'

// a1 y a2 monstruos, b1 una Magia, x1 y x2 del Extra.
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
    expect(matEffects(start(), place('a1', 2, 'atk', 'normal'))).toEqual({ landing: { spot: 'mz', index: 2, tone: 'normal', flies: true } })
    expect(matEffects(start(), place('a1', 2, 'def', 'special'))).toEqual({ landing: { spot: 'mz', index: 2, tone: 'special', flies: true } })
    // Sin `how` (combos guardados antes): desde la mano es Normal y desde el cementerio, Especial.
    expect(matEffects(start(), place('a1', 0))).toMatchObject({ landing: { tone: 'normal' } })
    const milled = after([{ type: 'mill', count: 1 }])
    expect(matEffects(milled, place('e1', 0))).toMatchObject({ landing: { tone: 'special' } })
  })

  it('Colocar boca abajo, mover una carta que ya está en el campo o soltar en una zona ocupada no destellan', () => {
    expect(matEffects(start(), place('a1', 0, 'set', 'normal'))).toEqual({})

    const onField = after([place('a1', 0)])
    expect(matEffects(onField, place('a1', 3))).toEqual({})
    expect(matEffects(onField, place('a2', 0))).toEqual({})
  })

  it('las invocaciones desde el Extra tienen el color de su tipo, y los Sacrificios son una Invocación Normal', () => {
    const field = after([place('a1', 0), place('a2', 1)])

    expect(matEffects(field, { type: 'summon', id: 'x1', how: 'xyz', materials: ['a1', 'a2'], zone: 'emz', index: 0, pos: 'atk' })).toEqual({ landing: { spot: 'emz', index: 0, tone: 'xyz', flies: true } })
    expect(matEffects(field, { type: 'summon', id: 'x2', how: 'link', materials: ['a1'], zone: 'mz', index: 2, pos: 'atk' })).toMatchObject({ landing: { tone: 'link' } })
    expect(matEffects(field, { type: 'summon', id: 'x1', how: 'fusion', materials: [], zone: 'emz', index: 0, pos: 'atk' })).toEqual({})

    expect(matEffects(field, { type: 'tribute', id: 'c1', tributes: ['a1', 'a2'], zone: 'mz', index: 4, pos: 'atk' })).toEqual({ landing: { spot: 'mz', index: 4, tone: 'normal', flies: true } })
    expect(matEffects(field, { type: 'tribute', id: 'c1', tributes: ['a1'], zone: 'mz', index: 4, pos: 'set' })).toEqual({})
  })

  it('la ficha aparece de la nada y el monstruo que pasa boca arriba a ataque es una Invocación por Volteo', () => {
    expect(matEffects(start(), { type: 'token', zone: 'mz', index: 1 })).toEqual({ landing: { spot: 'mz', index: 1, tone: 'special', flies: false } })
    // Sobre una zona ocupada no se crea nada.
    const occupied = after([place('a1', 1)])
    expect(matEffects(occupied, { type: 'token', zone: 'mz', index: 1 })).toEqual({})

    const set = after([place('a1', 0, 'set', 'normal')])
    expect(matEffects(set, { type: 'position', id: 'a1', pos: 'atk' })).toEqual({ landing: { spot: 'mz', index: 0, tone: 'normal', flies: false } })
    // Voltearlo en defensa no es una invocación.
    expect(matEffects(set, { type: 'position', id: 'a1', pos: 'def' })).toEqual({})
  })

  it('cambiar de fase muestra el cartel, con el turno cuando de la End Phase se pasa a la Draw Phase', () => {
    expect(matEffects(start(), { type: 'phase', phase: 'main1' })).toEqual({ banner: { phase: 'main1', turn: null } })
    // La misma fase no cambia nada.
    expect(matEffects(start(), { type: 'phase', phase: 'draw' })).toEqual({})

    const end = after([{ type: 'phase', phase: 'end' }])
    expect(matEffects(end, { type: 'phase', phase: 'draw' })).toEqual({ banner: { phase: 'draw', turn: 2 } })
  })

  it('el resto de las jugadas (robar, barajar, contadores, mover a una pila) no agrega efectos propios', () => {
    expect(matEffects(start(), { type: 'draw', count: 1 })).toEqual({})
    expect(matEffects(start(), { type: 'shuffle', seed: 3 })).toEqual({})
    expect(matEffects(start(), { type: 'move', id: 'a1', to: 'gy' })).toEqual({})
    expect(matEffects(after([place('a1', 0)]), { type: 'counter', id: 'a1', delta: 1 })).toEqual({})
  })
})
