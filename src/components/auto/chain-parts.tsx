import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { cancelWhenDone, EASE_IN_OUT, EASE_OUT, EASE_SNAP, prefersReducedMotion } from '../../app/motion'
import type { ChainOutcome, ChainRowState } from '../../app/auto/chain-feed'
import { fated, type Cue } from '../../app/chain-motion'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { PLAYER_COLOR } from '../duel/player-color'
import { useChainCues, VOIDED_ART } from '../probability/MatFx'
import { Badge } from '../ui/Badge'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { listItem } from '../ui/surfaces'
import type { Tone } from '../ui/tone'

/** Un eslabón como lo muestra la cadena: su número, de quién es y la carta. */
export interface ChainNoticeRow {
  /** 1 = CL1. */
  number: number
  /** «Vos» o el nombre del rival. */
  who: string
  /** Es tuyo: da el color del dueño (el de sus vidas, `PLAYER_COLOR`). */
  mine: boolean
  name: string
  art: string | null
  state: ChainRowState
  /** Negado o sin efecto: el eslabón que lo hizo (1 = CL1), si se sabe; el estado lo dice («Sin efecto · por CL2»). */
  by?: number
  /**
   * Lo que pasó, si dice más que el estado («Añade 1 carta», `outcomeChip`): reemplaza al estado en el chip y en el nombre accesible (`stateLabel`); el tilde o la cruz del arte siguen
   * diciendo el estado. En el duelo, sólo en una resuelta y sólo si el núcleo lo dice sin duda (`chainOutcome`); sin esto, el estado («Resuelta», «Sin efecto · por CL2»).
   */
  outcome?: { label: string; tone: Tone }
}

export const STATE_TONE: Record<ChainRowState, Tone> = { chained: 'neutral', solving: 'info', solved: 'success', negated: 'danger', disabled: 'warning' }
/** El ícono de cada tono de estado: el chip se lee por el texto (en la cinta, por su nombre accesible); el ícono y el color lo refuerzan, y el color nunca va solo. */
export const CHIP_ICON: Record<Tone, IconName> = { neutral: 'timer', brand: 'link', info: 'play', success: 'check', warning: 'ban', danger: 'x' }
export const stateLabel = ({ state, by, outcome }: Pick<ChainNoticeRow, 'state' | 'by' | 'outcome'>) =>
  outcome?.label ?? (by ? t('auto.chain.by', { state: t(`auto.chain.state.${state}`), by }) : t(`auto.chain.state.${state}`))
/** El chip de lo que hizo un eslabón resuelto («Añade 1 carta», «Invoca 2 monstruos»): verde como «Resuelta», que es lo que sigue siendo. */
export const outcomeChip = ({ kind, count }: ChainOutcome): NonNullable<ChainNoticeRow['outcome']> => ({ label: t(`auto.chain.outcome.${kind}`, { count }), tone: 'success' })
export const colorOf = (mine: boolean) => PLAYER_COLOR[mine ? 'mine' : 'theirs']

const voidedState = (state: ChainRowState) => state === 'negated' || state === 'disabled'

/**
 * El movimiento de la pila, una animación por cambio de estado de un eslabón (comparado por su número con el dibujo anterior): al montarse, una pila ya armada se ve como está, sin entrar. Todo de
 * compositor y corto (Web Animations, `cancelWhenDone`, nada con movimiento reducido): se leen todas las medidas primero y después se anima.
 * - Se suma un eslabón: entra arriba desde arriba (280 ms, `EASE_SNAP`) y los de abajo bajan su lugar (FLIP de `transform`, 280 ms, `EASE_OUT`).
 * - Resuelve: la fila hace un pop (320 ms) y su aro lima (una capa ya dibujada) se enciende con `opacity`; la marca de la izquierda viaja desde el que resolvió antes (300 ms, `EASE_IN_OUT`): se
 *   lee que se resuelve de arriba hacia abajo.
 * - Resuelta: el tilde entra girando sobre el arte (260 ms), el arte se apaga (`opacity` 1 → 0,6) y el aro se va.
 * - Negada o sin efecto: la cruz cae como un sello (260 ms) y la fila se sacude (300 ms); el arte queda gris latiendo (`VOIDED_ART`, como en la mesa).
 * - El chip cambia: el nuevo sube y aparece (200 ms).
 * Un paso que llega antes de que termine el anterior lo deja en su lugar (seco) y anima el nuevo.
 */
