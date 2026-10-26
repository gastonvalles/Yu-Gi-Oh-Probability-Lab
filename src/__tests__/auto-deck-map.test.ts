import { deckOrder, mapDeck, scriptClosure, scriptName } from '../app/auto/deck-map'
import { hasCoreData, scriptStore } from './support/core-data'

const EFFECT = 0x21
const NORMAL = 0x11
const NORMAL_PENDULUM = 0x1000011
const cards = new Map([
  [10, { code: 10, alias: 0, type: EFFECT }],
  [11, { code: 11, alias: 10, type: EFFECT }], // arte alternativo de 10: usa el script de 10
  [50, { code: 50, alias: 10, type: EFFECT }], // «se trata como» 10: lleva el suyo
  [20, { code: 20, alias: 0, type: NORMAL }],
  [30, { code: 30, alias: 0, type: NORMAL_PENDULUM }],
  [40, { code: 40, alias: 0, type: EFFECT }],
])
const scripts: Record<string, string> = {
  'constant.lua': 'X=1',
  'utility.lua': 'Duel.LoadScript("proc_a.lua")\nDuel.LoadScript(\'proc_b.lua\')',
  'proc_a.lua': 'Duel.LoadScript("proc_b.lua")',
  'proc_b.lua': '',
  'c10.lua': '',
  'c50.lua': '',
  'c30.lua': '',
}
const read = (name: string) => scripts[name] ?? null

describe('del deck al núcleo', () => {
  it('pide el script del original para un arte alternativo y el propio para un «se trata como»', () => {
    expect(scriptName(cards.get(11)!)).toBe('c10.lua')
    expect(scriptName(cards.get(50)!)).toBe('c50.lua')
  })

  it('expande las copias, reporta lo que no está y lo que no tiene reglas', () => {
    const mapped = mapDeck({ main: [[10, 2], [11, 1], [20, 3], [99, 1], [40, 1]], extra: [[30, 1]] }, (code) => cards.get(code) ?? null, (name) => read(name) !== null)

    expect(mapped).toEqual({ main: [10, 10, 11, 20, 20, 20, 40], extra: [30], missing: [99], noRules: [40] })
  })

  it('pone la mano fija arriba, en ese orden, y baraja el resto con la semilla', () => {
    const main = [1, 2, 3, 4, 5, 6, 7, 8]
    const order = deckOrder(main, 3, [8, 1])

    expect(order.slice(0, 2)).toEqual([8, 1])
    expect([...order].sort()).toEqual([...main].sort())
    expect(deckOrder(main, 3, [8, 1])).toEqual(order)
    expect(deckOrder(main, 4)).not.toEqual(deckOrder(main, 3))
    expect(() => deckOrder(main, 3, [9])).toThrow()
  })

  it('arma el cierre de scripts: las bibliotecas en cadena y el script de cada carta', () => {
    const closure = scriptClosure([...cards.values()], read)

    expect(closure.slice(0, 4)).toEqual(['constant.lua', 'utility.lua', 'proc_a.lua', 'proc_b.lua'])
    expect(closure.slice(4).sort()).toEqual(['c10.lua', 'c30.lua', 'c50.lua'])
  })

  it('sigue los scripts que carga una carta: por nombre, por número y por constante, en cadena, sin dar vueltas en un ciclo', () => {
    const delegating = {
      'constant.lua': 'Duel.LoadScript("card_constants.lua")',
      'utility.lua': 'function Duel.LoadCardScript(code)\n  Duel.LoadScript(code)\nend',
      'card_constants.lua': 'CARD_ORIGINAL                 = 70',
      'c60.lua': 'Duel.LoadCardScriptAlias(CARD_ORIGINAL)',
      'c70.lua': 'Duel.LoadCardScript("c71.lua")\nDuel.LoadCardScript(72)',
      'c71.lua': 'Duel.LoadCardScriptAlias( 60 )', // vuelve al primero: un ciclo
      'c72.lua': 'Duel.LoadCardScript(CARD_UNKNOWN)\nDuel.LoadCardScript("c73.lua")', // una constante que nadie define y un script que no está
    }
    const closure = scriptClosure([{ code: 60, alias: 0, type: EFFECT }], (name) => delegating[name as keyof typeof delegating] ?? null)

    expect(closure).toEqual(['constant.lua', 'utility.lua', 'card_constants.lua', 'c60.lua', 'c70.lua', 'c71.lua', 'c72.lua'])
  })

  it.skipIf(!hasCoreData)('con los scripts reales: el arte alternativo de Polymerization trae el script del original', () => {
    const closure = scriptClosure([{ code: 27847700, alias: 24094653, type: 0x2 }], scriptStore().read)

    expect(closure).toContain('c27847700.lua')
    expect(closure).toContain('c24094653.lua')
  })
})
