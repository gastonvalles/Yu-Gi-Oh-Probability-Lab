import { EFFECT_FACT, effectFactsOf, textEachEffectOnce, textEffectFacts } from './card-effect-facts'
import { readCardScript, type CardEffect } from './card-script-rules'
import { effectSentences, type EffectSentence } from './card-text'

/**
 * Alinear cada efecto del texto de una carta con su efecto del script de EDOPro (capa 1b del motor de cartas, `docs/motor-de-cartas.md`): saber que «esta frase» es «este efecto» y, con eso, de **cada** efecto, y no sólo de la
 * carta entera, desde dónde se activa, si es rápido, cuántas veces se puede usar, si lleva costo y si apunta.
 *
 * Regla de oro, la misma de siempre: **se alinea sólo lo que las restricciones obligan**. Cada par (frase, efecto) tiene que ser compatible (la velocidad, el costo, el objetivo, cómo abre la frase y qué tipo de efecto es) y
 * sólo se publica la carta si hay **una única** forma de armar los pares con las dos listas del mismo largo. Si hay dos formas (dos efectos que no se distinguen), ninguna o distinto número de frases que de efectos, no se
 * alinea nada: es mejor no saber que adivinar la frase de un efecto.
 */

/** Cómo se activa un efecto del script: `quick` (efecto rápido), `trigger` (se dispara por algo que pasó) o `ignition` (se activa cuando el jugador quiere, en su Main Phase). */
export type EffectClass = 'quick' | 'trigger' | 'ignition'

/** Un efecto del script que se activa, con sus clones (el mismo efecto desde otro lugar o por otro evento) juntos. */
export interface LogicalEffect {
  cls: EffectClass
  /** Los efectos del script que lo forman: el original y sus clones. */
  members: CardEffect[]
  /** Todos los rangos donde se activa (`LOCATION_HAND|LOCATION_MZONE`…), de todos sus miembros. */
  ranges: string
  cost: string
  property: string
  countLimit: string
}

export const classOf = (effect: CardEffect): EffectClass | null =>
  /EFFECT_TYPE_QUICK_[OF]\b/.test(effect.type) ? 'quick' : /EFFECT_TYPE_TRIGGER_[OF]\b/.test(effect.type) ? 'trigger' : /EFFECT_TYPE_IGNITION\b/.test(effect.type) ? 'ignition' : null

/** Lo que tienen que tener igual dos efectos para ser el mismo (un `Clone` que sólo cambia el rango o el evento). */
const SAME = ['type', 'target', 'operation', 'countLimit', 'cost', 'condition', 'property', 'category'] as const

/**
 * Los efectos que se activan (rápidos, de disparo y de ignición) con sus clones juntos: `e2 = e1:Clone()` que sólo cambia el rango o el evento es el mismo efecto, y el texto lo dice una sola vez («If this card is Normal
 * or Special Summoned»). Los efectos continuos, las reglas de invocación y las activaciones de Mágicas y Trampas no cuentan.
 */
export function logicalEffects(effects: readonly CardEffect[]): LogicalEffect[] {
  const groups = new Map<number, CardEffect[]>()
  const out: LogicalEffect[] = []

  for (const effect of effects) {
    if (classOf(effect) === null) continue

    if (effect.origin < 0) {
      out.push(logical([effect]))
    } else {
      groups.set(effect.origin, [...(groups.get(effect.origin) ?? []), effect])
    }
  }

  for (const group of groups.values()) {
    const [first] = group
    const same = group.every((member) => SAME.every((field) => member[field] === first![field]))

    if (same) out.push(logical(group))
    else out.push(...group.map((member) => logical([member])))
  }

  return out
}

function logical(members: CardEffect[]): LogicalEffect {
  const [first] = members as [CardEffect, ...CardEffect[]]

  return { cls: classOf(first)!, members, ranges: members.map((member) => member.range).join('|'), cost: first.cost, property: first.property, countLimit: first.countLimit }
}