function useChainRowMotion(rows: readonly ChainNoticeRow[]) {
  const listRef = useRef<HTMLElement | null>(null)
  const before = useRef<readonly ChainNoticeRow[]>(rows)
  const signature = rows.map((row) => `${row.number}:${row.state}:${row.by ?? ''}`).join('|')
  // Las filas no tienen su propia lista (la pone quien las usa): se la toma de cualquiera de ellas.
  const hold = useCallback((item: HTMLLIElement | null) => {
    if (item?.parentElement) listRef.current = item.parentElement
  }, [])

  useLayoutEffect(() => {
    const list = listRef.current
    const prev = before.current

    before.current = rows
    // Una pila más corta es otra cadena: se ve como está.
    if (!list || prev === rows || rows.length < prev.length || prefersReducedMotion() || typeof list.animate !== 'function') return

    const row = (number: number) => list.querySelector<HTMLElement>(`:scope > [data-link="${number}"]`)
    const part = (number: number, name: string) => row(number)?.querySelector<HTMLElement>(`[data-part="${name}"]`) ?? null
    const jobs: Array<() => Animation | undefined> = []

    // Lectura: dónde está cada cosa.
    const added = rows.filter((link) => !prev.some((old) => old.number === link.number))
    const fresh = added.length === 1 ? row(added[0]!.number) : null
    const shift = fresh ? fresh.offsetHeight + parseFloat(getComputedStyle(list).rowGap || '0') : 0
    const wasSolving = prev.find((link) => link.state === 'solving')?.number
    const solving = rows.find((link) => link.state === 'solving')?.number
    const from = solving && solving !== wasSolving && wasSolving ? (row(wasSolving)?.offsetTop ?? null) : null
    const to = solving ? (row(solving)?.offsetTop ?? 0) : 0

    // Escritura.
    if (fresh) {
      jobs.push(() => fresh.animate([{ opacity: 0, transform: 'translateY(-0.75rem) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE_SNAP }))
      // Sólo los de abajo bajan su lugar: arriba no queda nada (la pila se resuelve desde el último).
      for (const link of rows) if (link.number < added[0]!.number) jobs.push(() => row(link.number)?.animate([{ transform: `translateY(${-shift}px)` }, { transform: 'none' }], { duration: 280, easing: EASE_OUT }))
    }
    for (const link of rows) {
      const old = prev.find((item) => item.number === link.number)

      if (!old || (old.state === link.state && old.by === link.by)) continue
      const n = link.number

      jobs.push(() => part(n, 'chip')?.animate([{ opacity: 0, transform: 'translateY(0.25rem)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE_OUT }))
      if (link.state === 'solving') {
        jobs.push(() => part(n, 'body')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 320, easing: EASE_SNAP }))
        jobs.push(() => part(n, 'ring')?.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE_SNAP }))
      }
      if (old.state === 'solving') jobs.push(() => part(n, 'ring')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_OUT }))
      if (link.state === 'solved') {
        jobs.push(() => part(n, 'mark')?.animate([{ opacity: 0, transform: 'scale(0.4) rotate(-25deg)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE_SNAP }))
        jobs.push(() => part(n, 'art')?.animate([{ opacity: 1 }, { opacity: 0.6 }], { duration: 240, easing: EASE_OUT }))
      }
      if (voidedState(link.state) && !voidedState(old.state)) {
        jobs.push(() => part(n, 'mark')?.animate([{ opacity: 0, transform: 'scale(1.8)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE_SNAP }))
        jobs.push(() => part(n, 'body')?.animate([{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 300, easing: EASE_OUT }))
      }
    }
    if (solving && solving !== wasSolving) {
      jobs.push(() =>
        part(solving, 'cursor')?.animate(from === null ? [{ opacity: 0, transform: 'translateY(-0.5rem)' }, { opacity: 1, transform: 'none' }] : [{ transform: `translateY(${from - to}px)` }, { transform: 'none' }], { duration: from === null ? 240 : 300, easing: from === null ? EASE_OUT : EASE_IN_OUT }),
      )
    }

    const animations = jobs.flatMap((job) => {
      const animation = job()

      return animation ? [cancelWhenDone(animation)] : []
    })

    return () => animations.forEach((animation) => animation.cancel())
    // `signature` resume `rows` (número, estado y quién lo negó): un dibujo con la misma pila no anima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return hold
}

/**
 * Las filas de la pila de la cadena, en el orden en que se resuelven (el último eslabón arriba): número en el color de su dueño, arte, nombre, de quién y un solo chip: su estado o, resuelta, lo que hizo si se
 * sabe (`outcome`: «Añade 1 carta»; el chip cambia con el mismo movimiento que al resolverse). Cada una es un botón de 44 px o más con su
 * nombre entero («Eslabón 2: Ash Blossom, del rival. Resolviendo»); el que se resuelve lleva el aro lima y la marca de la izquierda; el resuelto, un tilde sobre el arte apagado; el negado o sin efecto, una
 * cruz sobre el arte gris y latiendo (sólo el negado tacha su nombre). Cada cambio se anima (`useChainRowMotion`). Sin `who`, el dueño sólo por el color de su número (la hoja del celular: nada dicho dos
 * veces). La usan la pila de escritorio (`ChainNotice`) y el detalle de la hoja del celular (`ChainSheet`).
 */
export function ChainListRows({ rows, onPick, who = true }: { rows: readonly ChainNoticeRow[]; onPick: (index: number, rect: DOMRect) => void; who?: boolean }) {
  const hold = useChainRowMotion(rows)

  return [...rows].reverse().map((link, at) => {
    const color = colorOf(link.mine)
    const solving = link.state === 'solving'
    const voided = voidedState(link.state)
    const label = t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: stateLabel(link) })

    return (
      <li key={link.number} ref={hold} data-link={link.number} aria-current={solving ? 'step' : undefined} className="relative snap-start">
        {/* La marca de resolución: una sola, en la fila que se resuelve; viaja desde la anterior. */}
        {solving ? <span data-part="cursor" aria-hidden="true" className="absolute inset-y-1.5 -left-1.5 w-1 bg-info" /> : null}
        <button
          type="button"
          aria-label={label}
          data-part="body"
          className={cx(listItem, 'relative flex min-h-11 w-full items-center gap-2.5 p-1.5 text-left focus-visible:outline-none focus-visible:shadow-focus')}
          onClick={(event) => onPick(rows.length - 1 - at, event.currentTarget.getBoundingClientRect())}
        >
          {/* El aro lima y el velo ya dibujados: se anima su opacidad, nunca la sombra ni el fondo. */}
          <span data-part="ring" aria-hidden="true" className={cx('pointer-events-none absolute inset-0 rounded-card bg-tint/10 inset-ring-2 inset-ring-info/80', solving ? 'opacity-100' : 'opacity-0')} />
          <span className={cx('w-9 shrink-0 rounded-tag border py-0.5 text-center text-micro font-bold tabular-nums text-white', color.border, color.bubble)}>{`CL${link.number}`}</span>
          <span className="relative block aspect-[421/614] w-8 shrink-0 overflow-hidden bg-input">
            <span data-part="art" className={cx('block h-full w-full', link.state === 'solved' && 'opacity-60')}>
              <CardArt remoteUrl={link.art} name={link.name} className={cx('block h-full w-full object-cover', voided && VOIDED_ART)} />
            </span>
            {link.state === 'solved' || voided ? (
              <span data-part="mark" aria-hidden="true" className="absolute inset-0 grid place-items-center">
                <span className="grid size-5 place-items-center rounded-tag bg-background/85">
                  <Icon name={voided ? 'x' : 'check'} size={14} strokeWidth={2.6} className={voided ? 'text-danger-soft' : 'text-success-soft'} />
                </span>
              </span>
            ) : null}
          </span>
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className={cx('truncate text-body font-semibold', solving ? 'text-info' : voided ? 'text-muted' : 'text-foreground', link.state === 'negated' && 'line-through')}>{link.name}</span>
            {who ? <span className={cx('truncate text-micro font-semibold', color.text)}>{link.who}</span> : null}
          </span>
          {/* Sin ícono: el tilde o la cruz ya van sobre el arte (a 390 px el nombre necesita ese lugar). */}
          <Badge data-part="chip" tone={link.outcome?.tone ?? STATE_TONE[link.state]} size="sm" className="shrink-0">
            {stateLabel(link)}
          </Badge>
        </button>
      </li>
    )
  })
}

/** El hexágono recto del eslabón (`clip-path` fijo, nunca animado), sus dos mitades (se parten al soltarse) y el agujero de cada punta, donde encaja el vecino. */
const HEX = '[clip-path:polygon(0_50%,0.875rem_0,calc(100%-0.875rem)_0,100%_50%,calc(100%-0.875rem)_100%,0.875rem_100%)]'
const HALF = { a: '[clip-path:inset(0_50%_0_0)]', b: '[clip-path:inset(0_0_0_50%)]' }
const HOLE = '[clip-path:polygon(0_50%,0.3125rem_0,calc(100%-0.3125rem)_0,100%_50%,calc(100%-0.3125rem)_100%,0.3125rem_100%)]'
const SPLIT = { a: 'animate-split-a motion-reduce:animate-none', b: 'animate-split-b motion-reduce:animate-none' }
/** Cuántos eslabones entran a la vista; el resto, «+N» a la izquierda. */
export const LINKS_SHOWN = 4

interface Looks {
  entering: readonly number[]
  pullTo: number | null
  leaving: readonly number[]
  gone: readonly number[]
  dissolving: boolean
}
const NO_LOOKS: Looks = { entering: [], pullTo: null, leaving: [], gone: [], dissolving: false }

function lookAfter(looks: Looks, cue: Cue): Looks {
  switch (cue.kind) {
    case 'enter':
      return { ...looks, entering: [...looks.entering, cue.link] }
    case 'entered':
      return { ...looks, entering: looks.entering.filter((n) => n !== cue.link) }
    case 'pull':
      return { ...looks, pullTo: cue.link }
    case 'pulled':
      return looks.pullTo === cue.link ? { ...looks, pullTo: null } : looks
    case 'release':
      return { ...looks, leaving: [...looks.leaving, cue.link] }
    case 'gone':
      return { ...looks, leaving: looks.leaving.filter((n) => n !== cue.link), gone: [...looks.gone, cue.link] }
    case 'dissolve':
      return { ...looks, dissolving: true }
    default:
      return looks
  }
}

/**
 * La cadena como cadena: cada efecto es un eslabón hexagonal recto, entrelazado con el siguiente (se pisan 14 px), de izquierda a derecha CL1, CL2… (en el DOM, en el orden en que se resuelven:
 * el último primero). Cada uno, un botón con su nombre entero («Eslabón 2: Ash Blossom, del rival. Resolviendo»): el número en el color de su dueño, la carta (si entran menos de cuatro), su
 * nombre recortado y su estado («Nuevo», «En espera», «Resolviendo», «Sin efecto · por CL3», «Destierra 1 carta»). El borde, del color del dueño; el que resuelve, con la capa lima; lo resuelto,
 * menta; lo negado, rojo con un tajo; «sin efecto», apagado. Hasta `LINKS_SHOWN` a la vista y «+N».
 * El movimiento (`useChainCues`, los tiempos en `app/chain-motion.ts`): encaja (`animate-link-in`); al resolverse sube y se ilumina (`animate-rise`, `animate-glow-in`) y los de cada lado tiran
 * hacia él (`animate-pull-l`/`-r`); se suelta partiéndose en dos (`animate-split-a`/`-b`, el rótulo con `animate-split-fade`), el negado tras su tajo (`animate-slash-in`), y el que quedó sin
 * efecto se desliza abajo (`animate-slide-off`); terminada, lo que queda se disuelve (`animate-fade-out`). Lo que se fue deja de dibujarse. Con movimiento reducido (o `still`, el catálogo) nada se
 * mueve ni se va: cambian el color y el texto, y lo dice el `status` de quien la usa. La usan la línea del celular (`ChainLine`) y la pila de escritorio (`ChainNotice`).
 */
export function ChainLinks({ rows, onPick, done = false, id, className, still = false }: { rows: readonly ChainNoticeRow[]; onPick: (index: number, rect: DOMRect) => void; done?: boolean; id?: string; className?: string; still?: boolean }) {
  const [looks, setLooks] = useState(NO_LOOKS)

  useChainCues(rows, done, (cue) => setLooks((now) => lookAfter(now, cue)), still)
  // Lo ido es lo que ya terminó: un número que vuelve a esperar es de otra cadena.
  const live = rows.filter((row) => !(fated(row.state) && looks.gone.includes(row.number)))
  // Con más de cuatro, lo terminado deja su lugar (después de soltarse) a los que esperan.
  const pool = live.length > LINKS_SHOWN ? live.filter((row) => !fated(row.state) || looks.leaving.includes(row.number)) : live
  const shown = pool.slice(-LINKS_SHOWN)
  const more = pool.length - shown.length
  const resolving = rows.some((row) => row.state !== 'chained')

  return (
    <ol
      id={id}
      data-chain-list=""
      aria-label={t('auto.chain.list')}
      className={cx('m-0 flex min-h-0 list-none flex-row-reverse items-center justify-end p-1.5 pr-2', looks.dissolving && 'animate-fade-out motion-reduce:animate-none', still && '[&_*]:animate-none!', className)}
    >
      {[...shown].reverse().map((link) => {
        const n = link.number
        const color = colorOf(link.mine)
        const solving = link.state === 'solving'
        const voided = voidedState(link.state)
        const leaving = looks.leaving.includes(n)
        const slides = leaving && link.state === 'disabled'
        const splits = leaving && !slides
        const pull = looks.pullTo !== null && looks.pullTo !== n && !leaving ? (n < looks.pullTo ? 'animate-pull-l motion-reduce:animate-none' : 'animate-pull-r motion-reduce:animate-none') : null
        const ring = solving ? 'bg-info' : link.state === 'solved' ? 'bg-success' : link.state === 'negated' ? 'bg-danger' : null
        const fresh = n === rows.at(-1)?.number && link.state === 'chained' && !resolving

        return (
          <li
            key={n}
            data-link={n}
            aria-current={solving ? 'step' : undefined}
            className={cx('relative -ml-3.5 h-full max-h-16 min-w-0 max-w-32 flex-1 basis-0 last:ml-0', link.state === 'disabled' && 'opacity-45', slides ? 'animate-slide-off motion-reduce:animate-none' : (pull ?? (looks.entering.includes(n) && 'animate-link-in motion-reduce:animate-none')))}
          >
            <span className={cx('absolute inset-0', solving && 'animate-rise motion-reduce:animate-none')}>
              {(['a', 'b'] as const).map((half) => (
                <span key={half} aria-hidden="true" className={cx('absolute inset-0', HALF[half], splits && SPLIT[half])}>
                  <span className={cx('absolute inset-0', HEX, color.bar)} />
                  <span className={cx('absolute inset-0.75 bg-card-background', HEX)} />
                  <span className={cx('absolute top-1/2 h-2/5 w-4.5 -translate-y-1/2 bg-background', HOLE, half === 'a' ? 'left-1.5' : 'right-1.5')} />
                </span>
              ))}
              {/* La capa del estado, ya dibujada: se enciende con `opacity` (una por estado, así cada cambio la vuelve a encender). */}
              {ring ? (
                <span key={link.state} aria-hidden="true" className={cx('absolute -inset-0.75', HEX, ring, splits ? 'animate-split-fade motion-reduce:animate-none' : 'animate-glow-in motion-reduce:animate-none')}>
                  <span className={cx('absolute inset-1 bg-card-background', HEX)} />
                </span>
              ) : null}
              <button
                type="button"
                aria-label={t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: n, card: link.name, state: stateLabel(link) })}
                className={cx('absolute inset-0 z-1 flex items-center gap-1 pl-4 pr-3 text-left focus-visible:outline-none focus-visible:shadow-focus', splits && 'animate-split-fade motion-reduce:animate-none')}
                onClick={(event) => onPick(rows.indexOf(link), event.currentTarget.getBoundingClientRect())}
              >
                <span className={cx('shrink-0 px-0.5 text-micro font-extrabold tabular-nums text-white', color.bubble)}>{`CL${n}`}</span>
                {shown.length < LINKS_SHOWN ? (
                  <span className="relative block aspect-[421/614] h-4/5 max-h-10 shrink-0 overflow-hidden bg-input">
                    <CardArt remoteUrl={link.art} name={link.name} className={cx('block h-full w-full object-cover', voided && VOIDED_ART)} />
                  </span>
                ) : null}
                <span className="grid min-w-0 leading-tight">
                  <span className={cx('truncate text-micro font-semibold text-foreground', link.state === 'negated' && 'line-through')}>{link.name}</span>
                  <span className={cx('truncate text-micro', solving ? 'text-info' : link.state === 'solved' ? 'text-success-soft' : voided ? 'text-danger-soft' : 'text-muted')}>{fresh ? t('auto.chain.fresh') : stateLabel(link)}</span>
                </span>
              </button>
              {link.state === 'negated' ? (
                <span aria-hidden="true" className={cx('pointer-events-none absolute inset-x-2 top-1/2 z-2 h-1 bg-danger-soft [transform:rotate(-18deg)]', splits ? 'animate-split-fade motion-reduce:animate-none' : 'animate-slash-in motion-reduce:animate-none')} />
              ) : null}
            </span>
          </li>
        )
      })}
      {more > 0 ? <li aria-hidden="true" className="shrink-0 pr-3.5 text-micro font-extrabold tabular-nums text-muted">{`+${more}`}</li> : null}
    </ol>
  )
}