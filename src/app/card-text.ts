/**
 * El texto de una carta partido en lo que dice cada parte, sólo para resaltarlo (Gastón, 2026-10-19: «resaltar», y «de a poco, con lo que estemos seguros que funciona al 100%»).
 *
 * Capa 0 del motor de cartas (ver `docs/motor-de-cartas.md`): no decide nada del juego, sólo colorea. La plantilla de los efectos de Yu-Gi-Oh! es rígida —`Condición (Quick Effect): Costo; Efecto.` y, aparte,
 * `You can only …`— y de ella se leen cinco cosas (condición, velocidad, costo, objetivo y límite), **sólo cuando el texto es exactamente así**; lo demás queda sin marcar (`plain`). Ante la duda, no se marca: un texto raro pierde el color, nunca gana uno equivocado.
 *
 * Garantías (las prueban `card-text.test.ts` y el corpus entero de YGOPRODeck):
 * 1. Los pedazos, pegados en orden, dan **exactamente** el texto de entrada (ni un carácter de más ni de menos).
 * 2. Nunca hay un pedazo vacío, y dos vecinos del mismo tipo se juntan en uno.
 * 3. Un `condition` sólo sale delante de un `:` que está fuera de comillas y paréntesis y empieza con un abridor de las plantillas (`If`, `When`, `During`…); un `cost` sólo si lo que va antes del `;` empieza con un verbo de costo;
 *    un `limit` sólo en una oración que empieza con `You can only` o en un `Once per turn` / `Once per Chain` que va delante de los dos puntos.
 * 4. Un `cost`, un `target` o una `condition` nunca llevan espacios de borde ni el `;` o el `:` que los cierra (el texto, quitado el color, no cambia).
 */

export type TextTone = 'plain' | 'condition' | 'speed' | 'cost' | 'target' | 'limit'

export interface TextSegment {
  text: string
  tone: TextTone
}

/** Con qué palabras empieza lo que va antes de los dos puntos de un efecto (la condición, o cuándo se activa). Cualquier otro comienzo (`You can activate 1 of these effects:`) no es una condición. */
const CONDITION_OPENERS = /^(?:If|When|While|During|At the |After |Each time|Before |Once while|Whenever|Your opponent|Neither player|Both players|FLIP$)/

/** `Once per turn` / `Once per Chain` al frente de lo que va antes de los dos puntos: es un límite (se puede usar una vez), no una condición; lo que sigue (`, if …`) sí puede ser la condición. */
const ONCE_PER = /^Once per (?:turn|Chain)/

/** La etiqueta de velocidad: `(Quick Effect)` o `(This is a Quick Effect)`. */
const SPEED = /\((?:This is a )?Quick Effect\)/

/** Un efecto que abre con la etiqueta sola, sin condición delante: `(Quick Effect): You can …`. */
const SPEED_ONLY = /^\((?:This is a )?Quick Effect\)$/

/** Los verbos con que empieza un costo (lo que va antes del `;`): se paga al activar. Se compara sin mirar mayúsculas. */
const COST_VERB = /^(?:discard|send|banish|tribute|detach|pay|remove|reveal|shuffle|return|release)\b/i

/** Una declaración de objetivo: `target 1 monster`. */
const TARGET_WORD = /\btarget(?:s)?\b/i

/** `You can …` / `You can also …` / `You may …` delante del costo. */
const CAN_PREFIX = /^(?:You can(?: also)? |You may )/

interface Span {
  start: number
  end: number
}

/** Un `:` o un `;` que no está dentro de comillas ni de paréntesis; -1 si no hay (o si las comillas o los paréntesis no cierran: no se interpreta nada). */
function topLevelIndex(text: string, mark: ':' | ';'): number {
  let quoted = false
  let depth = 0
  let found = -1

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (char === '"') {
      quoted = !quoted
    } else if (!quoted && char === '(') {
      depth += 1
    } else if (!quoted && char === ')') {
      depth -= 1
    } else if (char === mark && !quoted && depth === 0 && found < 0) {
      found = index
    }
  }

  return quoted || depth !== 0 ? -1 : found
}

