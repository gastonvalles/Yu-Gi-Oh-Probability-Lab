import { t } from '../i18n'
import type { CardEffectOfText } from './card-effect-data'
import { EFFECT_FACT, effectFactNames, visibleFactNames } from './card-effect-facts'
import { EFFECT_PLACE } from './card-effect-map'
import { effectParts } from './card-text'
import type { MatAction, MatMenuItem } from './practice-mat'

/**
 * El asistente de la mesa, capa 2 del motor de cartas (`docs/motor-de-cartas.md`): **avisa, no decide**. Nunca frena una jugada ni la deshace: sólo dice algo que es verdad y que quien juega puede haber olvidado.
 *
 * Primer aviso: activar otra vez una carta que ya se activó, cuando tiene un efecto de una vez por turno (o por duelo) confirmado por su script y su texto (capa 1). Los hechos de la capa 1 son de la carta
 * entera, no de cada efecto, así que el aviso no dice «no podés»: dice lo que pasó y que fije que no sea el mismo efecto (una carta con dos efectos de una vez por turno puede usar uno y después el otro).
 * Lo que cuenta es lo que **se vio hacer** en esta pantalla (nunca inventa un uso que no vio); si se deshace la jugada, el uso deja de contar.
 */

/** Una activación hecha en esta mesa: la jugada (para saber si sigue en el registro), en qué turno del duelo y con qué clave se cuenta el límite. */
export interface Activation {
  action: MatAction
  turn: number
  key: string
}

export type UsageReminder = 'turn' | 'turnByName' | 'duel'

/** Los hechos de la capa 1 que tienen un límite de uso. */
export const LIMIT_FACTS = EFFECT_FACT.once | EFFECT_FACT.hardOnce | EFFECT_FACT.perDuel

/**
 * Con qué clave se cuenta el uso de una carta: por **nombre** (su número de YGOPRODeck, así una segunda copia comparte el límite) si el límite es por nombre o por duelo; si no, por **carta** (cada copia tiene el suyo).
 */
export function limitKey(facts: number, passcode: number, cardId: string): string {
  return (facts & (EFFECT_FACT.hardOnce | EFFECT_FACT.perDuel)) !== 0 ? `n:${passcode}` : `i:${cardId}`
}

/**
 * Qué decir al activar una carta con esa clave y esos hechos, dados los usos que ya se vieron (`past`, sólo los que siguen en el registro): que ya se usó en este duelo (un efecto de una vez por duelo), o
 * en este turno (de una vez por turno; «por nombre» si otra copia comparte el límite). Null si no hay nada que decir.
 */
export function usageReminder(facts: number, past: readonly Activation[], key: string, turn: number): UsageReminder | null {
  const same = past.filter((activation) => activation.key === key)

  if ((facts & EFFECT_FACT.perDuel) !== 0 && same.length > 0) return 'duel'

  if ((facts & (EFFECT_FACT.once | EFFECT_FACT.hardOnce)) !== 0 && same.some((activation) => activation.turn === turn)) {
    return (facts & EFFECT_FACT.hardOnce) !== 0 ? 'turnByName' : 'turn'
  }

  return null
}

/**
 * Los efectos de una carta que la mesa puede contar **uno por uno** (capa 1b del motor de cartas): la carta tiene varios efectos alineados con su texto y al menos uno con un límite de uso confirmado. Si no (un solo efecto,
 * o varios sin ningún límite que contar), no hay nada que llevar por separado y la carta se activa directo, como siempre.
 */
export function countableEffects(effects: readonly CardEffectOfText[] | undefined): readonly CardEffectOfText[] | null {
  return effects !== undefined && effects.length >= 2 && effects.some((effect) => (effect.facts & LIMIT_FACTS) !== 0) ? effects : null
}

/** La clave del uso de **un efecto**: la de su límite (por nombre o por carta) y el lugar del efecto entre los de la carta. */
export const effectKey = (facts: number, passcode: number, cardId: string, effect: number): string => `${limitKey(facts, passcode, cardId)}#${effect}`

/**
 * El segundo paso de «Activar efecto» en una carta con efectos que se cuentan uno por uno: un renglón por efecto con lo que **hace**, **textual** (la frase del efecto, sin recortar: la precisión es de la frase), con su número y
 * cuándo se activa arriba y, debajo, si ya se usó, desde dónde se activa y sus rasgos confirmados. Son **todos** los efectos que se activan de la carta (la carta sólo se cuenta por efecto si el texto y el script tienen la
 * misma cantidad y se emparejan sin dudas: `alignEffects`), así que no hay un «otro»: no queda ningún efecto afuera de la lista. Cada renglón sabe qué pedazo del texto de la carta es (`preview`). Elegir uno que ya se usó
 * no se frena: la mesa avisa, no decide.
 */
export function effectChoices(id: string, passcode: number, effects: readonly CardEffectOfText[], past: readonly Activation[], turn: number): MatMenuItem[] {
  const choices = effects.map((effect, index): MatMenuItem => {
    const used = usageReminder(effect.facts, past, effectKey(effect.facts, passcode, id, index), turn)
    // Desde dónde se activa: la mano y el Cementerio, que las dos fuentes confirman (el campo no se dice: sólo lo confirma el script).
    const places = [EFFECT_PLACE.hand, EFFECT_PLACE.grave].filter((place) => (effect.places & place) !== 0).map((place) => t(place === EFFECT_PLACE.hand ? 'practice.assistant.place.hand' : 'practice.assistant.place.grave'))
    const traits = visibleFactNames(effectFactNames(effect.facts)).map((fact) => t(`search.traits.${fact}`))
    const hint = [used === null ? '' : t(used === 'duel' ? 'practice.assistant.usedHint.duel' : 'practice.assistant.usedHint.turn'), ...places, ...traits].filter(Boolean).join(' · ')
    const { when, what } = effectParts(effect.sentence)
    const number = t('practice.menu.effectLead', { n: index + 1 })

    return {
      lead: when === '' ? number : `${number} · ${when}`,
      label: what,
      hint: hint === '' ? undefined : hint,
      preview: { start: effect.start, end: effect.start + effect.sentence.text.length },
      action: { type: 'activate', id, effect: index },
    }
  })

  return choices
}
