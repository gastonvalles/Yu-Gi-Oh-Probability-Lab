/**
 * El motor que entiende efectos: de lo que dice el texto de una carta (en inglés) a qué hace. Son expresiones sobre el texto, no una comprensión del juego: aciertan en
 * lo común y pueden fallar con una redacción rara; el apéndice de `docs/motor-de-cartas.md` dice cuánto (precisión y cobertura medidas con etiquetas a ciegas) y dónde.
 *
 * No importa nada: es una función pura del texto. `card-filters.ts` lo usa para filtrar y `scripts`/pruebas lo miden contra textos reales.
 */

/** Las categorías, en el orden en que se ofrecen. Cada una ocupa un bit de la máscara de la carta: caben 16. */
export const EFFECT_KEYS = [
  'search',
  'draw',
  'special-summon',
  'banish',
  'graveyard',
  'back-to-hand',
  'back-to-deck',
  'destroy-monster',
  'destroy-spell-trap',
  'negate',
  'token',
  'control',
  'damage',
  'recover',
] as const
export type EffectKey = (typeof EFFECT_KEYS)[number]

/**
 * El texto sin lo que confunde a las expresiones: los nombres entre comillas (traen puntos —«D.D.», «U.A.»— que cortan la oración, y palabras de efecto —«Adventurer Token»,
 * «Destruction Cannon»— que no son un efecto) y los rótulos de las dos mitades de un Péndulo («[ Monster Effect ]» parece hablar de monstruos).
 */
export function cleanEffectText(text: string): string {
  // Una sola pasada por las comillas: «"X" (Zombie/FIRE/Level 1/ATK 0/DEF 0)» y «"X Token"» son Fichas; una frase larga es un efecto; el resto, un nombre.
  const unquoted = text.includes('"')
    ? text.replace(QUOTED, (_quoted, inner: string, stats: string | undefined) => (stats || /\bTokens?$/.test(inner) ? ' Token ' : isQuotedEffect(inner) ? ` ${inner} ` : '""'))
    : text

  return unquoted.includes('[') ? unquoted.replace(/\[\s*(?:Pendulum|Monster) Effect\s*\]/gi, ' ') : unquoted
}

const QUOTED = /"([^"]*)"(\s*\((?:[^()/]*\/){2,}[^()]*\bATK\b[^()]*\))?/g

/** Una frase entre comillas que es un efecto («the activated effect becomes "return 1 monster to the hand"»), no un nombre: larga y con palabras de oración. Ésa sí se lee. */
const isQuotedEffect = (inner: string) => inner.trim().split(/\s+/).length >= 7 && /\b(?:the|your|this|its|to)\b/.test(inner)

// «cannot» y compañía justo antes: la frase prohíbe o protege, no hace.
const NOT_BEFORE = String.raw`(?<!\b(?:cannot|can't|can not|not|never|only)\s)`
// «when you», «if your opponent»…: lo que sigue es el disparador de un efecto, no el efecto.
const NOT_TRIGGER = String.raw`(?<!\b(?:when|if|whenever|while|before|after|each time)\s+(?:you|your opponent|a player|they|this card is|that player)\s)`
// «to the hand», «to your hand», «to its owner's hand», «to their hand».
const TO_HAND = String.raw`to (?:the |your |their |its |it's |his or her )?(?:owner's )?hand\b`
// «into the Deck», «on the top of your Deck», «to the bottom of the Extra Deck», «at the bottom of their Deck».
const INTO_DECK = String.raw`\b(?:into|to|on|at|in)\s+(?:either\s+)?(?:the\s+|your\s+|their\s+|his\/her\s+|its owner's\s+|the owner's\s+)?(?:(?:top|bottom)\s+(?:or\s+(?:top|bottom)\s+)?(?:of\s+)?(?:the\s+|your\s+|their\s+)?)?(?:extra\s+|main\s+)?deck\b`

/** «destroy» como acción (no «destroyed» ni «destroys»), sin «destroy this card» (que se destruye ella misma: un costo, no una eliminación). */
const DESTROY = String.raw`\bdestroy\b(?!\s+this (?:face-up |face-down )?card\b)`
// Una carta genérica («destroy 1 card on the field», «destroy that card», «destroy all cards your opponent controls»): puede ser un monstruo o una Mágica/Trampa.
const CARD_MODIFIERS = String.raw`(?:(?:targeted|face-up|face-down|other|set)\s+)*`
const GENERIC_CARD = String.raw`\bdestroy\b\s+(?:(?:that|those|the|1|\d+|all|up to \d+|as many)\s+)?${CARD_MODIFIERS}cards?\b|\btarget\b[^.;]*?\b(?:\d+|up to \d+|all)\s+${CARD_MODIFIERS}cards?\b[^.;]*;\s*(?:and if you do,\s*)?destroy\s+(?:it|them|that (?:target|card))\b|(?<!""\s)\bcards?\b(?:(?!\b(?:monsters?|spells?|traps?)\b|"")[^.;]){0,80}?[;,]\s*(?:and )?(?:if you do,?\s*)?destroy\s+(?:it|them)\b`
// «target 3 "Ghostrick" cards you control; destroy them»: las cartas de un arquetipo que se destruyen se leen como monstruos, no como Mágicas o Trampas.
const NAMED_CARD_TARGET = String.raw`\btarget\b[^.;]*?\b(?:\d+|up to \d+|all)\s+${CARD_MODIFIERS}""\s+cards?\b[^.;]*;\s*(?:and if you do,\s*)?destroy\s+(?:it|them|that (?:target|card))\b`