/** Las oraciones de una línea: se corta después de un punto (o `!`, `?`) seguido de espacio y de algo que empieza una oración, fuera de comillas y paréntesis. Cada oración conserva el espacio que la sigue. */
function sentences(line: string): Span[] {
  const spans: Span[] = []
  let quoted = false
  let depth = 0
  let start = 0

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (char === '"') {
      quoted = !quoted
    } else if (!quoted && char === '(') {
      depth += 1
    } else if (!quoted && char === ')') {
      depth = Math.max(0, depth - 1)
    } else if ((char === '.' || char === '!' || char === '?') && !quoted && depth === 0) {
      let next = index + 1

      while (line[next] === ' ') next += 1

      if (next > index + 1 && next < line.length && /["(A-Z0-9●]/.test(line[next]!)) {
        spans.push({ start, end: next })
        start = next
        index = next - 1
      }
    }
  }

  if (start < line.length) spans.push({ start, end: line.length })

  return spans
}

/** Suma un pedazo (sin vacíos) y lo junta con el anterior si es del mismo tipo. */
function push(out: TextSegment[], text: string, tone: TextTone) {
  if (text === '') return

  const last = out[out.length - 1]

  if (last && last.tone === tone) last.text += text
  else out.push({ text, tone })
}

/** Un pedazo con su tipo, sin los espacios del borde: esos quedan sin marcar. */
function pushTrimmed(out: TextSegment[], text: string, tone: TextTone) {
  const lead = text.length - text.trimStart().length
  const core = text.trim()

  push(out, text.slice(0, lead), 'plain')
  push(out, core, tone)
  push(out, text.slice(lead + core.length), 'plain')
}

/** Lo que va antes del `;` de una oración (`pre`, con el `;`): un costo, un objetivo, o nada. Los espacios del borde y el `;` quedan sin marcar. */
function pushBeforeSemicolon(out: TextSegment[], pre: string) {
  const lead = pre.length - pre.trimStart().length
  const body = pre.slice(lead, -1)
  const prefix = CAN_PREFIX.exec(body)?.[0] ?? ''
  const action = body.slice(prefix.length)

  push(out, pre.slice(0, lead), 'plain')
  push(out, prefix, 'plain')

  // «Target 1 monster; …»: sólo se declara un objetivo.
  if (/^target\b/i.test(action)) {
    pushTrimmed(out, action, 'target')
  } else if (!COST_VERB.test(action)) {
    push(out, action, 'plain')
  } else {
    // «send this card to the GY, then target 1 monster; …»: el costo y, después, el objetivo.
    const target = TARGET_WORD.exec(action)

    if (!target || target.index === 0) {
      pushTrimmed(out, action, 'cost')
    } else {
      const connective = /(?:,?\s+then,?\s*|,?\s*and\s+|\s+to\s+)$/.exec(action.slice(0, target.index))
      const split = target.index - (connective?.[0].length ?? 0)

      pushTrimmed(out, action.slice(0, split), 'cost')
      push(out, action.slice(split, target.index), 'plain')
      pushTrimmed(out, action.slice(target.index), 'target')
    }
  }

  push(out, ';', 'plain')
}

/** Lo que va antes de los dos puntos: su límite (`Once per turn`), su condición y su velocidad (`(Quick Effect)`). */
function pushHeader(out: TextSegment[], header: string) {
  const once = ONCE_PER.exec(header)?.[0] ?? ''
  const rest = header.slice(once.length)
  const speed = SPEED.exec(rest)
  const before = speed ? rest.slice(0, speed.index) : rest
  const startsAt = /^[,\s]*/.exec(before)![0].length
  const inner = before.slice(startsAt).trimEnd()

  push(out, once, 'limit')

  // Sin `Once per turn` delante, la condición ya empezó con un abridor; con él, lo que sigue puede ser cualquier cosa (`, you can either`) y sólo se marca si abre una condición.
  if (inner !== '' && (once === '' || new RegExp(CONDITION_OPENERS.source, 'i').test(inner))) {
    push(out, before.slice(0, startsAt), 'plain')
    push(out, inner, 'condition')
    push(out, before.slice(startsAt + inner.length), 'plain')
  } else {
    push(out, before, 'plain')
  }

  if (speed) {
    push(out, speed[0], 'speed')
    push(out, rest.slice(speed.index + speed[0].length), 'plain')
  }
}

