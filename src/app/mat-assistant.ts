import { t } from '../i18n'
import type { CardEffectOfText } from './card-effect-data'
import { EFFECT_FACT, effectFactNames, visibleFactNames } from './card-effect-facts'
import { EFFECT_PLACE } from './card-effect-map'
import { effectParts } from './card-text'
import { isForeignId, isToken, locateCard, type MatAction, type MatCardKind, type MatMenuItem, type MatState } from './practice-mat'

/**
 * El asistente de la mesa, capa 2 del motor de cartas (`docs/motor-de-cartas.md`): **avisa, no decide**. Nunca frena una jugada ni la deshace: sólo dice algo que es verdad y que quien juega puede haber olvidado.
 *
 * **Ya no hay ningún cartel por activar otra vez una carta** (Gastón, 2026-10-20: «activar la carta no necesariamente significa que active un efecto… hay cartas que se pueden activar más de una vez… el cartel es molesto» y «en la experiencia
 * real de juego no tenemos manejo de cadenas, por lo que la resolución de los efectos es totalmente manual: muchas veces activar varias veces un efecto es una forma de decirle al rival si quiere responder»). Repetir una activación es una
 * forma de hablar, no un error. Lo que queda es **pasivo y en el menú**: al elegir qué efecto activar, cada uno dice si ya se usó («Ya lo usaste este turno»; `effectChoices`), con lo que **se vio hacer** en esta pantalla (nunca inventa un uso
 * que no vio); si se deshace la jugada, el uso deja de contar. Los hechos de la capa 1 son de la carta entera, no de cada efecto: por eso el aviso de la carta entera no existe.
 */

/** Una activación hecha en esta mesa: la jugada (para saber si sigue en el registro), en qué turno del duelo y con qué clave se cuenta el límite. */
export interface Activation {
  action: MatAction
  turn: number
  key: string
}

export type UsageReminder = 'turn' | 'turnByName' | 'duel'

/**
 * La Mágica o la Trampa que activa esta jugada, o null si no activa ninguna. Para ellas la mesa no tiene una jugada «activar»: la activación **es** la carta que queda boca arriba en su zona (desde la mano, el Deck,
 * el Cementerio o el destierro; o dada vuelta si estaba Colocada). Es la misma lectura del registro de pasos («Activás X», `describeMatAction`), sólo de cartas que son Mágica o Trampa: un monstruo que va a la zona de
 * Mágicas y Trampas, una escala de Péndulo (`how: 'scale'`), Colocar boca abajo y cambiar de zona una carta que ya estaba en el campo no son activaciones. El efecto de una carta boca arriba ya es una jugada `activate`.
 */
export function spellTrapActivation(before: MatState, action: MatAction, kindOf: (id: string) => MatCardKind): string | null {
  if (action.type !== 'place' && action.type !== 'position') return null
  if (isToken(action.id) || isForeignId(action.id) || action.pos === 'set') return null

  const where = locateCard(before, action.id)
  const kind = kindOf(action.id)

  if (!kind.spell && !kind.trap) return null

  if (action.type === 'place') {
    return (action.zone === 'st' || action.zone === 'field') && action.how !== 'scale' && where?.kind === 'pile' ? action.id : null
  }

  // Dar vuelta una carta Colocada en su zona.
  return where?.kind === 'spot' && (where.spot === 'st' || where.spot === 'field') && where.placed.pos === 'set' ? action.id : null
}

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

/**
 * La clave del uso de **un efecto**: la de su límite (por nombre o por carta) y el lugar del efecto entre los de la carta. Si comparte el límite con otros efectos (o con la activación de la carta: `shared`), la clave es la de la
 * carta entera, la misma de todos ellos: se usa uno solo por turno entre todos.
 */
export const effectKey = (facts: number, passcode: number, cardId: string, effect: number): string =>
  (facts & EFFECT_FACT.shared) !== 0 ? limitKey(facts, passcode, cardId) : `${limitKey(facts, passcode, cardId)}#${effect}`

/**
 * Los hechos que valen al **activar** una Mágica o una Trampa (dejarla boca arriba en su zona): sólo si la activación misma tiene el límite (`activation`, que las dos fuentes confirman). El límite de un efecto que se usa
 * después (una Mágica Continua con un efecto de una vez por turno) no impide activar otra copia.
 */
export const activationFacts = (facts: number): number => ((facts & EFFECT_FACT.activation) !== 0 ? facts & LIMIT_FACTS : 0)

/** Los lugares de un efecto, como se dicen (el campo y la zona de Mágicas y Trampas son «el campo»). */
const PLACE_LABELS: ReadonlyArray<{ bits: number; key: 'practice.assistant.place.hand' | 'practice.assistant.place.grave' | 'practice.assistant.place.field' | 'practice.assistant.place.pendulum' }> = [
  { bits: EFFECT_PLACE.hand, key: 'practice.assistant.place.hand' },
  { bits: EFFECT_PLACE.grave, key: 'practice.assistant.place.grave' },
  { bits: EFFECT_PLACE.field | EFFECT_PLACE.spellTrap, key: 'practice.assistant.place.field' },
  { bits: EFFECT_PLACE.pendulum, key: 'practice.assistant.place.pendulum' },
]

/**
 * El segundo paso de «Activar efecto» en una carta con efectos que se cuentan uno por uno: un renglón por efecto con lo que **hace**, **textual** (la frase del efecto, sin recortar: la precisión es de la frase), con su número y
 * cuándo se activa arriba y, debajo, si ya se usó, desde dónde se activa (si la carta tiene efectos de distintos lugares) y sus rasgos confirmados. Son **todos** los efectos que se activan de la carta (la carta sólo se cuenta por efecto si el texto y el script tienen la
 * misma cantidad y se emparejan sin dudas: `alignEffects`), así que no hay un «otro»: no queda ningún efecto afuera de la lista. Cada renglón sabe qué pedazo del texto de la carta es (`preview`). Elegir uno que ya se usó
 * no se frena: la mesa avisa, no decide.
 */
export function effectChoices(id: string, passcode: number, effects: readonly CardEffectOfText[], past: readonly Activation[], turn: number): MatMenuItem[] {
  // Desde dónde se activa cada efecto sólo se dice si la carta tiene efectos de lugares distintos (la mano, el Cementerio, la Zona de Péndulo): si todos son del campo no hay nada que distinguir.
  const distinguishes = effects.some((effect) => (effect.places & (EFFECT_PLACE.hand | EFFECT_PLACE.grave | EFFECT_PLACE.pendulum)) !== 0)
  const choices = effects.map((effect, index): MatMenuItem => {
    const used = usageReminder(effect.facts, past, effectKey(effect.facts, passcode, id, index), turn)
    const places = distinguishes ? PLACE_LABELS.filter(({ bits }) => (effect.places & bits) !== 0).map(({ key }) => t(key)) : []
    const traits = visibleFactNames(effectFactNames(effect.facts)).map((fact) => t(`search.traits.${fact}`))
    const usedText = used === null ? '' : t((effect.facts & EFFECT_FACT.shared) !== 0 ? 'practice.assistant.usedHint.shared' : used === 'duel' ? 'practice.assistant.usedHint.duel' : 'practice.assistant.usedHint.turn')
    const hint = [usedText, ...places, ...traits].filter(Boolean).join(' · ')
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
