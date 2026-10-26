import { turnReasons, type NoPlaysInput } from '../app/auto/no-plays'
import { createMatState } from '../app/practice-mat'

// Por qué una carta no tiene jugadas: sólo lo que la mesa sabe con certeza.
const placed = (id: string) => ({ id, pos: 'atk' as const, counters: 0, materials: [] })
const state = createMatState([], [], 0)
const base: NoPlaysInput = { state: { ...state, hand: ['m', 's', 'f'] }, id: 'm', kind: { monster: true, fieldSpell: false }, turnMine: true, ask: 'select_idlecmd', normal: null }

describe('turnReasons', () => {
  it('en el turno del rival lo dice, sea cual sea la carta', () => {
    expect(turnReasons({ ...base, turnMine: false, ask: null })).toEqual(['Es el turno del rival.'])
  })

  it('un monstruo de la mano en tus jugadas del turno: la Invocación Normal o la Colocación hecha y las zonas llenas', () => {
    expect(turnReasons(base)).toEqual([])
    expect(turnReasons({ ...base, normal: 'summon' })).toEqual(['Ya hiciste una Invocación Normal este turno.'])
    expect(turnReasons({ ...base, normal: 'set', state: { ...base.state, mz: base.state.mz.map((_, i) => placed(`x${i}`)) } })).toEqual(['Ya Colocaste un monstruo este turno.', 'Tus cinco zonas de monstruo están ocupadas.'])
  })

  it('una Mágica o Trampa de la mano: las cinco zonas de magia y trampa (la de Campo tiene la suya)', () => {
    const full = { ...base.state, st: base.state.st.map((_, i) => placed(`y${i}`)) }

    expect(turnReasons({ ...base, id: 's', kind: { monster: false, fieldSpell: false }, normal: 'summon', state: full })).toEqual(['Tus cinco zonas de magia y trampa están ocupadas.'])
    expect(turnReasons({ ...base, id: 'f', kind: { monster: false, fieldSpell: true }, state: full })).toEqual([])
  })

  it('fuera de tus jugadas del turno o fuera de la mano no se dice nada (no se sabe)', () => {
    expect(turnReasons({ ...base, normal: 'summon', ask: 'select_chain' })).toEqual([])
    expect(turnReasons({ ...base, normal: 'summon', ask: null })).toEqual([])
    expect(turnReasons({ ...base, id: 'otra', normal: 'summon' })).toEqual([])
  })
})
