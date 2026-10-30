/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import { KNOWN_CARDS_MAP, normalizeCardNameForLookup } from '../app/classification-engine'
import { encodeMessage, parseMessage } from '../app/duel-protocol'
import {
  AUTO_RULES,
  autoRival,
  DEFAULT_HANDTRAP_CONFIG,
  DEFAULT_RIVAL_EXTRA,
  extraKindOf,
  HANDTRAP_CATALOG,
  HANDTRAP_CONFIG_KEY,
  MAX_COPIES,
  MAX_RIVAL_HAND,
  MIN_RIVAL_HAND,
  dealRival,
  isRivalId,
  missingExtra,
  poolCount,
  readHandtrapConfig,
  rivalCardOf,
  writeHandtrapConfig,
  type ExtraPick,
  type HandtrapConfig,
  type HandtrapPick,
} from '../app/handtraps'
import { matEffects } from '../app/mat-effects'
import { mapActionIds } from '../app/mat-public'
import { createMatState, describeMatAction, describeMatSteps, matReducer, replayMat, type MatAction, type MatState } from '../app/practice-mat'
import { createSavedCombo, readSavedCombos, writeSavedCombos } from '../app/saved-combos'
import { sfxOfAction } from '../app/sfx'

/** Las de H3 con regla que no están en el catálogo (se agregan con el buscador). */
const H3_SEARCH = [68144894, 60242223, 69680031]

const memory = () => {
  const data = new Map<string, string>()

  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) } as unknown as Storage
}

const pick = (id: number, copies: number, name = `Carta ${id}`): HandtrapPick => ({ id, name, copies })
const ASH = pick(14558127, 1, 'Ash Blossom & Joyous Spring')
const VEILER = pick(97268402, 1, 'Effect Veiler')
const IMPERM = pick(10045474, 1, 'Infinite Impermanence')
/** El passcode detrás de una carta del rival (`rival.card-7-2` → 7). */
const passcodeOf = (id: string) => Number(/^rival\.card-(\d+)-\d+$/.exec(id)?.[1])
const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7919 + 1)
const on = (picks: HandtrapPick[], hand: number): HandtrapConfig => ({ enabled: true, picks, hand })
/** «3 de 3 cartas»: 3 copias de cada una de 3 cartas (9 en el deck del rival). */
const THREE_OF_THREE = [{ ...ASH, copies: 3 }, { ...VEILER, copies: 3 }, { ...IMPERM, copies: 3 }]

describe('el catálogo de handtraps', () => {
  it('sólo trae cartas que el motor de clasificación tiene como handtrap, cada passcode una vez y sólo con su passcode y su nombre', () => {
    for (const card of HANDTRAP_CATALOG) {
      expect(KNOWN_CARDS_MAP.get(normalizeCardNameForLookup(card.name))?.roles, card.name).toContain('handtrap')
      expect(Object.keys(card).sort(), card.name).toEqual(['id', 'name'])
    }

    expect(new Set(HANDTRAP_CATALOG.map((card) => card.id)).size).toBe(HANDTRAP_CATALOG.length)
  })

  it('de cada carta hay de 1 a 3 copias (las de un deck) y la mano del rival tiene de 1 a 5 cartas', () => {
    expect(MAX_COPIES).toBe(3)
    expect([MIN_RIVAL_HAND, MAX_RIVAL_HAND]).toEqual([1, 5])
    expect(poolCount(THREE_OF_THREE)).toBe(9)
    expect(poolCount([])).toBe(0)
  })
})

