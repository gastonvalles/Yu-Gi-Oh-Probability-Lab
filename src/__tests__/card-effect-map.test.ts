import { describe, expect, it } from 'vitest'

import {
  getCardEffectMap,
  indexCardEffectMap,
  setCardEffectMapForTests,
  type CardEffectMapData,
} from '../app/card-effect-data'
import { EFFECT_FACT, effectFactNames } from '../app/card-effect-facts'
import { alignEffects, allowedClasses, classOf, EFFECT_PLACE, logicalEffects, mismatches, verifiedEffects } from '../app/card-effect-map'
import { readCardScript } from '../app/card-script-rules'
import { effectSentences } from '../app/card-text'
import CARD_EFFECT_MAP from '../data/card-effect-map.json'

const lua = (...lines: string[]) => ['local s,id=GetID()', 'function s.initial_effect(c)', ...lines, 'end'].join('\n')
const effect = (name: string, ...setters: string[]) => [
  `\tlocal ${name}=Effect.CreateEffect(c)`,
  ...setters.map((setter) => `\t${name}:${setter}`),
  `\tc:RegisterEffect(${name})`,
].join('\n')
const logical = (script: string) => logicalEffects(readCardScript(script, 'all').effects)

// Masked HERO Dusk Crow: una ignición desde la mano (con costo) y un disparo que el script registra dos veces (`Clone`: Normal y Special Summon).
const DUSK_CROW_SCRIPT = lua(
  effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_HAND)', 'SetCountLimit(1,id)', 'SetCost(s.spcost)', 'SetOperation(s.spop)'),
  effect('e2', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_SUMMON_SUCCESS)', 'SetCountLimit(1,{id,1})', 'SetOperation(s.thop)'),
  '\tlocal e3=e2:Clone()\n\te3:SetCode(EVENT_SPSUMMON_SUCCESS)\n\tc:RegisterEffect(e3)',
)
const DUSK_CROW_TEXT =
  'If this card is in your hand: You can banish 1 "HERO" monster from your GY; Special Summon this card. If this card is Normal or Special Summoned: You can add 1 "Masked HERO" monster from your Deck or GY to your hand, except "Masked HERO Dusk Crow". You can only use each effect of "Masked HERO Dusk Crow" once per turn.'

