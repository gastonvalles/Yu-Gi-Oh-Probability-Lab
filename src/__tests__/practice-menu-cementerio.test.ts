import { describe, expect, it } from 'vitest'

import { t } from '../i18n'
import { createMatState, listCardActions, matReducer, TOKEN_KIND, type MatAction, type MatCardKind, type MatMenuItem, type MatState } from '../app/practice-mat'

const SPELL: MatCardKind = { monster: false, spell: true, trap: false, extra: false, effect: true, fieldSpell: false, pendulum: false, fusion: false, synchro: false, xyz: false, link: false, level: null }
const TRAP: MatCardKind = { ...SPELL, spell: false, trap: true }
const FIELD: MatCardKind = { ...SPELL, fieldSpell: true }
const MONSTER: MatCardKind = { ...SPELL, spell: false, monster: true, level: 4 }

const KINDS: Record<string, MatCardKind> = { s1: SPELL, s2: SPELL, s3: SPELL, s4: SPELL, s5: SPELL, t1: TRAP, f1: FIELD, m1: MONSTER }
const kindOf = (id: string) => KINDS[id] ?? TOKEN_KIND
const nameOf = (id: string) => id.toUpperCase()

const ACTIVATE = t('practice.menu.activate')
const SET = t('practice.menu.set')

const start = () => createMatState(['s1', 's2', 's3', 's4', 's5', 't1', 'f1', 'm1'], [], 8)
const menu = (state: MatState, id: string) => listCardActions(state, id, kindOf, nameOf)
const pick = (items: MatMenuItem[], label: string) => items.find((item) => item.label === label)
const sendTo = (id: string, to: 'gy' | 'banished', faceDown?: boolean): MatAction => ({ type: 'move', id, to, ...(faceDown ? { faceDown } : {}) })

describe('el menú de una Mágica o Trampa que está en el cementerio o en el destierro', () => {
  it.each([
    ['una Mágica en el cementerio', 's1', sendTo('s1', 'gy')],
    ['una Trampa en el cementerio', 't1', sendTo('t1', 'gy')],
    ['una Mágica en el destierro', 's1', sendTo('s1', 'banished')],
    ['una Trampa en el destierro', 't1', sendTo('t1', 'banished')],
    ['una Mágica desterrada boca abajo', 's1', sendTo('s1', 'banished', true)],
  ])('%s se puede activar y colocar', (_name, id, action) => {
    const state = matReducer(start(), action)
    const items = menu(state, id)
    const activate = pick(items, ACTIVATE)
    const set = pick(items, SET)

    expect(activate?.action).toMatchObject({ type: 'place', id, zone: 'st', index: 0, pos: 'atk' })
    expect(set?.action).toMatchObject({ type: 'place', id, zone: 'st', index: 0, pos: 'set' })
    // Son jugadas del juego, no de apoyo, y dejan elegir otra casilla.
    expect(activate?.utility).toBeFalsy()
    expect(set?.utility).toBeFalsy()
    expect(activate?.targets?.length).toBe(5)
  })

  it('una Mágica de Campo sale a la zona de Campo, no a las de Mágicas y Trampas', () => {
    const state = matReducer(start(), sendTo('f1', 'gy'))
    const items = menu(state, 'f1')

    expect(pick(items, ACTIVATE)?.action).toMatchObject({ type: 'place', id: 'f1', zone: 'field', pos: 'atk' })
    expect(pick(items, SET)?.action).toMatchObject({ type: 'place', id: 'f1', zone: 'field', pos: 'set' })
  })

  it('activarla la saca del cementerio a la zona, boca arriba; colocarla, boca abajo', () => {
    const inGrave = matReducer(start(), sendTo('s2', 'gy'))
    const activated = matReducer(inGrave, pick(menu(inGrave, 's2'), ACTIVATE)!.action)
    const set = matReducer(inGrave, pick(menu(inGrave, 's2'), SET)!.action)

    expect(activated.gy).not.toContain('s2')
    expect(activated.st[0]).toMatchObject({ id: 's2', pos: 'atk' })
    expect(set.gy).not.toContain('s2')
    expect(set.st[0]).toMatchObject({ id: 's2', pos: 'set' })
  })

  it('un monstruo del cementerio no gana «Activar» ni «Colocar» (sigue con lo suyo)', () => {
    const state = matReducer(start(), sendTo('m1', 'gy'))
    const labels = menu(state, 'm1').map((item) => item.label)

    expect(labels).not.toContain(ACTIVATE)
    expect(labels).not.toContain(SET)
    expect(labels).toContain(t('practice.menu.activateEffect'))
  })

  it('con las cinco casillas ocupadas no ofrece activar ni colocar, pero sí lo demás', () => {
    let state = start()

    for (const [index, id] of ['s1', 's2', 's3', 's4', 's5'].entries()) state = matReducer(state, { type: 'place', id, zone: 'st', index, pos: 'set' })
    state = matReducer(state, sendTo('t1', 'gy'))
    const labels = menu(state, 't1').map((item) => item.label)

    expect(labels).not.toContain(ACTIVATE)
    expect(labels).not.toContain(SET)
    expect(labels).toContain(t('practice.menu.toHand'))
  })
})
