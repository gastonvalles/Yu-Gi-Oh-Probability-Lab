/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import { KNOWN_CARDS_MAP, normalizeCardNameForLookup } from '../app/classification-engine'
import { encodeMessage, parseMessage } from '../app/duel-protocol'
import {
  DEFAULT_HANDTRAP_CONFIG,
  HANDTRAP_CATALOG,
  HANDTRAP_CONFIG_KEY,
  MAX_COPIES,
  MAX_RIVAL_HAND,
  dealRival,
  handCount,
  isRivalId,
  readHandtrapConfig,
  rivalCardOf,
  writeHandtrapConfig,
  type HandtrapPick,
} from '../app/handtraps'
import { matEffects } from '../app/mat-effects'
import { mapActionIds } from '../app/mat-public'
import { createMatState, describeMatAction, describeMatSteps, matReducer, replayMat, type MatAction, type MatState } from '../app/practice-mat'
import { createSavedCombo, readSavedCombos, writeSavedCombos } from '../app/saved-combos'
import { sfxOfAction } from '../app/sfx'

const memory = () => {
  const data = new Map<string, string>()

  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) } as unknown as Storage
}

const pick = (id: number, copies: number, name = `Carta ${id}`): HandtrapPick => ({ id, name, copies })
const ASH = pick(14558127, 1, 'Ash Blossom & Joyous Spring')
const VEILER = pick(97268402, 1, 'Effect Veiler')
const IMPERM = pick(10045474, 1, 'Infinite Impermanence')

describe('el catálogo de handtraps', () => {
  it('sólo trae cartas que el motor de clasificación tiene como handtrap, cada passcode una vez y sólo con su passcode y su nombre', () => {
    for (const card of HANDTRAP_CATALOG) {
      expect(KNOWN_CARDS_MAP.get(normalizeCardNameForLookup(card.name))?.roles, card.name).toContain('handtrap')
      expect(Object.keys(card).sort(), card.name).toEqual(['id', 'name'])
    }

    expect(new Set(HANDTRAP_CATALOG.map((card) => card.id)).size).toBe(HANDTRAP_CATALOG.length)
  })

  it('una carta de un deck va de a tres como mucho y la mano del rival tiene seis lugares', () => {
    expect(MAX_COPIES).toBe(3)
    expect(MAX_RIVAL_HAND).toBe(6)
    expect(handCount([pick(1, 2), pick(2, 3)])).toBe(5)
    expect(handCount([])).toBe(0)
  })
})

describe('la mano del rival que se reparte', () => {
  it('es la elegida, sin sorteo: cada handtrap con sus copias, cada copia con su id y su nombre', () => {
    const dealt = dealRival({ enabled: true, picks: [{ ...VEILER, copies: 2 }, ASH] })

    // En el orden del catálogo: Ash Blossom va antes que Effect Veiler.
    expect(dealt?.rival).toEqual({ hand: ['rival.card-14558127-1', 'rival.card-97268402-1', 'rival.card-97268402-2'], used: [] })
    expect(dealt?.names).toEqual({ 'rival.card-14558127-1': 'Ash Blossom & Joyous Spring', 'rival.card-97268402-1': 'Effect Veiler', 'rival.card-97268402-2': 'Effect Veiler' })
    expect(dealt?.rival.hand.every(isRivalId)).toBe(true)
    // Siempre la misma: «Nueva mano» le reparte la misma al rival.
    expect(dealRival({ enabled: true, picks: [{ ...VEILER, copies: 2 }, ASH] })).toEqual(dealt)
  })

  it('las que no son del catálogo (agregadas con el buscador) van después, en el orden en que se agregaron', () => {
    const dealt = dealRival({ enabled: true, picks: [pick(91800273, 1, 'Dimension Shifter'), { ...IMPERM, copies: 3 }, pick(5, 2, 'Otra')] })

    expect(dealt?.rival.hand).toEqual(['rival.card-10045474-1', 'rival.card-10045474-2', 'rival.card-10045474-3', 'rival.card-91800273-1', 'rival.card-5-1', 'rival.card-5-2'])
    expect(dealt?.names['rival.card-5-2']).toBe('Otra')
  })

  it('apagado, o sin ninguna elegida, no hay mano del rival (la mesa queda como siempre)', () => {
    expect(dealRival({ enabled: false, picks: [ASH] })).toBeNull()
    expect(dealRival({ enabled: true, picks: [] })).toBeNull()
  })

  it('nunca más de 3 copias de una ni de 6 en total, ni la misma carta dos veces', () => {
    const dealt = dealRival({ enabled: true, picks: [{ ...ASH, copies: 5 }, { ...ASH, copies: 1 }, { ...VEILER, copies: 3 }, { ...IMPERM, copies: 2 }] })

    expect(dealt?.rival.hand).toEqual(['rival.card-14558127-1', 'rival.card-14558127-2', 'rival.card-14558127-3', 'rival.card-97268402-1', 'rival.card-97268402-2', 'rival.card-97268402-3'])
    expect(rivalCardOf('rival.card-14558127-2')).toBe('card-14558127-2')
    expect(rivalCardOf('card-14558127-2')).toBe('card-14558127-2')
  })
})