describe('logicalEffects: los efectos que se activan, con sus clones juntos', () => {
  it('el tipo de cada uno: rápido, de disparo o de ignición', () => {
    const [quick, trigger, ignition] = logical(
      lua(
        effect('e1', 'SetType(EFFECT_TYPE_QUICK_O)', 'SetRange(LOCATION_MZONE)'),
        effect('e2', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F)', 'SetCode(EVENT_SUMMON_SUCCESS)'),
        effect('e3', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)'),
      ),
    )

    expect([quick?.cls, trigger?.cls, ignition?.cls]).toEqual(['quick', 'trigger', 'ignition'])
  })

  it('un Clone que sólo cambia el rango o el evento es el mismo efecto, con todos sus rangos', () => {
    const effects = logical(DUSK_CROW_SCRIPT)

    expect(effects.map((one) => one.cls)).toEqual(['ignition', 'trigger'])
    expect(effects[1]!.members).toHaveLength(2)

    const [quick] = logical(
      lua(effect('e1', 'SetType(EFFECT_TYPE_QUICK_O)', 'SetRange(LOCATION_MZONE)', 'SetCountLimit(1,id)'), '\tlocal e2=e1:Clone()\n\te2:SetRange(LOCATION_HAND)\n\tc:RegisterEffect(e2)'),
    )

    expect(quick!.members).toHaveLength(2)
    expect(quick!.ranges).toBe('LOCATION_MZONE|LOCATION_HAND')
  })

  it('un Clone que cambia otra cosa (el límite, el costo…) es otro efecto', () => {
    const effects = logical(
      lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetCountLimit(1,id)'), '\tlocal e2=e1:Clone()\n\te2:SetCountLimit(1,{id,1})\n\tc:RegisterEffect(e2)'),
    )

    expect(effects).toHaveLength(2)
  })

  it('los efectos continuos, las reglas y las activaciones de Mágicas y Trampas no cuentan', () => {
    const effects = logical(
      lua(
        effect('e1', 'SetType(EFFECT_TYPE_SINGLE)', 'SetCode(EFFECT_CANNOT_ATTACK)'),
        effect('e2', 'SetType(EFFECT_TYPE_FIELD)', 'SetCode(EFFECT_CANNOT_SUMMON)'),
        effect('e3', 'SetType(EFFECT_TYPE_ACTIVATE)', 'SetCode(EVENT_FREE_CHAIN)'),
      ),
    )

    expect(effects).toEqual([])
    expect(classOf({ ...readCardScript(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)')), 'all').effects[0]!, type: 'EFFECT_TYPE_SINGLE' })).toBeNull()
  })
})

describe('allowedClasses: qué efecto del script puede ser una frase, por cómo abre', () => {
  const classes = (text: string) => allowedClasses(effectSentences(text)[0]!)

  it('lo que dice «(Quick Effect)» es rápido', () => {
    expect(classes('When a card or effect is activated (Quick Effect): You can discard this card; negate that effect.')).toEqual(['quick'])
  })

  it('«Once per turn:» y «You can …;» solos son de ignición o rápidos (el texto viejo no lleva «(Quick Effect)»)', () => {
    expect(classes('Once per turn: You can Special Summon 1 monster.')).toEqual(['ignition', 'quick'])
    expect(classes('You can discard 1 card; draw 1 card.')).toEqual(['ignition', 'quick'])
  })

  it('un suceso («is sent to the GY», «is Normal Summoned») es un disparo o un rápido; un estado («is in your GY», «you control») es una ignición o un rápido', () => {
    expect(classes('If this card is sent to the GY: You can add 1 monster from your Deck to your hand.')).toEqual(['trigger', 'quick'])
    expect(classes('If this card is in your GY: You can target 1 monster in your GY; Special Summon it.')).toEqual(['ignition', 'quick'])
    expect(classes('If you control no monsters: You can Special Summon this card from your hand.')).toEqual(['ignition', 'quick'])
  })

  it('un «while» agrega un estado a un suceso: lo que decide es lo que está antes', () => {
    expect(classes('If this card is sent to the GY while you control no monsters: You can draw 1 card.')).toEqual(['trigger', 'quick'])
  })

  it('un encabezado que no se sabe leer deja pasar a las tres clases (no adivina)', () => {
    expect(classes('If your opponent Special Summons a monster(s): You can draw 1 card.')).toEqual(['trigger', 'quick', 'ignition'])
  })
})

describe('mismatches: cuántas señales de la frase contradice el efecto', () => {
  const [triggerWithCost] = logical(lua(effect('e1', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_TO_GRAVE)', 'SetCost(s.cost)')))
  const [plainIgnition] = logical(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)')))
  const sentence = (text: string) => effectSentences(text)[0]!

  it('ninguna si todo lo que dice la frase está en el efecto (lo que el efecto declara de más no cuenta)', () => {
    expect(mismatches(sentence('If this card is sent to the GY: You can discard 1 card; draw 1 card.'), triggerWithCost!)).toBe(0)
    expect(mismatches(sentence('If this card is sent to the GY: You can draw 1 card.'), triggerWithCost!)).toBe(0)
  })

  it('una por cada cosa que la frase dice y el efecto no tiene: la clase, el costo, el objetivo y el «Once per turn:»', () => {
    // Una ignición sin costo, sin objetivo y sin límite para una frase de suceso, con costo, con objetivo y de «Once per turn».
    expect(mismatches(sentence('If this card is sent to the GY: You can discard 1 card; draw 1 card.'), plainIgnition!)).toBe(2)
    expect(mismatches(sentence('If this card is sent to the GY: You can target 1 monster in your GY; Special Summon it.'), plainIgnition!)).toBe(2)
    expect(mismatches(sentence('Once per turn: You can draw 1 card.'), plainIgnition!)).toBe(1)
  })
})

describe('mismatches: el lugar desde donde se activa', () => {
  const sentence = (text: string) => effectSentences(text)[0]!
  const [fromField] = logical(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)')))
  const [fromGrave] = logical(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_GRAVE)')))
  const [noRange] = logical(lua(effect('e1', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_TO_GRAVE)')))

  it('si la frase dice que se activa desde el Cementerio o la mano y el efecto declara otro rango, es una contradicción más', () => {
    expect(mismatches(sentence('If this card is in your GY: You can draw 1 card.'), fromField!)).toBe(1)
    expect(mismatches(sentence('If this card is in your GY: You can draw 1 card.'), fromGrave!)).toBe(0)
    expect(mismatches(sentence('If this card is in your hand: You can draw 1 card.'), fromField!)).toBe(1)
  })

  it('un efecto sin ningún rango (un disparo) no dice nada del lugar: no contradice', () => {
    expect(mismatches(sentence('If this card is in your GY: You can draw 1 card.'), noRange!)).toBe(1 /* la clase: un estado no es un disparo */)
    expect(mismatches(sentence('If this card is sent to the GY: You can draw 1 card.'), noRange!)).toBe(0)
  })

  it('«this card from your hand» es el lugar de la carta salvo cuando es con lo que se compara («the same Level as this card», «lower than this card»)', () => {
    const summon = 'You can Special Summon this card from your hand; draw 1 card.'
    const compare = 'During your Main Phase: You can Special Summon 1 monster with the same Attribute and Level as this card from your hand.'
    const lower = 'During your Main Phase: You can Special Summon 1 Fiend monster with a Level lower than this card from your hand.'

    expect(verifiedEffects(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE+LOCATION_HAND)', 'SetCountLimit(1)')), summon)?.map((one) => one.places)).toEqual([EFFECT_PLACE.hand])
    expect(verifiedEffects(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetCountLimit(1)')), compare)?.map((one) => one.places)).toEqual([EFFECT_PLACE.field])
    expect(verifiedEffects(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetCountLimit(1)')), lower)?.map((one) => one.places)).toEqual([EFFECT_PLACE.field])
  })
})

describe('alignEffects: sólo lo que las señales obligan', () => {
  it('Dusk Crow: la ignición desde la mano con costo y el disparo con clon, cada frase con su efecto', () => {
    const pairs = alignEffects(effectSentences(DUSK_CROW_TEXT), logical(DUSK_CROW_SCRIPT))

    expect(pairs?.map((pair) => pair.effect.cls)).toEqual(['ignition', 'trigger'])
    expect(pairs?.map((pair) => pair.sentence.text.slice(0, 20))).toEqual(['If this card is in y', 'If this card is Norm'])
  })

  it('un solo efecto se alinea si no hay contradicción; con una contradicción (la frase paga un costo y el efecto no) no se alinea nada', () => {
    const text = 'You can discard 1 card; draw 1 card.'

    expect(alignEffects(effectSentences(text), logical(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetCost(s.cost)'))))).toHaveLength(1)
    expect(alignEffects(effectSentences(text), logical(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)'))))).toBeNull()
  })

  it('distinto número de frases que de efectos: no se alinea', () => {
    const text = 'If this card is sent to the GY: You can draw 1 card. If this card is Normal Summoned: You can draw 1 card.'
    const [one] = logical(lua(effect('e1', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_TO_GRAVE)')))

    expect(alignEffects(effectSentences(text), [one!])).toBeNull()
    expect(alignEffects([], [])).toBeNull()
  })

  it('dos efectos que no se distinguen: no se alinea (hay dos formas de armar los pares)', () => {
    const text = 'You can Special Summon this card; draw 1 card. You can send 1 card; draw 1 card.'
    const script = lua(
      effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetCountLimit(1,id)'),
      effect('e2', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetCountLimit(1,{id,1})'),
    )

    expect(alignEffects(effectSentences(text), logical(script))).toBeNull()
  })

  it('una forma que se sostiene por una sola señal tampoco se alinea (si esa señal estuviera mal leída, el resultado cambiaría)', () => {
    // Las dos son disparos; sólo el objetivo las distingue, y la frase de objetivo lo dice. Intercambiadas, hay una sola contradicción.
    const text = 'If this card is sent to the GY: You can add 1 monster from your Deck to your hand. If this card is Normal Summoned: You can target 1 monster in your GY; Special Summon it.'
    const script = lua(
      effect('e1', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_TO_GRAVE)'),
      effect('e2', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_SUMMON_SUCCESS)', 'SetProperty(EFFECT_FLAG_CARD_TARGET)'),
    )

    expect(alignEffects(effectSentences(text), logical(script))).toBeNull()
  })

  it('con dos señales que lo sostienen sí (el objetivo y el costo, intercambiados, serían dos contradicciones)', () => {
    const text = 'If this card is sent to the GY: You can add 1 monster from your Deck to your hand. If this card is Normal Summoned: You can discard 1 card, then target 1 monster in your GY; Special Summon it.'
    const script = lua(
      effect('e1', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_TO_GRAVE)'),
      effect('e2', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_SUMMON_SUCCESS)', 'SetProperty(EFFECT_FLAG_CARD_TARGET)', 'SetCost(s.cost)'),
    )

    expect(alignEffects(effectSentences(text), logical(script))?.map((pair) => pair.effect.cost !== '')).toEqual([false, true])
  })
})

describe('verifiedEffects: lo que las dos fuentes dicen de cada efecto', () => {
  it('Dusk Crow: la mano y el costo del primero; los dos, una vez por turno por nombre (el texto lo dice de «cada efecto»)', () => {
    const effects = verifiedEffects(DUSK_CROW_SCRIPT, DUSK_CROW_TEXT)

    expect(effects?.map((one) => effectFactNames(one.facts))).toEqual([['once', 'hardOnce', 'cost'], ['once', 'hardOnce']])
    expect(effects?.map((one) => one.places)).toEqual([EFFECT_PLACE.hand, 0])
    expect(effects?.map((one) => one.start)).toEqual([0, DUSK_CROW_TEXT.indexOf('If this card is Normal')])
  })

  it('lo que sólo una fuente dice no se confirma: el límite que sólo declara el script y el que sólo dice el texto', () => {
    const text = 'If this card is sent to the GY: You can draw 1 card. Once per turn, during your Main Phase: You can discard 1 card, then target 1 monster in your GY; Special Summon it.'
    const script = lua(
      effect('e1', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_TO_GRAVE)', 'SetCountLimit(1,id)'),
      effect('e2', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetCost(s.cost)', 'SetProperty(EFFECT_FLAG_CARD_TARGET)'),
    )

    // Primero: el script dice «una vez por turno» y el texto no. Segundo: el texto lo dice y el script no; el costo y el objetivo sí los dicen los dos.
    expect(verifiedEffects(script, text)?.map((one) => one.facts)).toEqual([0, EFFECT_FACT.cost | EFFECT_FACT.target])
  })

  const SHARING_TEXT =
    'If this card is sent to the GY: You can draw 1 card. You can discard 1 card, then target 1 monster in your GY; Special Summon it. You can only use 1 of the following effects of "X" per turn, and only once that turn.'
  const sharing = (second: string) =>
    lua(
      effect('e1', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_TO_GRAVE)', 'SetCountLimit(1,id)'),
      effect('e2', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetCost(s.cost)', 'SetProperty(EFFECT_FLAG_CARD_TARGET)', second),
    )

  it('el límite compartido («1 of the following effects») lo dicen el texto y el script (el mismo código en los dos efectos): los dos lo comparten y para cada uno vale «una vez por turno por nombre»', () => {
    const effects = verifiedEffects(sharing('SetCountLimit(1,id)'), SHARING_TEXT)

    expect(effects?.map((one) => effectFactNames(one.facts))).toEqual([
      ['once', 'hardOnce', 'shared'],
      ['once', 'hardOnce', 'cost', 'target', 'shared'],
    ])
  })

  it('con códigos distintos en el script, o sin la frase en el texto, el límite no se comparte (el texto y el script no lo dicen los dos)', () => {
    // Códigos distintos: cada efecto tiene el suyo (y el texto, que dice que se comparte, no lo confirma el script).
    expect(verifiedEffects(sharing('SetCountLimit(1,{id,1})'), SHARING_TEXT)?.map((one) => one.facts & EFFECT_FACT.shared)).toEqual([0, 0])
    // El mismo código pero el texto no dice que se comparta: el motor lo comparte, la carta no lo dice.
    const quiet = SHARING_TEXT.replace(' You can only use 1 of the following effects of "X" per turn, and only once that turn.', '')

    expect(verifiedEffects(sharing('SetCountLimit(1,id)'), quiet)?.map((one) => one.facts & (EFFECT_FACT.shared | EFFECT_FACT.hardOnce))).toEqual([0, 0])
  })

  it('un efecto y la activación de la Mágica comparten el límite («1 "X" effect per turn»): la activación no es un efecto del texto pero cuenta como quien lo usa', () => {
    const text = 'Activate this card by targeting 1 monster; destroy it. If this card is in your GY: You can banish this card; draw 1 card. You can only use 1 "X" effect per turn, and only once that turn.'
    const script = lua(
      effect('e1', 'SetType(EFFECT_TYPE_ACTIVATE)', 'SetCode(EVENT_FREE_CHAIN)', 'SetCountLimit(1,id)', 'SetOperation(s.activate)'),
      effect('e2', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_GRAVE)', 'SetCountLimit(1,id)', 'SetCost(Cost.SelfBanish)'),
    )

    expect(verifiedEffects(script, text)?.map((one) => [effectFactNames(one.facts), one.places])).toEqual([[['once', 'hardOnce', 'cost', 'shared'], EFFECT_PLACE.grave]])
  })

  it('el campo se confirma con el script y sin que la frase nombre otro lugar; la mano y el Cementerio, con las dos fuentes', () => {
    const fromField = verifiedEffects(lua(effect('e1', 'SetType(EFFECT_TYPE_QUICK_O)', 'SetRange(LOCATION_MZONE)', 'SetCountLimit(1)')), 'Once per turn (Quick Effect): You can draw 1 card.')
    // Rango de la mano y del campo, pero la frase dice «discard this card»: sólo se confirma la mano.
    const fromHand = verifiedEffects(
      lua(effect('e1', 'SetType(EFFECT_TYPE_QUICK_O)', 'SetRange(LOCATION_MZONE+LOCATION_HAND)', 'SetCost(Cost.SelfDiscard)')),
      '(Quick Effect): You can discard this card; draw 1 card.',
    )
    const fromGrave = verifiedEffects(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_GRAVE)', 'SetCost(s.cost)')), 'If this card is in your GY: You can banish this card from your GY; draw 1 card.')

    expect(fromField?.map((one) => one.places)).toEqual([EFFECT_PLACE.field])
    expect(fromHand?.map((one) => one.places)).toEqual([EFFECT_PLACE.hand])
    expect(fromGrave?.map((one) => one.places)).toEqual([EFFECT_PLACE.grave])
  })

  it('la zona de Mágicas y Trampas se confirma con el script y sin que la frase nombre otro lugar; la Zona de Péndulo, con el script y la sección «Pendulum Effect» del texto', () => {
    const continuous = verifiedEffects(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_SZONE)', 'SetCountLimit(1)')), 'Once per turn: You can draw 1 card.')
    const field = verifiedEffects(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_FZONE)', 'SetCountLimit(1)')), 'Once per turn: You can draw 1 card.')
    const pendulumText = '[ Pendulum Effect ] \nOnce per turn: You can draw 1 card.\n\n[ Monster Effect ] \nIf this card is in your hand: You can discard this card; draw 1 card.'
    const pendulum = verifiedEffects(
      lua(
        effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_PZONE)', 'SetCountLimit(1)'),
        effect('e2', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_HAND)', 'SetCost(Cost.SelfDiscard)'),
      ),
      pendulumText,
    )

    expect(continuous?.map((one) => one.places)).toEqual([EFFECT_PLACE.spellTrap])
    expect(field?.map((one) => one.places)).toEqual([EFFECT_PLACE.spellTrap])
    // El efecto de Péndulo es el de la escala; el del monstruo, desde la mano.
    expect(pendulum?.map((one) => one.places)).toEqual([EFFECT_PLACE.pendulum, EFFECT_PLACE.hand])
    // La Zona de Péndulo que sólo declara el script, con la frase en la parte del monstruo, no se confirma.
    const monsterPart = verifiedEffects(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_PZONE)', 'SetCountLimit(1)')), '[ Monster Effect ] \nOnce per turn: You can draw 1 card.')

    expect(monsterPart?.map((one) => one.places & EFFECT_PLACE.pendulum)).toEqual([0])
  })

  it('una carta que no se alinea no tiene mapa', () => {
    expect(verifiedEffects('', DUSK_CROW_TEXT)).toBeNull()
    // Un costo en la frase que el script no declara: contradicción, no se alinea.
    expect(verifiedEffects(lua(effect('e1', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)')), 'You can discard 1 card; draw 1 card.')).toBeNull()
  })
})

describe('src/data/card-effect-map.json (lo que escribe scripts/build-card-effects.mjs)', () => {
  const data = CARD_EFFECT_MAP as unknown as CardEffectMapData
  const index = indexCardEffectMap(data)
  const FACTS = Object.values(EFFECT_FACT).reduce((all, bit) => all | bit, 0)
  const PLACES = Object.values(EFFECT_PLACE).reduce((all, bit) => all | bit, 0)

  it('guarda el commit de los scripts y las cartas alineadas: de varios efectos, o de uno solo si es rápido; en orden y con máscaras válidas', () => {
    expect(data.scripts).toMatch(/^[0-9a-f]{7,}$/)
    expect(index.size).toBeGreaterThan(1_000)

    for (const [id, effects] of index) {
      expect(effects.length >= 2 || ((effects[0]![1] ?? 0) & EFFECT_FACT.quick) !== 0, String(id)).toBe(true)
      expect(effects.map(([start]) => start), String(id)).toEqual([...effects.map(([start]) => start)].sort((left, right) => left - right))

      for (const [start, facts, places] of effects) {
        expect(Number.isInteger(start) && start >= 0, String(id)).toBe(true)
        expect(facts & ~FACTS, String(id)).toBe(0)
        expect(places & ~PLACES, String(id)).toBe(0)
      }
    }
  })

  it('también hay Mágicas y Trampas, escalas de Péndulo y límites compartidos', () => {
    // Starlight Junktion (Mágica de Campo): dos efectos que se activan desde la zona de Mágicas y Trampas.
    expect(index.get(1003840)?.map(([, , places]) => places)).toEqual([EFFECT_PLACE.spellTrap, EFFECT_PLACE.spellTrap])
    // Code Hack (una Trampa): el efecto de la Trampa desde la zona de Mágicas y Trampas y el rápido desde el Cementerio.
    expect(index.get(33750856)?.map(([, , places]) => places)).toEqual([EFFECT_PLACE.spellTrap, EFFECT_PLACE.grave])
    // Twilight Ninja Kagen (Péndulo): el efecto de la escala se activa desde la Zona de Péndulo; el del monstruo, desde el campo.
    expect(index.get(6830480)?.map(([, , places]) => places)).toEqual([EFFECT_PLACE.pendulum, EFFECT_PLACE.field])
    // Aileron: sus dos efectos comparten el límite («1 of the following effects»), y para cada uno vale una vez por turno por nombre.
    expect(index.get(96084564)?.map(([, facts]) => [(facts & EFFECT_FACT.shared) !== 0, (facts & EFFECT_FACT.hardOnce) !== 0])).toEqual([
      [true, true],
      [true, true],
    ])
  })

  it('Dusk Crow sale con lo suyo, y si el texto cambió (las frases ya no empiezan donde estaban) no se dice nada', () => {
    setCardEffectMapForTests(index)

    try {
      const effects = getCardEffectMap(10808715, DUSK_CROW_TEXT)

      expect(effects?.map((one) => [effectFactNames(one.facts), one.places])).toEqual([
        [['once', 'hardOnce', 'cost'], EFFECT_PLACE.hand],
        [['once', 'hardOnce'], 0],
      ])
      expect(effects?.[0]?.sentence.text).toMatch(/^If this card is in your hand/)

      expect(getCardEffectMap(10808715, `Texto nuevo. ${DUSK_CROW_TEXT}`)).toBeUndefined()
      expect(getCardEffectMap(14558127, DUSK_CROW_TEXT)).toBeUndefined()
    } finally {
      setCardEffectMapForTests(null)
    }
  })

  it('antes de que lleguen los datos no dice nada', () => {
    expect(getCardEffectMap(10808715, DUSK_CROW_TEXT)).toBeUndefined()
  })
})
