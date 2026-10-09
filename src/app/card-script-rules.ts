/**
 * Qué puede hacer una carta, leído de sus reglas y no de su texto. Los scripts de EDOPro (Project Ignis,
 * github.com/ProjectIgnis/CardScripts) declaran cada efecto con su tipo, desde dónde se activa, qué hace
 * (categorías) y a quién le pega; de ahí salen los bits de CARD_RULE que el clasificador usa para los roles
 * que son reglas puras. Lo corre scripts/sync-meta-decks.mjs sobre todos los scripts y guarda el resultado en
 * src/data/card-rules.json; la app sólo lee ese JSON.
 */

/** Un bit por hecho. `generic` no sale del script: lo pone el sync con los decks de torneo. */
export const CARD_RULE = {
  /** Efecto rápido o disparador activable desde la mano, o trampa activable desde la mano. */
  handtrap: 1 << 0,
  /** Agrega del Deck a la mano. */
  search: 1 << 1,
  /** Invoca de modo especial desde el Deck. */
  recruit: 1 << 2,
  draw: 1 << 3,
  /** Se invoca a sí misma desde la mano (procedimiento propio o efecto de ignición desde la mano). */
  selfFromHand: 1 << 4,
  /** Un efecto rápido o una activación que niega o anula. */
  negate: 1 << 5,
  /** Destruye, destierra, devuelve o roba el control de cartas del rival en el campo, y sólo del rival. */
  hitsOpponent: 1 << 6,
  /** Lo mismo, pero sobre cartas de cualquiera de los dos campos (o cambia posiciones). */
  hitsEither: 1 << 7,
  /** Se invoca al campo del rival (Kaiju, Lava Golem). */
  givesToOpponent: 1 << 8,
  /** Restricción continua que también afecta al rival. */
  floodgate: 1 << 9,
  /** Efecto rápido desde el campo que niega, quita o cambia posiciones: interacción en el turno del rival. */
  quickFromField: 1 << 10,
  /** Menciona arquetipos o cartas concretas: es pieza de un paquete. */
  mentions: 1 << 11,
  /** La juegan decks de torneo de varios arquetipos distintos (lo pone el sync). */
  generic: 1 << 12,
} as const

export type CardRuleFlag = keyof typeof CARD_RULE

export interface CardEffect {
  type: string
  range: string
  code: string
  category: string
  targetRange: string
  /** Nombres de las funciones del script (`s.target`), o '' si van en línea o son de utilidades. */
  target: string
  operation: string
}

export interface CardScript {
  effects: CardEffect[]
  /** Cuerpo de cada función de nivel superior, por nombre (`s.target`). */
  functions: Map<string, string>
  /** Las utilidades que invocan al campo del rival (Kaiju, Lava Golem) no declaran el efecto en el script. */
  givesToOpponent: boolean
  mentions: boolean
}

const EMPTY_EFFECT: CardEffect = { type: '', range: '', code: '', category: '', targetRange: '', target: '', operation: '' }