describe('lo que se recuerda del simulador', () => {
  const storage = memory()
  const read = (value: string) => {
    storage.setItem(HANDTRAP_CONFIG_KEY, value)
    return readHandtrapConfig(() => storage)
  }

  it('sin nada guardado: apagado, con Ash Blossom, Effect Veiler e Infinite Impermanence, una copia de cada una', () => {
    expect(readHandtrapConfig(memory)).toEqual({ enabled: false, picks: [ASH, VEILER, IMPERM] })
    expect(DEFAULT_HANDTRAP_CONFIG).toEqual({ enabled: false, picks: [ASH, VEILER, IMPERM] })
  })

  it('lo que se guarda vuelve igual', () => {
    const config = { enabled: true, picks: [{ ...ASH, copies: 3 }, pick(91800273, 2, 'Dimension Shifter')] }

    writeHandtrapConfig(config, () => storage)
    expect(readHandtrapConfig(() => storage)).toEqual(config)
  })

  it('lo que no se entiende vuelve a lo de siempre, campo por campo', () => {
    expect(read('{basura')).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read('[1, 2]')).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read('{}')).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read(JSON.stringify({ enabled: 'sí', picks: 'Ash' }))).toEqual(DEFAULT_HANDTRAP_CONFIG)
    // Una lista con cartas, pero ninguna que se entienda, también.
    expect(read(JSON.stringify({ enabled: true, picks: [{ id: -1, name: 'X', copies: 1 }, { id: 2, name: '  ', copies: 1 }, { id: 3, name: 'Sin copias' }, 'nada', null] }))).toEqual({ ...DEFAULT_HANDTRAP_CONFIG, enabled: true })
    // Una mano guardada vacía es una mano vacía.
    expect(read(JSON.stringify({ enabled: true, picks: [] }))).toEqual({ enabled: true, picks: [] })
  })

  it('las copias fuera de 1 a 3 se acotan, una carta repetida queda una vez (la primera manda) y lo que pasa de 6 se recorta', () => {
    expect(read(JSON.stringify({ enabled: true, picks: [{ id: 1, name: ' Ash ', copies: 0 }, { id: 2, name: 'Veiler', copies: 9 }, { id: 3, name: 'Imperm', copies: 1.6 }] })).picks).toEqual([pick(1, 1, 'Ash'), pick(2, 3, 'Veiler'), pick(3, 2, 'Imperm')])
    expect(read(JSON.stringify({ enabled: true, picks: [{ id: 1, name: 'Ash', copies: 1 }, { id: 1, name: 'Otra', copies: 3 }] })).picks).toEqual([pick(1, 1, 'Ash')])
    expect(read(JSON.stringify({ enabled: true, picks: [pick(1, 3), pick(2, 2), pick(3, 3), pick(4, 1)] })).picks).toEqual([pick(1, 3), pick(2, 2), pick(3, 1)])
  })

  it('la versión anterior (un pool con tipos y una cantidad general, con otra clave) no se lee', () => {
    const old = memory()

    old.setItem('ygo-lab:rival-handtraps:v1', JSON.stringify({ enabled: true, count: 6, picks: [{ id: 1, name: 'Ash', kind: 'single' }] }))
    expect(readHandtrapConfig(() => old)).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(HANDTRAP_CONFIG_KEY).toBe('ygo-lab:rival-handtraps:v2')
  })

  it('sin almacenamiento no rompe: lee lo de siempre y escribir no hace nada', () => {
    const broken = () => {
      throw new Error('sin almacenamiento')
    }

    expect(readHandtrapConfig(broken)).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(() => writeHandtrapConfig(DEFAULT_HANDTRAP_CONFIG, broken)).not.toThrow()
  })
})

