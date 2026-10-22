/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import { KNOWN_CARDS_MAP, normalizeCardNameForLookup } from '../app/classification-engine'
import { encodeMessage, parseMessage } from '../app/duel-protocol'
import {
  DEFAULT_HANDTRAP_CONFIG,
  HANDTRAP_CATALOG,
  HANDTRAP_CONFIG_KEY,
  dealRival,
  dealRivalHand,
  isRivalId,
  maxRivalHand,
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

const pick = (id: number, kind: HandtrapPick['kind'], name = `Carta ${id}`): HandtrapPick => ({ id, name, kind })
/** El passcode detrás de una carta del rival (`rival.card-7-2` → 7). */
const passcodeOf = (id: string) => Number(/^rival\.card-(\d+)-\d+$/.exec(id)?.[1])
const countOf = (hand: readonly string[], passcode: number) => hand.filter((id) => passcodeOf(id) === passcode).length
const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7919 + 1)

/** El ejemplo de Andrés: Veiler, Ash, Imperm, Ogre, Fuwalos, Droll, Nibiru e Impulse (las repetibles con 3 copias, las únicas con 1). */
const ANDRES = HANDTRAP_CATALOG.filter((card) => ['Effect Veiler', 'Ash Blossom & Joyous Spring', 'Infinite Impermanence', 'Ghost Ogre & Snow Rabbit', 'Mulcharmy Fuwalos', 'Droll & Lock Bird', 'Nibiru, the Primal Being', 'Dominus Impulse'].includes(card.name))

describe('el catálogo de handtraps', () => {
  it('sólo trae cartas que el motor de clasificación tiene como handtrap, cada passcode una vez', () => {
    for (const card of HANDTRAP_CATALOG) {
      expect(KNOWN_CARDS_MAP.get(normalizeCardNameForLookup(card.name))?.roles, card.name).toContain('handtrap')
    }

    expect(new Set(HANDTRAP_CATALOG.map((card) => card.id)).size).toBe(HANDTRAP_CATALOG.length)
  })

  it('el tipo es el que dice el texto: repetibles las que no tienen «sólo una vez por turno» con su nombre, Charmy las tres Mulcharmy, el resto una sola', () => {
    const byKind = (kind: HandtrapPick['kind']) => HANDTRAP_CATALOG.filter((card) => card.kind === kind).map((card) => card.name)

    expect(byKind('repeatable')).toEqual(['Effect Veiler', 'Infinite Impermanence', 'Droll & Lock Bird', 'PSY-Framegear Gamma', 'D.D. Crow'])
    expect(byKind('charmy')).toEqual(['Mulcharmy Fuwalos', 'Mulcharmy Purulia', 'Mulcharmy Meowls'])
    expect(byKind('single')).toEqual(['Ash Blossom & Joyous Spring', 'Maxx "C"', 'Ghost Ogre & Snow Rabbit', 'Ghost Belle & Haunted Mansion', 'Ghost Mourner & Moonlit Chill', 'Nibiru, the Primal Being', 'Dominus Impulse'])
    expect(ANDRES).toHaveLength(8)
  })
})