const FUNCTION_START = /^function\s+([\w.]+)\s*\(/
const INITIAL_EFFECT = /^function\s+\w+\.initial_effect\(/
const CREATE = /^(?:local\s+)?(\w+)\s*=\s*Effect\.CreateEffect\(/
const CLONE = /^(?:local\s+)?(\w+)\s*=\s*(\w+):Clone\(\)/
const SETTER = /^(\w+):Set(Type|Range|Code|Category|TargetRange|Target|Operation)\((.*)\)$/
const REGISTER = /^c:RegisterEffect\((\w+)/
const GIVES_PROCEDURE = /aux\.Add(?:Kaiju|Lava)Procedure\(/
const LISTED = /^s\.listed_(?:series|names)\s*=\s*\{([^}]*)\}/
const FUNCTION_NAME = /^(s\.\w+)$/

const QUICK = /EFFECT_TYPE_QUICK_[OF]\b/
const TRIGGER = /EFFECT_TYPE_TRIGGER_[OF]\b/
const IGNITION = /EFFECT_TYPE_IGNITION\b/
const ACTIVATE = /EFFECT_TYPE_ACTIVATE\b/
const FIELD_TYPE = /EFFECT_TYPE_FIELD\b/
const CONTINUOUS = /EFFECT_TYPE_CONTINUOUS\b/
const FROM_HAND = /\bLOCATION_HAND\b/
const ON_FIELD = /\bLOCATION_(?:MZONE|SZONE|ONFIELD|FZONE|PZONE)\b/
const TRAP_FROM_HAND = /\bEFFECT_TRAP_ACT_IN_HAND\b/
const SUMMON_PROCEDURE = /\bEFFECT_SPSUMMON_PROC\b/
const RESTRICTION = /^(?:EFFECT_CANNOT_|EFFECT_DISABLE\b|EFFECT_DISABLE_EFFECT\b|EFFECT_SKIP_)/
const SEARCH = /\bCATEGORY_SEARCH\b/
const DRAW = /\bCATEGORY_DRAW\b/
const SPECIAL_SUMMON = /\bCATEGORY_SPECIAL_SUMMON\b/
const NEGATE = /\bCATEGORY_(?:NEGATE|DISABLE|DISABLE_SUMMON)\b/
const REMOVAL = /\bCATEGORY_(?:DESTROY|REMOVE|TOHAND|TODECK|TOGRAVE|CONTROL|RELEASE)\b/
const POSITION = /\bCATEGORY_POSITION\b/

/**
 * Llamadas que miran cartas de un jugador: (jugador, zonas propias, zonas del rival). Las de selección llevan
 * primero quién elige. Los índices son los de esos tres argumentos.
 */
const LOCATION_CALLS: ReadonlyArray<[name: string, player: number, own: number, opponent: number]> = [
  ['IsExistingMatchingCard', 1, 2, 3],
  ['IsExistingTarget', 1, 2, 3],
  ['GetMatchingGroup', 1, 2, 3],
  ['GetMatchingGroupCount', 1, 2, 3],
  ['GetFirstMatchingCard', 1, 2, 3],
  ['SelectMatchingCard', 2, 3, 4],
  ['SelectTarget', 2, 3, 4],
  ['GetFieldGroup', 0, 1, 2],
  ['GetFieldGroupCount', 0, 1, 2],
]
const LOCATION_CALL = new RegExp(`Duel\\.(${LOCATION_CALLS.map(([name]) => name).join('|')})\\(`, 'g')
const GIVE_SUMMON = /Duel\.SpecialSummon(?:Step)?\(/g

type Scope = 'opponent' | 'either' | 'own'

interface LocationCall {
  own: string
  opponent: string
}

/** Las funciones de nivel superior (`function s.x(...)` ... `end` sin sangría), con su cuerpo. */
function readFunctions(lua: string): Map<string, string> {
  const functions = new Map<string, string>()
  let name: string | null = null
  let body: string[] = []

  for (const rawLine of lua.split('\n')) {
    if (name === null) {
      const start = FUNCTION_START.exec(rawLine)

      if (start) {
        name = start[1]
        body = []
      }

      continue
    }

    if (/^end\b/.test(rawLine)) {
      functions.set(name, body.join('\n'))
      name = null
      continue
    }

    body.push(rawLine.replace(/--.*$/, ''))
  }

  return functions
}

/** Los efectos propios de la carta: los que `initial_effect` registra sobre ella con `c:RegisterEffect`. */
export function readCardScript(lua: string): CardScript {
  const functions = readFunctions(lua)
  const effects: CardEffect[] = []
  const drafts = new Map<string, CardEffect>()
  let givesToOpponent = false
  let mentions = false
  let inside = false

  for (const rawLine of lua.split('\n')) {
    const line = rawLine.replace(/--.*$/, '').trim()
    const listed = LISTED.exec(line)

    // `listed_names={id}` es la carta nombrándose a sí misma.
    if (listed && listed[1].split(',').some((entry) => entry.trim() !== '' && entry.trim() !== 'id')) {
      mentions = true
    }

    if (!inside) {
      inside = INITIAL_EFFECT.test(line)
      continue
    }

    // El `end` sin sangría cierra initial_effect; los anidados van con tabulación.
    if (/^end\b/.test(rawLine)) {
      inside = false
      continue
    }

    if (GIVES_PROCEDURE.test(line)) {
      givesToOpponent = true
    }

    const created = CREATE.exec(line)

    if (created) {
      drafts.set(created[1], { ...EMPTY_EFFECT })
      continue
    }

    const cloned = CLONE.exec(line)

    if (cloned) {
      drafts.set(cloned[1], { ...(drafts.get(cloned[2]) ?? EMPTY_EFFECT) })
      continue
    }

    const setter = SETTER.exec(line)

    if (setter) {
      const draft = drafts.get(setter[1])

      if (draft) {
        const property = setter[2]
        const value = setter[3]

        if (property === 'Target' || property === 'Operation') {
          draft[property === 'Target' ? 'target' : 'operation'] = FUNCTION_NAME.test(value) ? value : ''
        } else {
          draft[(property.charAt(0).toLowerCase() + property.slice(1)) as 'type' | 'range' | 'code' | 'category' | 'targetRange'] = value
        }
      }

      continue
    }

    const registered = REGISTER.exec(line)

    if (registered) {
      const draft = drafts.get(registered[1])

      if (draft) {
        effects.push({ ...draft })
      }
    }
  }

  return { effects, functions, givesToOpponent, mentions }
}

/** Los argumentos de una llamada, respetando paréntesis anidados; `text` empieza justo después del `(`. */
function readArguments(text: string): string[] {
  const args: string[] = []
  let depth = 0
  let current = ''

  for (const char of text) {
    if (char === '(' || char === '{' || char === '[') {
      depth += 1
    } else if (char === ')' || char === '}' || char === ']') {
      if (depth === 0) {
        break
      }

      depth -= 1
    } else if (char === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  args.push(current.trim())
  return args
}

function readLocationCalls(body: string): LocationCall[] {
  const calls: LocationCall[] = []

  for (const match of body.matchAll(LOCATION_CALL)) {
    const signature = LOCATION_CALLS.find(([name]) => name === match[1])

    if (!signature) {
      continue
    }

    const args = readArguments(body.slice(match.index + match[0].length))
    const player = args[signature[1]] ?? ''
    const own = args[signature[2]] ?? ''
    const opponent = args[signature[3]] ?? ''

    // Con `1-tp` como jugador, "propio" y "rival" se dan vuelta.
    calls.push(/^1-/.test(player) ? { own: opponent, opponent: own } : { own, opponent })
  }

  return calls
}

function isEmptyLocation(value: string): boolean {
  return value === '' || value === '0' || value === 'nil'
}

/** A quién le pega el efecto, según las zonas del campo que miran sus funciones de objetivo y operación. */
function scopeOf(calls: LocationCall[]): Scope | null {
  let scope: Scope | null = null

  for (const call of calls) {
    const own = ON_FIELD.test(call.own)
    const opponent = ON_FIELD.test(call.opponent)

    if (own && opponent) {
      return 'either'
    }

    if (opponent && isEmptyLocation(call.own)) {
      scope = 'opponent'
    } else if (own && scope === null) {
      scope = 'own'
    }
  }

  return scope
}

function summonsToOpponent(body: string): boolean {
  for (const match of body.matchAll(GIVE_SUMMON)) {
    const args = readArguments(body.slice(match.index + match[0].length))

    if (/^1-/.test(args[3] ?? '')) {
      return true
    }
  }

  return false
}

function affectsOpponent(targetRange: string): boolean {
  const [, opponent = ''] = readArguments(targetRange)
  return !isEmptyLocation(opponent)
}

export function isHandtrapEffect(effect: CardEffect): boolean {
  return TRAP_FROM_HAND.test(effect.code) || ((QUICK.test(effect.type) || TRIGGER.test(effect.type)) && FROM_HAND.test(effect.range))
}

/** Los bits de CARD_RULE que el script justifica (sin `generic`, que es un dato de los decks). */
export function cardRuleFlags(lua: string): number {
  const script = readCardScript(lua)
  let flags = 0

  if (script.givesToOpponent) {
    flags |= CARD_RULE.givesToOpponent
  }

  if (script.mentions) {
    flags |= CARD_RULE.mentions
  }

  for (const effect of script.effects) {
    const bodies = [effect.target, effect.operation].map((name) => script.functions.get(name) ?? '')
    const calls = bodies.flatMap(readLocationCalls)
    const scope = scopeOf(calls)
    const responsive = QUICK.test(effect.type) || TRIGGER.test(effect.type)
    const activation = ACTIVATE.test(effect.type)
    const fromHand = FROM_HAND.test(effect.range)
    const handtrap = isHandtrapEffect(effect)

    if (handtrap) {
      flags |= CARD_RULE.handtrap
    }

    if (SEARCH.test(effect.category)) {
      flags |= CARD_RULE.search
    }

    if (DRAW.test(effect.category)) {
      flags |= CARD_RULE.draw
    }

    if (SPECIAL_SUMMON.test(effect.category) && calls.some((call) => /\bLOCATION_DECK\b/.test(call.own))) {
      flags |= CARD_RULE.recruit
    }

    if (fromHand && (SUMMON_PROCEDURE.test(effect.code) || (IGNITION.test(effect.type) && SPECIAL_SUMMON.test(effect.category)))) {
      flags |= CARD_RULE.selfFromHand
    }

    if (bodies.some(summonsToOpponent)) {
      flags |= CARD_RULE.givesToOpponent
    }

    if ((responsive || activation) && NEGATE.test(effect.category)) {
      flags |= CARD_RULE.negate
    }

    if ((responsive || activation || IGNITION.test(effect.type)) && REMOVAL.test(effect.category)) {
      if (scope === 'opponent') {
        flags |= CARD_RULE.hitsOpponent
      } else if (scope === 'either') {
        flags |= CARD_RULE.hitsEither
      }
    }

    if (POSITION.test(effect.category) && (scope === 'opponent' || scope === 'either')) {
      flags |= CARD_RULE.hitsEither
    }

    if (QUICK.test(effect.type) && ON_FIELD.test(effect.range) && (NEGATE.test(effect.category) || REMOVAL.test(effect.category) || POSITION.test(effect.category))) {
      flags |= CARD_RULE.quickFromField
    }

    if (FIELD_TYPE.test(effect.type) && !responsive && !CONTINUOUS.test(effect.type) && RESTRICTION.test(effect.code) && affectsOpponent(effect.targetRange)) {
      flags |= CARD_RULE.floodgate
    }
  }

  return flags
}

/** `true` si el script tiene al menos un efecto de hand trap. */
export function isHandtrapScript(lua: string): boolean {
  return (cardRuleFlags(lua) & CARD_RULE.handtrap) !== 0
}