describe('la jugada del rival en la mesa', () => {
  const RIVAL = ['rival.card-14558127-1', 'rival.card-97268402-2']
  const table = (): MatState => ({ ...createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], [], 5), rival: { hand: RIVAL, used: [] } })
  const names: Record<string, string> = { 'rival.card-14558127-1': 'Ash Blossom & Joyous Spring', 'rival.card-97268402-2': 'Effect Veiler' }
  const nameOf = (id: string) => names[id] ?? id
  const use = (id: string): MatAction => ({ type: 'rivalUse', id })

  it('usar una handtrap la deja usada en su lugar: la mano del rival no cambia de orden', () => {
    const after = matReducer(table(), use(RIVAL[1]!))

    expect(after.rival).toEqual({ hand: RIVAL, used: [RIVAL[1]] })
    // Lo demás de la mesa, igual.
    expect({ ...after, rival: undefined }).toEqual({ ...table(), rival: undefined })
  })

  it('usar otra vez la misma, una carta que no es del rival o una mesa sin rival no cambia nada', () => {
    const once = matReducer(table(), use(RIVAL[0]!))
    const plain = createMatState(['card-1-1'], [], 1)

    expect(matReducer(once, use(RIVAL[0]!))).toBe(once)
    expect(matReducer(table(), use('rival.card-1-1'))).toEqual(table())
    expect(matReducer(table(), use('card-1-1'))).toEqual(table())
    // Una mesa o un combo de antes (sin `rival`) sigue igual.
    expect(matReducer(plain, use(RIVAL[0]!))).toBe(plain)
    expect(replayMat(plain, [use(RIVAL[0]!), { type: 'draw', count: 0 }])).toEqual(plain)
  })

  it('reproducir y deshacer (rejugar menos pasos) la devuelven a la mano', () => {
    const actions: MatAction[] = [{ type: 'draw', count: 1 }, use(RIVAL[0]!), use(RIVAL[1]!)]

    expect(replayMat(table(), actions).rival?.used).toEqual(RIVAL)
    expect(replayMat(table(), actions, 2).rival?.used).toEqual([RIVAL[0]])
    expect(replayMat(table(), actions, 1).rival?.used).toEqual([])
  })

  it('el registro dice quién la usó, y suena y se ve como una activación', () => {
    expect(describeMatAction(table(), use(RIVAL[0]!), nameOf)).toBe('El rival usó Ash Blossom & Joyous Spring')
    expect(describeMatSteps(table(), [use(RIVAL[1]!), use(RIVAL[1]!)], nameOf)).toEqual(['El rival usó Effect Veiler', 'El rival usó Effect Veiler'])
    expect(sfxOfAction(use(RIVAL[0]!))).toBe('activate')
    expect(matEffects(table(), use(RIVAL[0]!))).toEqual({ spotlight: { id: RIVAL[0], kind: 'activate' } })
    // Ya usada, no destella otra vez.
    expect(matEffects(matReducer(table(), use(RIVAL[0]!)), use(RIVAL[0]!))).toEqual({})
  })

  it('no viaja en un duelo: el espejo la deja como está y quien la recibe la descarta', () => {
    expect(mapActionIds(use(RIVAL[0]!), () => 'c1')).toEqual(use(RIVAL[0]!))
    expect(parseMessage(encodeMessage({ t: 'act', n: 1, wire: { action: use('c1'), reveal: {} } }))).toBeNull()
  })

  describe('en los combos guardados', () => {
    beforeEach(() => localStorage.clear())

    it('la mano del rival y sus nombres se guardan con el combo y vuelven igual', () => {
      const combo = createSavedCombo({ name: 'Con handtraps', deckName: 'Test', initial: table(), actions: [use(RIVAL[0]!)], nameOf }, [])

      writeSavedCombos([combo])

      const [read] = readSavedCombos()

      expect(read?.initial.rival).toEqual({ hand: RIVAL, used: [] })
      expect(read?.names['rival.card-97268402-2']).toBe('Effect Veiler')
      expect(replayMat(read!.initial, read!.actions).rival?.used).toEqual([RIVAL[0]])
    })

    it('una mano del rival que no se entiende se descarta y el combo queda como uno de antes', () => {
      const combo = createSavedCombo({ name: 'Viejo', deckName: 'Test', initial: createMatState(['card-1-1'], [], 1), actions: [], nameOf }, [])

      localStorage.setItem('ygo-lab:practice-combos', JSON.stringify([{ ...combo, initial: { ...combo.initial, rival: { hand: 'Ash', used: [] } } }, combo]))

      const [broken, old] = readSavedCombos()

      expect(broken?.initial).not.toHaveProperty('rival')
      expect(old?.initial).toEqual(createMatState(['card-1-1'], [], 1))
    })
  })
})