describe('la mano del rival que se reparte', () => {
  it('sale con las que se piden (o con todas, si el deck del rival tiene menos), sin repetir ninguna copia', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const hand of [1, 3, 5]) {
        const dealt = dealRival(on(THREE_OF_THREE, hand), seed)

        expect(dealt?.rival.hand).toHaveLength(hand)
        expect(new Set(dealt?.rival.hand).size).toBe(hand)
        expect(dealt?.rival.used).toEqual([])
        expect(dealt?.rival.hand.every(isRivalId)).toBe(true)
      }

      // Con 2 cartas en el deck del rival y 5 en la mano, la mano sale con las 2.
      expect(dealRival(on([ASH, VEILER], 5), seed)?.rival.hand.sort()).toEqual(['rival.card-14558127-1', 'rival.card-97268402-1'])
    }
  })

  it('de una carta no salen más copias que las que tiene el rival en su deck', () => {
    for (const seed of SEEDS) {
      const { hand } = dealRival(on([{ ...ASH, copies: 1 }, { ...VEILER, copies: 2 }, { ...IMPERM, copies: 3 }], 5), seed)!.rival
      const count = (passcode: number) => hand.filter((id) => passcodeOf(id) === passcode).length

      expect(count(ASH.id)).toBeLessThanOrEqual(1)
      expect(count(VEILER.id)).toBeLessThanOrEqual(2)
      expect(count(IMPERM.id)).toBeLessThanOrEqual(3)
    }
  })

  it('se sortea de verdad: con 3 copias de 3 cartas y 5 en la mano, cada semilla da su mano y entre todas salen las 9 cartas', () => {
    const hands = SEEDS.map((seed) => dealRival(on(THREE_OF_THREE, 5), seed)!.rival.hand)
    const seen = new Set(hands.flat())

    expect(new Set(hands.map((hand) => hand.join())).size).toBeGreaterThan(50)
    expect(seen).toEqual(new Set(THREE_OF_THREE.flatMap((card) => [1, 2, 3].map((copy) => `rival.card-${card.id}-${copy}`))))
  })

  it('la misma semilla da siempre la misma mano, aunque las cartas lleguen en otro orden', () => {
    expect(dealRival(on(THREE_OF_THREE, 5), 1234)).toEqual(dealRival(on(THREE_OF_THREE, 5), 1234))
    expect(dealRival(on([...THREE_OF_THREE].reverse(), 5), 1234)).toEqual(dealRival(on(THREE_OF_THREE, 5), 1234))
  })

  it('cada carta repartida lleva su nombre; las agregadas con el buscador entran igual que las del catálogo', () => {
    const dealt = dealRival(on([pick(60242223, 2, 'Bystial Saronir'), { ...ASH, copies: 1 }], 3), 9)!

    expect(dealt.rival.hand.sort()).toEqual(['rival.card-14558127-1', 'rival.card-60242223-1', 'rival.card-60242223-2'])
    expect(dealt.names).toEqual({ 'rival.card-14558127-1': 'Ash Blossom & Joyous Spring', 'rival.card-60242223-1': 'Bystial Saronir', 'rival.card-60242223-2': 'Bystial Saronir' })
    expect(rivalCardOf('rival.card-14558127-2')).toBe('card-14558127-2')
    expect(rivalCardOf('card-14558127-2')).toBe('card-14558127-2')
  })

  it('nunca más de 3 copias de una carta, ni la misma carta dos veces, ni una mano fuera de 1 a 5', () => {
    const hand = dealRival(on([{ ...ASH, copies: 7 }, { ...ASH, copies: 3 }], 5), 3)!.rival.hand

    expect(hand.sort()).toEqual(['rival.card-14558127-1', 'rival.card-14558127-2', 'rival.card-14558127-3'])
    expect(dealRival(on(THREE_OF_THREE, 9), 3)?.rival.hand).toHaveLength(5)
    expect(dealRival(on(THREE_OF_THREE, 0), 3)?.rival.hand).toHaveLength(1)
  })

  it('apagado, o sin ninguna carta, no hay mano del rival (la mesa queda como siempre)', () => {
    expect(dealRival({ enabled: false, picks: [ASH], hand: 3 }, 1)).toBeNull()
    expect(dealRival(on([], 3), 1)).toBeNull()
  })
})