/** Una condición que habla de algo que está (`If this card is in your GY`, `If you control no monsters`): se activa cuando uno quiere, no por un suceso. */
const STATE_LIKE = /\b(?:is|are) in (?:your|the|either player's)\b|\byou (?:control|have)\b|\byour opponent (?:controls|has)\b|\bthere (?:is|are)\b/i
/** Una condición que habla de algo que pasa (`is Special Summoned`, `is sent to the GY`, `is destroyed`, `activates a card`): se activa por un suceso. */
const EVENT_LIKE = /\b(?:Summoned|Set|flipped|sent|returned|added|banished|destroyed|attacked|targeted|negated|detached|Tributed|discarded|drawn|battles|attacks|declares|activates|activated|inflicts|takes?|equipped|placed|changed|leaves|destroys)\b/i

/** Qué clases de efecto del script puede ser una frase, por cómo abre. */
export function allowedClasses(sentence: EffectSentence): readonly EffectClass[] {
  if (sentence.quick) return ['quick']
  if (sentence.opening === 'once' || sentence.opening === 'plain') return ['ignition', 'quick']
  if (sentence.opening === 'during') return ['ignition', 'quick', 'trigger']

  // `trigger`: «If …:», «When …:», «Each time …:». Lo que está antes de los dos puntos dice si es un suceso o un estado.
  // «… while this card is in your GY» es un estado que acompaña a un suceso: lo que habla del suceso es lo que está antes del «while».
  const header = sentence.text.slice(0, sentence.text.indexOf(':')).split(/\bwhile\b/i)[0]!
  const event = EVENT_LIKE.test(header)
  const state = STATE_LIKE.test(header)

  if (event && !state) return ['trigger', 'quick']
  if (state && !event) return ['ignition', 'quick']

  return ['trigger', 'quick', 'ignition']
}

const CARD_TARGET = /\bEFFECT_FLAG_CARD_TARGET\b/

/**
 * Cuántas de las señales de la frase **contradice** el efecto (0 a 4): la clase (por cómo abre y qué dice el encabezado), el costo, el objetivo y el «Once per turn:» de apertura. Todo lo que la frase dice tiene que estar
 * en el efecto (no al revés: el texto viejo no lleva «(Quick Effect)» ni todo lo que el script declara).
 */
export function mismatches(sentence: EffectSentence, effect: LogicalEffect): number {
  let count = 0

  if (!allowedClasses(sentence).includes(effect.cls)) count += 1
  if (sentence.cost && effect.cost === '') count += 1
  if (sentence.target && !CARD_TARGET.test(effect.property)) count += 1
  // «Once per turn:» al abrir es el límite del efecto: el script lo tiene que tener.
  if (sentence.opening === 'once' && effect.countLimit === '') count += 1

  return count
}

/** Si la frase puede ser ese efecto: ninguna de sus señales lo contradice. */
export const compatible = (sentence: EffectSentence, effect: LogicalEffect): boolean => mismatches(sentence, effect) === 0

/** Un par confirmado: la frase del texto y el efecto del script que es. */
export interface EffectAlignment {
  sentence: EffectSentence
  effect: LogicalEffect
}

/** Las dos mejores formas de armar los pares (efecto de cada frase y señales contradichas en total); alcanzan para saber si la mejor es única y cuánto le gana a la siguiente. */
function bestAssignments(sentences: readonly EffectSentence[], effects: readonly LogicalEffect[]): Array<{ at: number[]; cost: number }> {
  const all: Array<{ at: number[]; cost: number }> = []
  const taken = new Array<boolean>(effects.length).fill(false)
  const current: number[] = []

  const place = (index: number, cost: number) => {
    if (index === sentences.length) {
      all.push({ at: [...current], cost })
      return
    }

    for (let at = 0; at < effects.length; at += 1) {
      if (!taken[at]) {
        taken[at] = true
        current.push(at)
        place(index + 1, cost + mismatches(sentences[index]!, effects[at]!))
        current.pop()
        taken[at] = false
      }
    }
  }

  place(0, 0)

  return all.sort((a, b) => a.cost - b.cost).slice(0, 2)
}

/** Cuántas contradicciones más que la mejor tiene que tener la segunda forma de armar los pares: con 2 no la salva ninguna señal mal leída. */
const MARGEN = 2

/**
 * Los pares de frase y efecto de una carta, o null si no se pueden alinear con certeza: distinto número de frases que de efectos, ninguna forma de armar los pares sin contradicciones, más de una, o una sola que **se
 * sostiene por una única señal** (la mejor forma le gana a la siguiente por una contradicción nada más: si esa señal estuviera mal leída, el resultado cambiaría).
 */
export function alignEffects(sentences: readonly EffectSentence[], effects: readonly LogicalEffect[]): EffectAlignment[] | null {
  if (sentences.length === 0 || sentences.length !== effects.length) return null

  const [best, next] = bestAssignments(sentences, effects)

  if (best === undefined || best.cost !== 0) return null
  if (next !== undefined && next.cost < MARGEN) return null

  return best.at.map((at, index) => ({ sentence: sentences[index]!, effect: effects[at]! }))
}

/** Los lugares desde donde se activa un efecto (los que el script declara en `SetRange` y la frase nombra con «this card»). */
export const EFFECT_PLACE = {
  /** Desde la mano (`If this card is in your hand`, `discard this card`). */
  hand: 1 << 0,
  /** Desde el Cementerio (`If this card is in your GY`, `banish this card from your GY`). */
  grave: 1 << 1,
  /** Desde el campo (`SetRange(LOCATION_MZONE)`) y la frase no nombra otro lugar para esta carta: acá la segunda fuente es la **ausencia** de otro lugar, no una frase que diga «on the field». */
  field: 1 << 2,
} as const

export type EffectPlaceName = keyof typeof EFFECT_PLACE

/** El lugar que nombra la frase **de esta carta** (no el de otras: «from your hand» a secas puede ser lo que se busca, no desde dónde se activa). */
const TEXT_HAND = /^[^:]*\bthis card (?:is )?in your hand\b|\b(?:discard|reveal) this card\b|\bthis card from your hand\b/i
const TEXT_GRAVE = /^[^:]*\bthis card (?:is |was )?in (?:your|the) (?:GY|Graveyard)\b|\b(?:banish|return|shuffle) this card from your (?:GY|Graveyard)\b/i

/** Los lugares que declara el script (`SetRange`). */
function scriptPlaces(effect: LogicalEffect): number {
  return (
    (/\bLOCATION_HAND\b/.test(effect.ranges) ? EFFECT_PLACE.hand : 0) |
    (/\bLOCATION_GRAVE\b/.test(effect.ranges) ? EFFECT_PLACE.grave : 0) |
    (/\bLOCATION_(?:MZONE|ONFIELD)\b/.test(effect.ranges) ? EFFECT_PLACE.field : 0)
  )
}

/** Los lugares confirmados: la mano y el Cementerio, los que el script declara y la frase nombra; el campo, el que el script declara cuando la frase no nombra la mano ni el Cementerio para esta carta. */
function confirmedPlaces(text: number, script: number): number {
  const named = text & script

  return text === 0 ? named | (script & EFFECT_PLACE.field) : named
}

/** Los lugares que dice la frase. */
function textPlaces(sentence: EffectSentence): number {
  return (TEXT_HAND.test(sentence.text) ? EFFECT_PLACE.hand : 0) | (TEXT_GRAVE.test(sentence.text) ? EFFECT_PLACE.grave : 0)
}

/** Lo confirmado de un efecto: dónde empieza su frase en el texto y los hechos (`EFFECT_FACT`) y los lugares (`EFFECT_PLACE`) que el script y esa frase dicen los dos. */
export interface VerifiedEffect {
  start: number
  facts: number
  places: number
}

/**
 * Los efectos de una carta alineados con su texto y, de cada uno, lo que **las dos fuentes dicen de ese efecto** (la misma regla de `card-effect-facts.ts`, ahora por efecto y no por carta). `null` si la carta no se puede
 * alinear con certeza (con uno o con varios efectos: lo que se guarda de las de un solo efecto lo decide el generador).
 */
export function verifiedEffects(lua: string, text: string): VerifiedEffect[] | null {
  const sentences = effectSentences(text)
  const effects = logicalEffects(readCardScript(lua, 'all').effects)
  const pairs = alignEffects(sentences, effects)

  if (pairs === null) return null

  const each = textEachEffectOnce(text)

  return pairs.map(({ sentence, effect }) => {
    // El texto dice «una vez por turno por nombre» en la frase o para cada efecto (en otra frase). El rápido, el costo y el objetivo salen de la frase.
    const said = textEffectFacts(sentence.text) | (each ? EFFECT_FACT.once | EFFECT_FACT.hardOnce : 0)
    const declared = effect.members.reduce((facts, member) => facts | effectFactsOf(member), 0)

    return { start: sentence.start, facts: said & declared, places: confirmedPlaces(textPlaces(sentence), scriptPlaces(effect)) }
  })
}