/** Una oración: su condición y su velocidad (si empieza con un abridor y tiene `:`), su costo o su objetivo (lo que va antes del `;`) y su límite (`You can only …`). */
function pushSentence(out: TextSegment[], sentence: string) {
  const body = sentence.trimEnd()
  const tail = sentence.slice(body.length)

  if (/^You can only /.test(body)) {
    push(out, body, 'limit')
    push(out, tail, 'plain')
    return
  }

  let rest = body
  const colon = topLevelIndex(body, ':')
  const header = colon > 0 ? body.slice(0, colon) : ''

  // «Condición (Quick Effect): …»: la condición, la velocidad y los dos puntos.
  if (colon > 0 && (ONCE_PER.test(header) || CONDITION_OPENERS.test(header) || SPEED_ONLY.test(header.trim())) && !header.includes(';')) {
    pushHeader(out, header)
    push(out, ':', 'plain')
    rest = body.slice(colon + 1)
  } else if (colon > 0) {
    // Dos puntos que no abren una condición (una lista, un encabezado): la oración queda como está.
    push(out, body, 'plain')
    push(out, tail, 'plain')
    return
  }

  const semicolon = topLevelIndex(rest, ';')

  if (semicolon >= 0) {
    pushBeforeSemicolon(out, rest.slice(0, semicolon + 1))
    push(out, rest.slice(semicolon + 1), 'plain')
  } else {
    push(out, rest, 'plain')
  }

  push(out, tail, 'plain')
}

/** El texto de una carta partido en pedazos con su tipo (ver el encabezado: garantías y qué se marca). Sin nada que marcar, un solo pedazo `plain`. */
export function segmentCardText(text: string): TextSegment[] {
  const out: TextSegment[] = []

  for (const line of text.split(/(\r?\n)/)) {
    if (line === '' || /^\r?\n$/.test(line)) {
      push(out, line, 'plain')
      continue
    }

    // Una viñeta (`● …`) es parte del efecto: se marca lo que diga adentro y el signo queda sin marcar.
    const bullet = /^(?:●|•)\s*/.exec(line)?.[0] ?? ''

    push(out, bullet, 'plain')

    const content = line.slice(bullet.length)

    for (const { start, end } of sentences(content)) {
      pushSentence(out, content.slice(start, end))
    }
  }

  return out
}

/**
 * Cómo abre una oración que es un efecto que se activa (para alinearla con los efectos del script, ver `card-effect-map.ts`): `trigger` (`If … : …`, `When … : …`), `during` (`During …: …`), `quick` (lleva `(Quick Effect)`),
 * `once` (`Once per turn: …` solo) o `plain` (`You can …; …`, sin encabezado).
 */
export type EffectOpening = 'trigger' | 'during' | 'once' | 'quick' | 'plain'

/** Una oración que es un efecto que se activa: dónde está en el texto, cómo abre y qué lleva (la velocidad, el costo, el objetivo, si dice «una vez por turno»). */
export interface EffectSentence {
  /** Dónde empieza en el texto entero. */
  start: number
  /** La oración, sin el espacio que la sigue. */
  text: string
  opening: EffectOpening
  quick: boolean
  cost: boolean
  target: boolean
  /** Dice «Once per turn» (al abrir o adentro). */
  once: boolean
  /** Sólo en un efecto rápido: cuándo se activa sin que antes pase algo; null si lleva una condición o no se sabe. */
  window: EffectWindow | null
}

/** Lo que queda del encabezado (lo de antes de los dos puntos) sin el límite de «Once per turn» ni la etiqueta de velocidad: la condición, si hay. */
const headerBase = (header: string) => header.replace(ONCE_PER, '').replace(/^[,\s]+/, '').replace(SPEED, '').trim()

/**
 * Cuándo se puede activar un efecto rápido **sin que antes pase algo** (el rival te pregunta si hacés algo antes de pasar de fase: no hay cadena ni suceso a los que responder). `turn`: en el turno de quién
 * (`opponent` = el del rival de quien tiene la carta, `self` = el propio, `any` = de cualquiera); `phases`: en cuáles, o `null` en cualquiera. Sólo hay ventana si el encabezado es **sólo** eso:
 * `During your opponent's Main Phase (Quick Effect)`, `During the Main or Battle Phase`, `(Quick Effect)` solo. Con una condición (`When a card is activated`, `During the Battle Phase, if …`,
 * `If you control …`) o con algo que no se sabe leer, no hay ventana: no se sabe si se cumple.
 */
export interface EffectWindow {
  turn: 'any' | 'opponent' | 'self'
  phases: ReadonlyArray<'draw' | 'standby' | 'main' | 'battle' | 'end'> | null
}

