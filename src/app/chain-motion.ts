/**
 * La cadena animada del duelo automático: cuándo pasa cada cosa, en un módulo puro. JavaScript sólo ordena (pone y saca clases en el momento justo); lo que se mueve son los
 * `--animate-*` de `src/index.css` (sólo `transform`/`opacity`), y con movimiento reducido no se mueve nada: cambian el color y el texto.
 * - **Armar:** cada eslabón encaja (`link-in`, `LINK_IN_MS`), su carta se levanta (`lift`) y el trazo de la mesa crece (`seg-in`, y su número después).
 * - **Resolver, de atrás para adelante,** `LINK_MS` por eslabón: se ilumina y sube (0), la cadena se tensa hacia él (`PULL_AT`), su carta ejecuta y su estado cambia (`ACT_AT`),
 *   se suelta (`RELEASE_AT`: se parte en dos, o se desliza abajo si quedó sin efecto; su trazo se apaga) y empieza el siguiente; al final, `CLOSE_MS` en que lo que queda se
 *   disuelve. Tres eslabones: 2,45 s.
 * En el duelo el ritmo de los pasos lo pone el núcleo (`chainDwell`); la pantalla reacciona a cada cambio de estado con `cuesBetween`. La muestra del catálogo arma el guion
 * entero con `resolveSchedule`.
 */

export type LinkState = 'chained' | 'solving' | 'solved' | 'negated' | 'disabled'
/** Cómo termina un eslabón. */
export type LinkFate = Extract<LinkState, 'solved' | 'negated' | 'disabled'>

export const LINK_IN_MS = 300
export const PULL_AT = 120
export const PULL_MS = 200
export const ACT_AT = 320
export const RELEASE_AT = 480
export const LINK_MS = 750
/** Lo que tarda en irse el eslabón que se soltó (se parte o se desliza, 260 ms) antes del siguiente. */
export const EXIT_MS = LINK_MS - RELEASE_AT
export const CLOSE_MS = 200

export const fated = (state: LinkState): state is LinkFate => state === 'solved' || state === 'negated' || state === 'disabled'

export interface LinkLook {
  /** 1 = CL1. */
  number: number
  state: LinkState
}

/**
 * Qué se le hace a la cadena: `enter`/`entered` (encaja), `pull`/`pulled` (se tensa hacia `link`), `act` (la carta ejecuta), `release` (se suelta), `gone` (ya no está) y `dissolve`
 * (terminó: lo que queda se disuelve).
 */
export type Cue = { kind: 'enter' | 'entered' | 'pull' | 'pulled' | 'act' | 'release' | 'gone'; link: number } | { kind: 'dissolve' }
export interface Timed<T> {
  /** Milisegundos desde ahora. */
  at: number
  cue: T
}

/**
 * Lo que hay que hacer, y cuándo, al pasar la cadena de `prev` a `next` (por número de eslabón). Montada (`prev` null), lo ya resuelto se da por ido y nada entra.
 * - Un eslabón nuevo encaja.
 * - El que empieza a resolverse: la cadena se tensa a los `PULL_AT` y su carta ejecuta a los `ACT_AT`.
 * - El que llega a su final se suelta `RELEASE_AT − ACT_AT` después (lo que se ve su color nuevo) y se va `EXIT_MS` más tarde.
 * - Terminada la cadena (`done`), lo que queda se disuelve.
 */
export function cuesBetween(prev: readonly LinkLook[] | null, next: readonly LinkLook[], done = false, wasDone = false): Array<Timed<Cue>> {
  const cues: Array<Timed<Cue>> = []
  const release = RELEASE_AT - ACT_AT

  for (const link of next) {
    const old = prev?.find((item) => item.number === link.number)
    const n = link.number

    if (!prev) {
      if (fated(link.state)) cues.push({ at: 0, cue: { kind: 'gone', link: n } })
      continue
    }
    if (!old) cues.push({ at: 0, cue: { kind: 'enter', link: n } }, { at: LINK_IN_MS, cue: { kind: 'entered', link: n } })
    if (link.state === 'solving' && old?.state !== 'solving') {
      cues.push({ at: PULL_AT, cue: { kind: 'pull', link: n } }, { at: ACT_AT, cue: { kind: 'act', link: n } }, { at: PULL_AT + PULL_MS, cue: { kind: 'pulled', link: n } })
    }
    if (fated(link.state) && !(old && fated(old.state))) cues.push({ at: release, cue: { kind: 'release', link: n } }, { at: release + EXIT_MS, cue: { kind: 'gone', link: n } })
  }
  if (done && !wasDone) cues.push({ at: 0, cue: { kind: 'dissolve' } })

  return cues.sort((a, b) => a.at - b.at)
}

export type ScheduleStep = { at: number; link: number; state: LinkState } | { at: number; done: true }

/**
 * La resolución entera de una cadena armada (`fates[0]` es CL1), de atrás para adelante: cada eslabón empieza a resolverse a los `LINK_MS` del anterior y llega a su final a los
 * `ACT_AT`; a los `fates.length × LINK_MS`, terminó (`done`), y `total` (con el cierre) es cuándo ya no queda nada: 2.450 ms con tres.
 */
export function resolveSchedule(fates: readonly LinkFate[]): { steps: ScheduleStep[]; total: number } {
  const steps: ScheduleStep[] = []

  fates.forEach((_, i) => {
    const index = fates.length - 1 - i
    const start = i * LINK_MS

    steps.push({ at: start, link: index + 1, state: 'solving' }, { at: start + ACT_AT, link: index + 1, state: fates[index]! })
  })
  steps.push({ at: fates.length * LINK_MS, done: true })

  return { steps, total: fates.length * LINK_MS + CLOSE_MS }
}

/** El reloj de `play`: el de la ventana o uno de prueba. */
export interface Clock {
  setTimeout: (run: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}
export const windowClock: Clock = { setTimeout: (run, ms) => window.setTimeout(run, ms), clearTimeout: (id) => window.clearTimeout(id as number) }

/**
 * Corre cada cosa en su momento (`at`; lo de 0, en el acto) con `clock`. `cancel` corta lo que falta; `finish` lo hace ya, en orden (tocar la mesa termina la cadena de una).
 */
export function play<T extends { at: number }>(items: readonly T[], apply: (item: T) => void, clock: Clock = windowClock) {
  const left = new Set(items)
  const run = (item: T) => {
    if (left.delete(item)) apply(item)
  }
  const ids = items.flatMap((item) => (item.at > 0 ? [clock.setTimeout(() => run(item), item.at)] : (run(item), [])))
  const cancel = () => ids.forEach((id) => clock.clearTimeout(id))

  return {
    cancel,
    finish: () => {
      cancel()
      ;[...left].sort((a, b) => a.at - b.at).forEach(run)
    },
  }
}
