import { describe, expect, it } from 'vitest'

import { capOf, flexOptions, flexPairs, freeSlots, isValidFlex } from '../app/bot-deck-edit'
import { ANGELECHY_DECK, BOT_DECK_LISTS, ELFNOTE_DECK, SKY, SKY_STRIKER_DECK } from '../app/bot-deck-lists'
import {
  autoRival,
  BOT_SWAP_CARDS,
  botBanlistIssues,
  botDeckMain,
  copiesByName,
  isBotModified,
  originalFlex,
  readHandtrapConfig,
  withBotFlex,
  writeHandtrapConfig,
  type HandtrapConfig,
} from '../app/handtraps'

const ASH = 14558127
const OGRE = 59438930
const VEILER = 97268402
const MAXX = 23434538
const IMPERMANENCE = 10045474
const DROLL = 94145021
const DROLL_ALT = 94145022
const NIBIRU = 27204311
// La banlist es la que rige hoy (la del TCG del 2026-10-19 al escribirlo): Maxx "C", Talent y Called prohibidas; Droll limitada; Engage! semi-limitada.
const total = (pairs: readonly (readonly [number, number])[]) => pairs.reduce((sum, [, copies]) => sum + copies, 0)
const copiesOf = (pairs: readonly (readonly [number, number])[]) => Object.fromEntries(pairs.map(([code, copies]) => [code, copies]))
/** La parte cambiable de Sky Striker con un cambio: `out` pierde una copia y `into` gana una. */
const swap = (list = SKY_STRIKER_DECK, out: number, into: number) => flexPairs({ ...copiesOf(originalFlex(list)), [out]: (copiesOf(originalFlex(list))[out] ?? 0) - 1, [into]: (copiesOf(originalFlex(list))[into] ?? 0) + 1 })