describe('el rival del duelo automático', () => {
  const GAMMA = pick(38814750, 2, 'PSY-Framegear Gamma')

  it('apagado es el pasivo; encendido, su deck son las copias elegidas en el orden de la hoja (con Gamma o Delta, también un PSY-Frame Driver)', () => {
    expect(autoRival({ enabled: false, picks: [ASH], hand: 3 })).toBeNull()
    expect(autoRival(on([], 3))).toBeNull()
    expect(autoRival(on([{ ...VEILER, copies: 2 }, ASH], 3))?.main).toEqual([[97268402, 2], [14558127, 1]])
    expect(autoRival(on([ASH, GAMMA], 3))?.main).toEqual([[14558127, 1], [38814750, 2], [49036338, 1]])
    expect(autoRival(on([GAMMA, pick(74203495, 1, 'PSY-Framegear Delta')], 3))?.main).toEqual([[38814750, 2], [74203495, 1], [49036338, 1]])
  })

  it('su mano es la que repartiría el simulador con esa semilla, en passcodes', () => {
    const rival = autoRival(on(THREE_OF_THREE, 3))!

    for (const seed of SEEDS.slice(0, 40)) expect(rival.hand(seed)).toEqual(dealRival(on(THREE_OF_THREE, 3), seed)!.rival.hand.map(passcodeOf))
    expect(new Set(SEEDS.slice(0, 40).map((seed) => rival.hand(seed).join())).size).toBeGreaterThan(1)
  })

  it('cada handtrap del catálogo tiene su regla (también la tienen Fydraulis Harmonia, PSY-Framegear Delta, Dominus Spark, Dominus Spiral, el Droll & Lock Bird original y las de H3 que no están en el catálogo, del buscador)', () => {
    expect(Object.keys(AUTO_RULES).map(Number).sort()).toEqual([...HANDTRAP_CATALOG.map((card) => card.id), 70088809, 74203495, 6325660, 42091632, 94145021, ...H3_SEARCH].sort())
  })
})

const GAIA: ExtraPick = { id: 97204936, name: 'Gaia Knight, the Force of Earth', kind: 'synchro' }
const SCRAP: ExtraPick = { id: 45815891, name: 'Scrap Archfiend', kind: 'synchro' }