// «… X …; destroy it», «… X … and destroy that target»: X se elige o nombra antes y la destrucción lo retoma.
const then = (kind: string) => String.raw`\b(?:${kind})\b[^.;]{0,100}?(?:;\s*|,\s*|\band\s+)(?:(?:and )?if you do,?\s*|then\s*)?destroy\s+(?:it|them|that|those|the)\b`

const re = (source: string) => new RegExp(source, 'i')

/** Una expresión por categoría, sobre el texto ya limpio (`cleanEffectText`). */
export const EFFECT_MATCHERS: Record<EffectKey, RegExp> = {
  // Agrega una carta del Deck a la mano (también «excavar y agregar», «revelar del Deck y agregar»).
  search: re(
    String.raw`\badds?\b[^.]*\bfrom (?:your|their|the|each player's|either player's) deck\b[^.]*\b${TO_HAND}|\badd\b[^.;]*\bto your hand or special summon\b[^.]*\bfrom your (?:hand or )?deck\b|\btake\b[^.]*\bfrom your deck\b[^.]*\badd\b[^.]*\bto your hand\b|\b(?:excavate|reveal|look at)\b[^.]*\bdeck\b[^.]*\badds?\b[^.]*\bhand\b|\bsearch\b[^.]*\bdeck\b[^.]*\bhand\b`,
  ),
  // Roba cartas; «Draw Phase» y «when you draw» (el disparador) no.
  draw: re(String.raw`${NOT_TRIGGER}\bdraws?\b(?!\s+phase\b|\s+this card\b)[^.:;]*?\bcards?\b`),
  // Invoca de modo especial (o ella misma tiene su procedimiento); «cannot Special Summon» y «when … is Special Summoned» no.
  'special-summon': re(String.raw`${NOT_BEFORE}\bspecial summon\b|\b(?:can only be|can be|must (?:first )?be)\s+special summoned\b|\bspecial summoning\b`),
  // Destierra, con la redacción de ahora y la de antes («removed from play»); «if this card is banished» (el disparador) no.
  banish: re(String.raw`\bbanish(?:es|ing)?\b|\bbanished instead\b|\bremov(?:e|es|ing)\b[^.]*\bfrom play\b|\b(?:is|are|be)\s+removed from play\b(?<!\bthat\s+(?:is|are|be)\s+removed from play\b)(?<!\b(?:if|when|whenever|each time)\b[^.:;,]*\b(?:is|are|be)\s+removed from play\b)`),
  // Cualquier uso funcional del Cementerio (es amplia a propósito: la mitad del catálogo).
  graveyard: re(String.raw`\b(?:graveyards?|gys?)\b`),
  // Devuelve una carta a la mano («return … to the hand», «returning it to your hand»).
  'back-to-hand': re(String.raw`(?<!\b(?:if|when|whenever|while)\b[^.:;,]*)\breturn(?:s|ed|ing)?\b[^.;,]*\b${TO_HAND}`),
  // Devuelve, baraja o coloca cartas en el Deck o el Extra Deck («shuffle … into the Deck», «place it on the top of the Deck»). Barajar el Deck después de buscar no cuenta.
  // También «Add 2 monsters from your Graveyard to your Deck and shuffle it».
  'back-to-deck': re(
    String.raw`\b(?:returns?|returned|returning|shuffles?|shuffled|shuffling|places?|placed|placing|puts?)\b[^.]*?${INTO_DECK}|\badd\b[^.;]*\bto (?:your|the|their) (?:extra |main )?deck\b`,
  ),
  // Destruye monstruos: «destroy … monster» o «… monster …; destroy it» (el objetivo se elige antes); o una carta genérica.
  // También «Special Summon 1 monster from your hand. Destroy it during the End Phase» (la invocada se destruye sola, en la oración siguiente).
  'destroy-monster': re(
    String.raw`${DESTROY}[^.;,]{0,60}?\bmonsters?\b|${then('monsters?')}|\bsummon\b[^.;]{0,160}?[.;,]\s*(?:also,?\s*|then\s*)?destroy\s+(?:it|them)\b|${NAMED_CARD_TARGET}|${GENERIC_CARD}`,
  ),
  // Destruye Mágicas o Trampas, en cualquier orden de la oración; o una carta genérica.
  'destroy-spell-trap': re(String.raw`${DESTROY}[^.;,]{0,60}?\b(?:spells?|traps?)\b|${then('spells?|traps?')}|${GENERIC_CARD}`),
  // Niega; «cannot be negated» y «your opponent cannot negate» (la protección) no.
  negate: re(String.raw`(?<!\b(?:cannot|can't) be )(?<!\b(?:cannot|can't) )\bnegat(?:e|es|ed|ing)\b`),
  // Genera o usa Fichas; «non-Token» y «except Tokens» no.
  token: re(String.raw`(?<!non-)(?<!\bexcept )\btokens?\b`),
  // Cambia el control: toma, gana, intercambia o da («take control of», «switch control», «give control of … to your opponent», «control of this card is shifted»). Cambiar la posición de un monstruo «you control» no.
  control: re(String.raw`\b(?:take|takes|gain|gains|switch|switches|give|gives|change|changes)\s+(?:the\s+)?control\b|\bcontrol of\b[^.;]*\b(?:is|are)\s+(?:switched|changed|shifted)\b`),
  // Daña LP como efecto: «inflict N damage» y «take N damage» (no el daño de batalla, ni «would inflict», ni «take no damage», ni el disparador «when you take damage»).
  damage: re(
    String.raw`(?<!\bbattle damage\b[^.]*)(?<!\bwould )(?<!\b(?:when|if|whenever)\b[^.:;,]*)\binflict(?:s|ed)?\b(?![^.]*\bbattle damage\b)[^.]*\bdamage\b|${NOT_TRIGGER}${NOT_BEFORE}(?<!\b(?:nor|neither|would)\s)\b(?:take|takes|suffer|suffers)\b(?!\s+no\b)(?:(?!\bbattle\b)[^.]){0,25}\bdamage\b`,
  ),
  // Da LP: «gain 1000 LP», «gains Life Points equal to…» (no «gain ATK … while your LP»).
  recover: re(String.raw`${NOT_TRIGGER}\bgains?\b(?!\s+\d*\s*(?:ATK|DEF|Level)\b)[^.]{0,50}?\b(?:LP|Life Points)\b`),
}

