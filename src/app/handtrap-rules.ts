/**
 * Qué cuenta como hand trap, leído de las reglas de la carta y no de su texto. Los scripts de EDOPro
 * (Project Ignis, github.com/ProjectIgnis/CardScripts) declaran cada efecto con su tipo y desde dónde se activa:
 * una hand trap es un monstruo con un efecto rápido o disparador que se activa desde la mano, o una trampa que se
 * puede activar desde la mano. Un efecto de ignición desde la mano (sólo en el turno propio) no cuenta.
 * Lo usa scripts/sync-meta-decks.mjs; la app no lo necesita en runtime.
 */

export interface CardEffect {
  type: string
  range: string
  code: string
}

/** Efectos que responden a algo que pasa: rápidos (en cualquier momento) o disparadores (cuando ocurre un evento). */
const RESPONSIVE_TYPES = /EFFECT_TYPE_(?:QUICK_O|QUICK_F|TRIGGER_O|TRIGGER_F)\b/
const FROM_HAND = /\bLOCATION_HAND\b/
const TRAP_FROM_HAND = /\bEFFECT_TRAP_ACT_IN_HAND\b/

const INITIAL_EFFECT = /^function\s+\w+\.initial_effect\(/
const CREATE = /^(?:local\s+)?(\w+)\s*=\s*Effect\.CreateEffect\(/
const CLONE = /^(?:local\s+)?(\w+)\s*=\s*(\w+):Clone\(\)/
const SETTER = /^(\w+):Set(Type|Range|Code)\((.*)\)$/
const REGISTER = /^c:RegisterEffect\((\w+)/

/**
 * Los efectos propios de la carta: los que `initial_effect` registra sobre ella con `c:RegisterEffect`.
 * Los que se crean dentro de las operaciones (sobre fichas, sobre otras cartas, globales) no son de la carta.
 */
export function readCardEffects(lua: string): CardEffect[] {
  const effects: CardEffect[] = []
  const drafts = new Map<string, CardEffect>()
  let inside = false

  for (const rawLine of lua.split('\n')) {
    const line = rawLine.replace(/--.*$/, '').trim()

    if (!inside) {
      inside = INITIAL_EFFECT.test(line)
      continue
    }

    // El `end` sin sangría cierra initial_effect; los anidados van con tabulación.
    if (/^end\b/.test(rawLine)) {
      break
    }

    const created = CREATE.exec(line)

    if (created) {
      drafts.set(created[1], { type: '', range: '', code: '' })
      continue
    }

    const cloned = CLONE.exec(line)

    if (cloned) {
      drafts.set(cloned[1], { ...(drafts.get(cloned[2]) ?? { type: '', range: '', code: '' }) })
      continue
    }

    const setter = SETTER.exec(line)

    if (setter) {
      const draft = drafts.get(setter[1])

      if (draft) {
        draft[setter[2].toLowerCase() as keyof CardEffect] = setter[3]
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

  return effects
}

export function isHandtrapEffect(effect: CardEffect): boolean {
  return TRAP_FROM_HAND.test(effect.code) || (RESPONSIVE_TYPES.test(effect.type) && FROM_HAND.test(effect.range))
}

/** `true` si el script de la carta tiene al menos un efecto de hand trap. */
export function isHandtrapScript(lua: string): boolean {
  return readCardEffects(lua).some(isHandtrapEffect)
}