const PHASE_WORD = '(?:Draw|Standby|Main|Battle|End)(?: Phase)?'
const WINDOW = new RegExp(`^During (your opponent's|either player's|the|your) (?:turn|(${PHASE_WORD}(?:,? (?:or|and) ${PHASE_WORD})*))$`, 'i')

function effectWindow(base: string): EffectWindow | null {
  if (base === '') return { turn: 'any', phases: null }

  const match = WINDOW.exec(base)

  if (match === null) return null

  const owner = match[1]!.toLowerCase()
  const phases = match[2] === undefined ? null : (['draw', 'standby', 'main', 'battle', 'end'] as const).filter((phase) => new RegExp(`\\b${phase}\\b`, 'i').test(match[2]!))

  return { turn: owner === 'your opponent\'s' ? 'opponent' : owner === 'your' ? 'self' : 'any', phases }
}

/** Si `body` es un efecto que se activa y cómo abre; null si no lo es (una regla, un límite, una oración suelta). */
function effectOpening(body: string): EffectOpening | null {
  if (/^You can only /.test(body)) return null

  const colon = topLevelIndex(body, ':')
  const header = colon > 0 ? body.slice(0, colon) : ''

  if (colon > 0) {
    if (header.includes(';') || !(ONCE_PER.test(header) || CONDITION_OPENERS.test(header) || SPEED_ONLY.test(header.trim()))) return null

    const base = headerBase(header)

    if (SPEED.test(header)) return 'quick'
    if (base === '') return 'once'

    return /^(?:During|While)\b/i.test(base) ? 'during' : 'trigger'
  }

  return /^(?:You can|You may)\b/.test(body) && topLevelIndex(body, ';') >= 0 ? 'plain' : null
}

/**
 * Las oraciones del texto que son efectos que se activan, en orden: las que abren con una condición (`If …:`), con `During …:`, con `Once per turn:` o con `(Quick Effect):`, y las que empiezan con `You can` y llevan un
 * costo o un objetivo antes del `;`. Las reglas (`Cannot be Normal Summoned`), los límites (`You can only …`) y los efectos continuos no cuentan.
 */
export function effectSentences(text: string): EffectSentence[] {
  const out: EffectSentence[] = []
  let offset = 0

  for (const line of text.split(/(\r?\n)/)) {
    if (line !== '' && !/^\r?\n$/.test(line)) {
      const bullet = /^(?:●|•)\s*/.exec(line)?.[0] ?? ''
      const content = line.slice(bullet.length)

      for (const { start, end } of sentences(content)) {
        const body = content.slice(start, end).trimEnd()
        const opening = effectOpening(body)

        if (opening === null) continue

        const tones = new Set(segmentCardText(body).map((segment) => segment.tone))

        out.push({ start: offset + bullet.length + start, text: body, opening, quick: opening === 'quick', cost: tones.has('cost'), target: tones.has('target'), once: ONCE_PER.test(body) || /\bonce per turn\b/i.test(body), window: opening === 'quick' ? effectWindow(headerBase(body.slice(0, topLevelIndex(body, ':')))) : null })
      }
    }

    offset += line.length
  }

  return out
}

/**
 * Un efecto partido en **cuándo** y **qué hace**, **textual**: no se recorta ni se reescribe nada, porque la precisión es de la frase. `when` es lo de antes de los dos puntos («If this card is in your hand», «Once per turn»,
 * «(Quick Effect)»; vacío si el efecto no lleva encabezado) y `what` lo que sigue («You can banish 1 "HERO" monster from your GY; Special Summon this card.»), o la frase entera si no hay encabezado.
 */
export function effectParts(sentence: EffectSentence): { when: string; what: string } {
  const colon = topLevelIndex(sentence.text, ':')

  return colon > 0 ? { when: sentence.text.slice(0, colon).trim(), what: sentence.text.slice(colon + 1).trim() } : { when: '', what: sentence.text }
}

/** Un pedazo del texto de una carta (desde `start` hasta `end`, sin incluirlo), para resaltarlo: la frase de un efecto. */
export interface TextRange {
  start: number
  end: number
}

/** Un pedazo del texto de **una** carta (por su número de YGOPRODeck): lo que la mesa le pide al detalle de la carta que resalte. */
export interface CardTextHighlight extends TextRange {
  ygoprodeckId: number
}