/** Un bit por categoría, en el orden de `EFFECT_KEYS`. */
export const EFFECT_BIT: Record<EffectKey, number> = Object.fromEntries(EFFECT_KEYS.map((key, index) => [key, 1 << index])) as Record<EffectKey, number>

/**
 * La palabra (en minúsculas) sin la que la expresión de la categoría no puede calzar: se mira antes, porque buscarla cuesta una fracción de lo que cuesta la expresión
 * y la mayoría de las cartas no dice «destroy» ni «return». Es sólo un atajo: nunca decide que sí, y `card-effects.test.ts` cuida que no cambie ningún resultado.
 */
const EFFECT_GATE: Record<EffectKey, RegExp> = {
  search: /\badds?\b|\bsearch\b/,
  draw: /\bdraws?\b/,
  'special-summon': /special summon/,
  banish: /banish|from play/,
  graveyard: /\bgraveyards?\b|\bgys?\b/,
  'back-to-hand': /\breturn/,
  'back-to-deck': /deck/,
  'destroy-monster': /\bdestroy\b/,
  'destroy-spell-trap': /\bdestroy\b/,
  negate: /negat/,
  token: /token/,
  control: /\b(?:take|takes|gain|gains|switch|switches|give|gives|change|changes)\s+(?:the\s+)?control\b|\bcontrol of\b/,
  damage: /\bdamage\b/,
  recover: /\blp\b|life points/,
}

function says(key: EffectKey, text: string, lower: string): boolean {
  return EFFECT_GATE[key].test(lower) && EFFECT_MATCHERS[key].test(text)
}

/** ¿El texto (tal como viene en la carta) dice que hace esto? Limpia el texto en cada llamada: para recorrer muchas cartas, `effectMaskOf`. */
export function matchesEffect(key: EffectKey, text: string | null): boolean {
  const clean = cleanEffectText(text ?? '')

  return says(key, clean, clean.toLowerCase())
}

/** Qué efectos dice el texto, como máscara de bits. Limpia el texto una vez y corre las 14 expresiones: el índice del catálogo lo hace por carta al armarse, una sola vez. */
export function effectMaskOf(description: string | null): number {
  const text = cleanEffectText(description ?? '')
  const lower = text.toLowerCase()
  let mask = 0

  for (const key of EFFECT_KEYS) {
    if (says(key, text, lower)) {
      mask |= EFFECT_BIT[key]
    }
  }

  return mask
}