describe('cambiar cartas de un bot', () => {
  it('cada bot marca sus cartas cambiables, todas de su Main, y lo que se le puede poner lo sabe usar', () => {
    for (const list of BOT_DECK_LISTS) {
      expect(Object.keys(list.flex).length).toBeGreaterThan(0)
      expect(originalFlex(list).map(([code]) => code).sort()).toEqual(Object.keys(list.flex).map(Number).sort())
    }
    expect(total(originalFlex(SKY_STRIKER_DECK))).toBe(10)
    expect(total(originalFlex(ANGELECHY_DECK))).toBe(10)
    expect(total(originalFlex(ELFNOTE_DECK))).toBe(16)
    expect(BOT_SWAP_CARDS.map((card) => card.id)).toEqual(expect.arrayContaining([ASH, VEILER, MAXX, NIBIRU]))
    expect(BOT_SWAP_CARDS.map((card) => card.id)).not.toContain(IMPERMANENCE)
    // Una por nombre: Sky Striker ofrece su Droll & Lock Bird, no el otro arte.
    expect(flexOptions(SKY_STRIKER_DECK).filter((card) => card.name === 'Droll & Lock Bird').map((card) => card.id)).toEqual([DROLL])
  })

  it('las listas de fábrica valen (son legales) y sin cambios es el mismo Main', () => {
    for (const list of BOT_DECK_LISTS) {
      expect(isValidFlex(list, originalFlex(list))).toBe(true)
      expect(botDeckMain(list, originalFlex(list))).toBe(list.main)
      expect(botDeckMain(list, undefined)).toBe(list.main)
    }
  })

  it('un cambio de uno por uno deja el Main del mismo tamaño y el motor intacto', () => {
    const flex = swap(SKY_STRIKER_DECK, ASH, VEILER)
    const main = botDeckMain(SKY_STRIKER_DECK, flex)

    expect(main).not.toBe(SKY_STRIKER_DECK.main)
    expect(total(main)).toBe(total(SKY_STRIKER_DECK.main))
    expect(main.filter(([code]) => code === SKY.raye)).toEqual([[SKY.raye, 3]])
    expect(copiesByName(SKY_STRIKER_DECK, main).get('Effect Veiler')).toBe(1)
    expect(isValidFlex(SKY_STRIKER_DECK, flex)).toBe(true)
  })

  it('no deja cambiar el tamaño, tocar el motor, poner cartas que el bot no usa ni pasar 3 copias por nombre', () => {
    const flex = originalFlex(SKY_STRIKER_DECK)

    expect(botDeckMain(SKY_STRIKER_DECK, [...flex, [VEILER, 1]])).toBe(SKY_STRIKER_DECK.main)
    expect(botDeckMain(SKY_STRIKER_DECK, flexPairs({ ...copiesOf(flex), [ASH]: 2 }))).toBe(SKY_STRIKER_DECK.main)
    expect(botDeckMain(SKY_STRIKER_DECK, swap(SKY_STRIKER_DECK, ASH, SKY.raye))).toBe(SKY_STRIKER_DECK.main)
    expect(botDeckMain(SKY_STRIKER_DECK, swap(SKY_STRIKER_DECK, ASH, IMPERMANENCE))).toBe(SKY_STRIKER_DECK.main)
    // Ash ×3 + Ogre → Ash no puede subir a 4.
    expect(botDeckMain(SKY_STRIKER_DECK, swap(SKY_STRIKER_DECK, OGRE, ASH))).toBe(SKY_STRIKER_DECK.main)
    expect(isValidFlex(SKY_STRIKER_DECK, swap(SKY_STRIKER_DECK, OGRE, ASH))).toBe(false)
  })

  it('el banlist del jugador, sobre el Main entero y por nombre', () => {
    // Maxx "C" está prohibida; una Droll más (limitada, ya trae 1) tampoco, ni con el otro arte (cuenta con su nombre); otra Nibiru sí.
    expect(isValidFlex(SKY_STRIKER_DECK, swap(SKY_STRIKER_DECK, ASH, MAXX))).toBe(false)
    expect(isValidFlex(SKY_STRIKER_DECK, swap(SKY_STRIKER_DECK, ASH, DROLL))).toBe(false)
    expect(botDeckMain(SKY_STRIKER_DECK, swap(SKY_STRIKER_DECK, ASH, DROLL_ALT))).toBe(SKY_STRIKER_DECK.main)
    expect(isValidFlex(SKY_STRIKER_DECK, swap(SKY_STRIKER_DECK, ASH, NIBIRU))).toBe(true)
    // La lista de Pittsboro como se jugó (Talent, Called, 3 Engage! y 2 Droll): legal antes del 2026-10-19, no después; lo del motor también cuenta.
    const pittsboro = [...SKY_STRIKER_DECK.main.filter(([code]) => code !== SKY.engage && code !== DROLL), [SKY.engage, 3], [DROLL, 1], [DROLL_ALT, 1], [SKY.talent, 1], [SKY.called, 1]] as const
    const issues = (now: string) => botBanlistIssues(SKY_STRIKER_DECK, pittsboro, now).map(({ name, count, limit }) => [name, count, limit])

    expect(issues('2026-10-01')).toEqual([])
    expect(issues('2026-10-20')).toEqual([
      ['Sky Striker Mobilize - Engage!', 3, 2],
      ['Droll & Lock Bird', 2, 1],
      ['Triple Tactics Talent', 1, 0],
      ['Called by the Grave', 1, 0],
    ])
  })

  it('el contador de cada carta llega hasta lo que se puede poner', () => {
    const original = copiesOf(originalFlex(SKY_STRIKER_DECK))
    const oneFree = { ...original, [ASH]: 2 }

    expect(freeSlots(SKY_STRIKER_DECK, original)).toBe(0)
    expect(freeSlots(SKY_STRIKER_DECK, oneFree)).toBe(1)
    // Sin ranuras libres, nada sube; lo que ya está, se queda.
    expect(capOf(SKY_STRIKER_DECK, original, VEILER)).toBe(0)
    expect(capOf(SKY_STRIKER_DECK, original, ASH)).toBe(3)
    expect(capOf(SKY_STRIKER_DECK, oneFree, VEILER)).toBe(1)
    expect(capOf(SKY_STRIKER_DECK, oneFree, NIBIRU)).toBe(2)
    expect(capOf(SKY_STRIKER_DECK, oneFree, MAXX)).toBe(0)
    // Droll: limitada y ya trae 1: no sube.
    expect(capOf(SKY_STRIKER_DECK, oneFree, DROLL)).toBe(1)
  })

  it('se guarda uno por mazo, «Restaurar original» lo borra y lo inválido vuelve al original', () => {
    const store = new Map<string, string>()
    const storage = () => ({ getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) }) as unknown as Storage
    const base: HandtrapConfig = { ...readHandtrapConfig(storage), botDeck: 'sky-striker' }
    const flex = swap(SKY_STRIKER_DECK, ASH, VEILER)
    const changed = withBotFlex(base, SKY_STRIKER_DECK, flex)

    writeHandtrapConfig(changed, storage)
    const read = readHandtrapConfig(storage)

    expect(read.botFlex).toEqual({ 'sky-striker': flex })
    expect(isBotModified(read, SKY_STRIKER_DECK)).toBe(true)
    expect(isBotModified(read, ANGELECHY_DECK)).toBe(false)
    expect(total(autoRival(read)!.main)).toBe(total(SKY_STRIKER_DECK.main))
    expect(autoRival(read)!.main).toContainEqual([VEILER, 1])
    // Sin cambio, la sesión usa su lista.
    expect(autoRival(base)!.main).toEqual([])
    // Restaurar original (o guardar lo mismo que el original) borra el cambio.
    expect(withBotFlex(changed, SKY_STRIKER_DECK, null).botFlex).toBeUndefined()
    expect(withBotFlex(changed, SKY_STRIKER_DECK, originalFlex(SKY_STRIKER_DECK)).botFlex).toBeUndefined()

    // Una carta que ya no está (o lo que no se entiende) se ignora: el original.
    store.set('ygo-lab:rival-handtraps:v2', JSON.stringify({ ...JSON.parse(store.get('ygo-lab:rival-handtraps:v2')!), botFlex: { 'sky-striker': swap(SKY_STRIKER_DECK, ASH, 12345678), 'Mal Id': [[ASH, 1]], elfnote: 'x' } }))
    const broken = readHandtrapConfig(storage)

    expect(Object.keys(broken.botFlex ?? {})).toEqual(['sky-striker'])
    expect(isBotModified(broken, SKY_STRIKER_DECK)).toBe(false)
    expect(autoRival(broken)!.main).toEqual([])

    // Un cambio guardado que la banlist de hoy deja ilegal (Maxx "C"), también: juega el original.
    const banned = withBotFlex(base, SKY_STRIKER_DECK, swap(SKY_STRIKER_DECK, ASH, MAXX))

    expect(banned.botFlex).toBeDefined()
    expect(isBotModified(banned, SKY_STRIKER_DECK)).toBe(false)
    expect(autoRival(banned)!.main).toEqual([])
  })
})
