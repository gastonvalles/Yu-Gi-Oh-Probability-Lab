import { shuffleWithSeed } from '../practice-mat'

/**
 * De nuestros decks a lo que el núcleo necesita antes de `startDuel` (§3.5 y §3.10 del diseño): los códigos del `.cdb`, el orden del
 * deck (barajar lo hace quien llama: el núcleo no baraja el deck inicial) y el cierre de scripts. Los lectores son síncronos, así que
 * todo script tiene que estar en memoria antes; los que el núcleo pide en caliente (las fichas) los atiende el mismo lector (`core-host.ts`).
 * Ante la duda no se automatiza: una carta que no está en el `.cdb`, o que tiene efecto y no tiene script, no deja crear el duelo.
 */

/** Lo que el núcleo sabe de una carta (`OcgCardData` del paquete, lo justo). */
export interface CoreCardInfo {
  code: number
  alias: number
  type: number
}

/** Un deck como `src/data/meta-decklists.json`: `[passcode, copias]`. */
export interface DeckList {
  main: readonly (readonly [number, number])[]
  extra?: readonly (readonly [number, number])[]
}

export interface MappedDeck {
  main: number[]
  extra: number[]
  /** Passcodes que el `.cdb` no tiene (ni por sí ni por un arte alternativo). */
  missing: number[]
  /** Cartas con efecto sin script: el núcleo las dejaría sin efectos, sin avisar. */
  noRules: number[]
}

const TYPE_NORMAL = 0x10
const TYPE_TOKEN = 0x4000
const TYPE_PENDULUM = 0x1000000
/**
 * Un arte alternativo (`alias` a menos de esta distancia del código) usa el script del original; un `alias` lejano es «se trata como»
 * y lleva el suyo. Es la regla del núcleo (`register_card`); en el `.cdb` no hay alias a 10–30 de su código, así que 10 o 20 da lo mismo.
 */
const ARTWORK_OFFSET = 20

/** El script que el núcleo pide para esa carta. */
export function scriptName(card: CoreCardInfo): string {
  const original = card.alias !== 0 && Math.abs(card.alias - card.code) < ARTWORK_OFFSET ? card.alias : card.code

  return `c${original}.lua`
}

/** Los Monstruos Normales (salvo los de Péndulo) y las fichas no necesitan script. */
export const needsScript = (card: CoreCardInfo) => !((card.type & TYPE_NORMAL && !(card.type & TYPE_PENDULUM)) || card.type & TYPE_TOKEN)

/**
 * El deck en códigos del núcleo, con copias expandidas. `resolve` da la carta del `.cdb` para un passcode (el lector de cartas, o uno que
 * además busca por arte alternativo o por nombre); `hasScript` dice si un script existe.
 */
export function mapDeck(list: DeckList, resolve: (passcode: number) => CoreCardInfo | null, hasScript: (name: string) => boolean): MappedDeck {
  const missing = new Set<number>()
  const noRules = new Set<number>()
  const expand = (rows: DeckList['main'] = []) =>
    rows.flatMap(([passcode, copies]) => {
      const card = resolve(passcode)

      if (!card) {
        missing.add(passcode)
        return []
      }
      if (needsScript(card) && !hasScript(scriptName(card))) noRules.add(card.code)

      return Array<number>(copies).fill(card.code)
    })

  return { main: expand(list.main), extra: expand(list.extra), missing: [...missing], noRules: [...noRules] }
}

/** El orden del deck, de arriba hacia abajo: la mano fija primero (en ese orden) y el resto barajado con la semilla. */
export function deckOrder(main: readonly number[], seed: number, hand: readonly number[] = []): number[] {
  const rest = [...main]

  for (const code of hand) {
    const at = rest.indexOf(code)

    if (at < 0) throw new Error(`the fixed hand asks for ${code}, which is not in the deck`)
    rest.splice(at, 1)
  }

  return [...hand, ...shuffleWithSeed(rest, seed)]
}

const LOAD_SCRIPT = /Duel\.LoadScript\(\s*["']([^"']+)["']/g

/**
 * Los scripts que el duelo necesita antes de empezar: las bibliotecas (`constant.lua`, `utility.lua` y lo que esas cargan con
 * `Duel.LoadScript`, en cadena) y el de cada carta distinta. `read` es el lector de scripts; lo que falta no entra (lo dice `mapDeck`).
 */
export function scriptClosure(cards: readonly CoreCardInfo[], read: (name: string) => string | null): string[] {
  const names = new Set<string>()
  const queue = ['constant.lua', 'utility.lua']

  while (queue.length > 0) {
    const name = queue.shift()!

    if (names.has(name)) continue
    const text = read(name)

    if (text === null) continue
    names.add(name)
    for (const match of text.matchAll(LOAD_SCRIPT)) queue.push(match[1]!)
  }
  for (const card of cards) {
    if (read(scriptName(card)) !== null) names.add(scriptName(card))
  }

  return [...names]
}