describe('el reparto de la mano del rival', () => {
  it('saca las que se piden, sin reposición y cada copia con su id', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const { hand, requested, possible } = dealRivalHand(ANDRES, 3, seed)

      expect(hand).toHaveLength(3)
      expect(new Set(hand).size).toBe(3)
      expect(hand.every(isRivalId)).toBe(true)
      expect(requested).toBe(3)
      // Veiler, Imperm y Droll ×3, Ash, Ogre, Nibiru e Impulse ×1 y Fuwalos (una Charmy).
      expect(possible).toBe(3 * 3 + 4 + 1)
    }
  })

  it('una única nunca sale dos veces; una repetible puede salir hasta tres', () => {
    const singles = ANDRES.filter((card) => card.kind !== 'repeatable')
    let repeated = 0

    for (const seed of SEEDS) {
      const { hand } = dealRivalHand(ANDRES, 6, seed)

      for (const card of singles) expect(countOf(hand, card.id)).toBeLessThanOrEqual(1)
      for (const card of ANDRES) expect(countOf(hand, card.id)).toBeLessThanOrEqual(3)
      if (ANDRES.some((card) => card.kind === 'repeatable' && countOf(hand, card.id) > 1)) repeated += 1
    }

    expect(repeated).toBeGreaterThan(0)
    // Con una sola repetible en el pool, las tres copias salen juntas.
    expect(dealRivalHand([pick(97268402, 'repeatable')], 3, 7).hand.map(passcodeOf)).toEqual([97268402, 97268402, 97268402])
  })

  it('entre todas las Charmies la mano no tiene más de dos', () => {
    const charmies = [pick(1, 'charmy'), pick(2, 'charmy'), pick(3, 'charmy')]

    for (const seed of SEEDS) {
      const { hand, possible } = dealRivalHand([...charmies, pick(9, 'single')], 4, seed)

      expect(hand.filter((id) => passcodeOf(id) < 4).length).toBeLessThanOrEqual(2)
      // Dos Charmies y la única: tres, aunque se pidieron cuatro.
      expect(hand).toHaveLength(3)
      expect(possible).toBe(3)
    }
  })

  it('con un pool corto la mano sale más corta y dice cuántas se pidieron y cuántas se podían', () => {
    expect(dealRivalHand([pick(1, 'single'), pick(2, 'single')], 3, 5)).toMatchObject({ requested: 3, possible: 2 })
    expect(dealRivalHand([pick(1, 'single'), pick(2, 'single')], 3, 5).hand).toHaveLength(2)
    expect(dealRivalHand([], 3, 5)).toEqual({ hand: [], names: {}, requested: 3, possible: 0 })
    expect(maxRivalHand([pick(1, 'repeatable'), pick(2, 'single'), pick(3, 'charmy'), pick(4, 'charmy'), pick(5, 'charmy')])).toBe(3 + 1 + 2)
  })

  it('la misma semilla da la misma mano y otra semilla, en algún caso, otra', () => {
    expect(dealRivalHand(ANDRES, 3, 1234)).toEqual(dealRivalHand(ANDRES, 3, 1234))
    expect(new Set(SEEDS.slice(0, 20).map((seed) => dealRivalHand(ANDRES, 3, seed).hand.join())).size).toBeGreaterThan(1)
  })

  it('un passcode repetido en el pool cuenta una vez, y cada carta repartida lleva su nombre', () => {
    const { hand, names } = dealRivalHand([pick(1, 'single', 'Ash'), pick(1, 'repeatable', 'Ash otra vez')], 3, 3)

    expect(hand).toEqual(['rival.card-1-1'])
    expect(names).toEqual({ 'rival.card-1-1': 'Ash' })
    expect(rivalCardOf('rival.card-14558127-2')).toBe('card-14558127-2')
    expect(rivalCardOf('card-14558127-2')).toBe('card-14558127-2')
  })

  it('para una mesa nueva: nada con el simulador apagado o sin cartas; encendido, la mano y los nombres', () => {
    expect(dealRival({ ...DEFAULT_HANDTRAP_CONFIG, enabled: false }, 1)).toBeNull()
    expect(dealRival({ enabled: true, picks: [], count: 3 }, 1)).toBeNull()

    const dealt = dealRival({ enabled: true, picks: ANDRES, count: 3 }, 1)

    expect(dealt?.rival.used).toEqual([])
    expect(dealt?.rival.hand).toHaveLength(3)
    expect(Object.keys(dealt?.names ?? {})).toEqual(dealt?.rival.hand)
  })
})

describe('lo que se recuerda del simulador', () => {
  it('sin nada guardado: apagado, con todo el catálogo en el pool y 3 en la mano', () => {
    expect(readHandtrapConfig(memory)).toEqual({ enabled: false, picks: HANDTRAP_CATALOG.map((card) => ({ ...card })), count: 3 })
  })

  it('lo que se guarda vuelve igual', () => {
    const storage = memory()
    const config = { enabled: true, picks: [pick(14558127, 'charmy', 'Ash Blossom & Joyous Spring'), pick(91800273, 'single', 'Dimension Shifter')], count: 5 }

    writeHandtrapConfig(config, () => storage)
    expect(readHandtrapConfig(() => storage)).toEqual(config)
  })

  it('lo que no se entiende vuelve a lo de siempre, campo por campo', () => {
    const storage = memory()
    const read = (value: string) => {
      storage.setItem(HANDTRAP_CONFIG_KEY, value)
      return readHandtrapConfig(() => storage)
    }

    expect(read('{basura')).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read('[1, 2]')).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read('{}')).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read(JSON.stringify({ enabled: 'sí', count: 9 }))).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read(JSON.stringify({ enabled: true, count: 0, picks: [] }))).toEqual({ ...DEFAULT_HANDTRAP_CONFIG, enabled: true })

    // Del pool quedan sólo las cartas bien formadas, cada passcode una vez (la primera manda) y con el nombre sin espacios de más.
    expect(
      read(JSON.stringify({ enabled: true, count: 2, picks: [{ id: 1, name: ' Ash ', kind: 'single' }, { id: 1, name: 'Otra', kind: 'charmy' }, { id: 2, name: 'Veiler', kind: 'mucho' }, { id: -3, name: 'X', kind: 'single' }, { id: 4.5, name: 'Y', kind: 'single' }, { id: 5, name: '  ', kind: 'single' }, 'nada', null] })),
    ).toEqual({ enabled: true, count: 2, picks: [pick(1, 'single', 'Ash')] })
  })

  it('una versión anterior, con otra clave, no se lee', () => {
    const storage = memory()

    storage.setItem('ygo-lab:rival-handtraps:v0', JSON.stringify({ enabled: true, count: 6, picks: [pick(1, 'single')] }))
    expect(readHandtrapConfig(() => storage)).toEqual(DEFAULT_HANDTRAP_CONFIG)
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