describe('lo que se recuerda del simulador', () => {
  const storage = memory()
  const read = (value: string) => {
    storage.setItem(HANDTRAP_CONFIG_KEY, value)
    return readHandtrapConfig(() => storage)
  }

  it('sin nada guardado: apagado, con Ash Blossom, Effect Veiler e Infinite Impermanence (una copia de cada una) y 3 en la mano', () => {
    expect(readHandtrapConfig(memory)).toEqual({ enabled: false, picks: [ASH, VEILER, IMPERM], hand: 3, extra: DEFAULT_RIVAL_EXTRA })
    expect(DEFAULT_HANDTRAP_CONFIG).toEqual({ enabled: false, picks: [ASH, VEILER, IMPERM], hand: 3, extra: DEFAULT_RIVAL_EXTRA })
  })

  it('lo que se guarda vuelve igual, también un deck del rival grande (no tiene tope)', () => {
    const config = { ...on([...HANDTRAP_CATALOG.map((card) => ({ ...card, copies: 3 })), pick(60242223, 2, 'Bystial Saronir')], 5), extra: [SCRAP, GAIA, SCRAP] }

    writeHandtrapConfig(config, () => storage)
    expect(readHandtrapConfig(() => storage)).toEqual(config)
    expect(poolCount(readHandtrapConfig(() => storage).picks)).toBe(HANDTRAP_CATALOG.length * 3 + 2)
  })

  it('lo guardado antes de la mano de 1 a 5 (sin `hand`) sigue valiendo: sus cartas son el deck del rival y la mano es de 3', () => {
    expect(read(JSON.stringify({ enabled: true, picks: [{ ...VEILER, copies: 2 }, ASH] }))).toEqual({ enabled: true, picks: [{ ...VEILER, copies: 2 }, ASH], hand: 3, extra: DEFAULT_RIVAL_EXTRA })
  })

  it('el Extra Deck: lo guardado antes (sin `extra`) usa el de siempre; vacío es vacío; se acota a 15 y a 3 copias por carta, y lo que no se entiende queda afuera', () => {
    expect(read(JSON.stringify({ enabled: true, picks: [ASH], hand: 3 })).extra).toEqual(DEFAULT_RIVAL_EXTRA)
    expect(read(JSON.stringify({ enabled: true, picks: [ASH], extra: [] })).extra).toEqual([])
    expect(read(JSON.stringify({ enabled: true, picks: [ASH], extra: 'Stardust' })).extra).toEqual(DEFAULT_RIVAL_EXTRA)
    expect(read(JSON.stringify({ enabled: true, picks: [ASH], extra: [GAIA, GAIA, GAIA, GAIA, SCRAP, { ...GAIA, kind: 'ritual' }, { id: 1, name: ' ', kind: 'xyz' }, null] })).extra).toEqual([GAIA, GAIA, GAIA, SCRAP])
    expect(read(JSON.stringify({ enabled: true, picks: [ASH], extra: [...DEFAULT_RIVAL_EXTRA, GAIA] })).extra).toEqual(DEFAULT_RIVAL_EXTRA)
  })

  it('el Extra Deck no cambia la mano que se reparte para una semilla (`dealRival` no lo mira): lo guardado antes reparte igual', () => {
    const before = on(THREE_OF_THREE, 3)

    for (const seed of SEEDS.slice(0, 20)) expect(dealRival({ ...before, extra: [] }, seed)).toEqual(dealRival(before, seed))
    expect(autoRival(before)!.extra).toEqual(DEFAULT_RIVAL_EXTRA.map((card) => [card.id, 1]))
    expect(autoRival({ ...before, extra: [SCRAP, GAIA] })!.extra).toEqual([[SCRAP.id, 1], [GAIA.id, 1]])
  })

  it('avisa qué handtraps piden un Extra Deck que no está: Fydraulis Harmonia sin ningún Sincro', () => {
    const harmonia = pick(70088809, 1, 'Fydraulis Harmonia')

    expect(missingExtra([ASH, harmonia], [])).toEqual([harmonia])
    expect(missingExtra([ASH, harmonia], [{ ...GAIA, kind: 'xyz' }])).toEqual([harmonia])
    expect(missingExtra([ASH, harmonia], [GAIA])).toEqual([])
    expect(extraKindOf('synchro_pendulum')).toBe('synchro')
    expect(extraKindOf('effect')).toBeNull()
  })

  it('la mano se acota de 1 a 5, y si no es un número es de 3', () => {
    const handOf = (hand: unknown) => read(JSON.stringify({ enabled: true, picks: [ASH], hand })).hand

    expect([handOf(9), handOf(0), handOf(-2), handOf(2.6), handOf('x'), handOf(null)]).toEqual([5, 1, 1, 3, 3, 3])
  })

  it('lo que no se entiende vuelve a lo de siempre, campo por campo; sin cartas, vuelven las de siempre (la mano lleva al menos una)', () => {
    expect(read('{basura')).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read('[1, 2]')).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read('{}')).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read(JSON.stringify({ enabled: 'sí', picks: 'Ash' }))).toEqual(DEFAULT_HANDTRAP_CONFIG)
    expect(read(JSON.stringify({ enabled: true, picks: [], hand: 4 }))).toEqual({ ...DEFAULT_HANDTRAP_CONFIG, enabled: true, hand: 4 })
    // Un Extra que no se entiende entero, el de siempre.
    expect(read(JSON.stringify({ enabled: true, picks: [{ id: -1, name: 'X', copies: 1 }, { id: 2, name: '  ', copies: 1 }, { id: 3, name: 'Sin copias' }, 'nada', null] }))).toEqual({ ...DEFAULT_HANDTRAP_CONFIG, enabled: true })
  })

  it('las copias fuera de 1 a 3 se acotan y una carta repetida queda una vez (la primera manda), sin recortar el total', () => {
    expect(read(JSON.stringify({ enabled: true, picks: [{ id: 1, name: ' Ash ', copies: 0 }, { id: 2, name: 'Veiler', copies: 9 }, { id: 3, name: 'Imperm', copies: 1.6 }] })).picks).toEqual([pick(1, 1, 'Ash'), pick(2, 3, 'Veiler'), pick(3, 2, 'Imperm')])
    expect(read(JSON.stringify({ enabled: true, picks: [{ id: 1, name: 'Ash', copies: 1 }, { id: 1, name: 'Otra', copies: 3 }] })).picks).toEqual([pick(1, 1, 'Ash')])
    expect(poolCount(read(JSON.stringify({ enabled: true, picks: [pick(1, 3), pick(2, 3), pick(3, 3), pick(4, 3)] })).picks)).toBe(12)
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
