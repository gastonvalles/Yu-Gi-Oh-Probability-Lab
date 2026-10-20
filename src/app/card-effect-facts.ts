import { readArguments, readCardScript, type CardEffect } from './card-script-rules'
import { segmentCardText } from './card-text'

/**
 * Capa 1 del motor de cartas (`docs/motor-de-cartas.md`): lo que se sabe **con certeza** de los efectos de una carta, leído de dos fuentes que no se conocen entre sí —el script de EDOPro (lo que el motor del juego
 * hace de verdad) y el texto impreso— y quedándose sólo con lo que **las dos dicen**. Un hecho que una sola fuente afirma no se publica: puede ser una forma de escribir distinta (las cartas viejas no llevan
 * «(Quick Effect)») o un detalle interno del motor (un efecto continuo con límite para no repetirse), y ninguna de las dos cosas es una regla para quien juega.
 *
 * Son hechos de la carta entera («tiene al menos un efecto rápido», «tiene un efecto de una vez por turno»), no de cada efecto: alinear cada frase del texto con cada efecto del script queda para las capas siguientes.
 * La salida es una máscara de bits (`EFFECT_FACT`); un bit encendido es un hecho confirmado, y uno apagado no dice nada (no que no sea cierto).
 */
export const EFFECT_FACT = {
  /** Tiene un efecto rápido (puede activarse en respuesta, también en el turno del rival). */
  quick: 1 << 0,
  /** Tiene un efecto que se puede usar una vez por turno (con o sin el nombre de la carta). */
  once: 1 << 1,
  /** Una vez por turno **por nombre**: «You can only use this effect of "X" once per turn» (otra copia no lo reinicia). */
  hardOnce: 1 << 2,
  /** Un efecto que se puede usar una vez por Duelo. */
  perDuel: 1 << 3,
  /** Un efecto con costo (se paga al activarlo, antes del `;`). */
  cost: 1 << 4,
  /** Un efecto que apunta (`target`). */
  target: 1 << 5,
} as const

export type EffectFactName = keyof typeof EFFECT_FACT

const QUICK = /EFFECT_TYPE_QUICK_[OF]\b/
const CARD_TARGET = /\bEFFECT_FLAG_CARD_TARGET\b/
const COUNT_DUEL = /\bEFFECT_COUNT_CODE_DUEL\b/
/** Los límites que no son «por turno»: por cadena y mientras la carta está boca arriba. */
const COUNT_OTHER = /\bEFFECT_COUNT_CODE_(?:CHAIN|SINGLE)\b/

/** Los hechos que declara **un** efecto del script (sin cruzarlos con el texto). */
export function effectFactsOf(effect: Pick<CardEffect, 'type' | 'cost' | 'property' | 'countLimit'>): number {
  let facts = 0

  if (QUICK.test(effect.type)) facts |= EFFECT_FACT.quick
  if (effect.cost !== '') facts |= EFFECT_FACT.cost
  if (CARD_TARGET.test(effect.property)) facts |= EFFECT_FACT.target

  if (effect.countLimit === '') return facts

  // `SetCountLimit(veces, código?, tipo?)`: con `1` y sin código es por efecto; con el id de la carta (`id`, `{id,1}`) es por nombre.
  const [times, code = '', kind = ''] = readArguments(effect.countLimit)
  const whole = `${code} ${kind}`

  if (COUNT_DUEL.test(whole)) {
    facts |= EFFECT_FACT.perDuel
  } else if (times === '1' && !COUNT_OTHER.test(whole)) {
    facts |= EFFECT_FACT.once
    if (code !== '' && code !== '0') facts |= EFFECT_FACT.hardOnce
  }

  return facts
}

/** Los hechos que declara el script de la carta (sin cruzarlos con el texto): los de todos sus efectos, también los que se da a sí misma en otra función (equiparse, invocarse): el texto los cuenta como efectos suyos. */
export const scriptEffectFacts = (lua: string): number => readCardScript(lua, 'all').effects.reduce((facts, effect) => facts | effectFactsOf(effect), 0)

const ONCE_PER_TURN = /\bonce per turn\b/i
/**
 * Una vez por turno por nombre, dicho con el nombre de la carta entre comillas: `You can only use … "Nombre" … once per turn`, `You can only Special Summon "Nombre" once per turn this way`,
 * `You can only use 1 (of the following effects of) "Nombre" per turn`, `You can only activate 1 "Nombre" per turn` y `"Nombre" can only be activated once per turn`.
 * Se mira sobre el texto con cada nombre reemplazado por `"N"` (`sinNombres`): los nombres llevan puntos (`R.B.`, `A.I.`) y comillas (`"Maxx "C""`) que cortarían las oraciones.
 */
const HARD_ONCE =
  /You can only (?:use|activate|Special Summon)\b[^.]*?"[^.]*?\bonce per turn\b|You can only (?:use|activate) \d+ (?:of the following effects of )?"[^.]*?" ?(?:effect )?per turn|"[^.]*?\bcan only be (?:activated|used) once per turn/i

const sinNombres = (text: string) => text.replace(/"[^"]*"/g, '"N"')
const ONCE_PER_DUEL = /\bonce per Duel\b/i
/** «You can only use each effect of "X" once per turn»: cada efecto de la carta, por separado, es una vez por turno por nombre. */
const EACH_EFFECT_ONCE = /You can only use each effect of "N" once per turn/i

/** Si el texto dice que **cada** efecto de la carta es de una vez por turno por nombre (vale para todos sus efectos, no sólo para la oración que lo dice). */
export const textEachEffectOnce = (text: string): boolean => EACH_EFFECT_ONCE.test(sinNombres(text))

/** Los hechos que dice el texto de la carta (el efecto rápido, el costo y el objetivo salen de `segmentCardText`, la capa 0). */
export function textEffectFacts(text: string): number {
  let facts = 0
  const tones = new Set(segmentCardText(text).map((segment) => segment.tone))

  if (tones.has('speed')) facts |= EFFECT_FACT.quick
  if (tones.has('cost')) facts |= EFFECT_FACT.cost
  if (tones.has('target')) facts |= EFFECT_FACT.target
  const hard = HARD_ONCE.test(sinNombres(text))

  if (hard || ONCE_PER_TURN.test(text)) facts |= EFFECT_FACT.once
  if (hard) facts |= EFFECT_FACT.hardOnce
  if (ONCE_PER_DUEL.test(text)) facts |= EFFECT_FACT.perDuel

  return facts
}

/** Los hechos confirmados de una carta: los que su script y su texto dicen los dos. */
export const verifiedEffectFacts = (lua: string, text: string): number => scriptEffectFacts(lua) & textEffectFacts(text)

/** Los nombres de los hechos de una máscara, en el orden de `EFFECT_FACT`. */
export function effectFactNames(facts: number): EffectFactName[] {
  return (Object.keys(EFFECT_FACT) as EffectFactName[]).filter((name) => (facts & EFFECT_FACT[name]) !== 0)
}
