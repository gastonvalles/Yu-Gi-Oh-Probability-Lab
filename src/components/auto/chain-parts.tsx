import { useCallback, useLayoutEffect, useRef } from 'react'

import { cancelWhenDone, EASE_IN_OUT, EASE_OUT, EASE_SNAP, prefersReducedMotion } from '../../app/motion'
import type { ChainRowState } from '../../app/auto/chain-feed'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { PLAYER_COLOR } from '../duel/player-color'
import { VOIDED_ART } from '../probability/MatFx'
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
}

export const STATE_TONE: Record<ChainRowState, Tone> = { chained: 'neutral', solving: 'info', solved: 'success', negated: 'danger', disabled: 'warning' }
/** El ícono de cada tono de estado: el chip se lee por el texto (en la cinta, por su nombre accesible); el ícono y el color lo refuerzan, y el color nunca va solo. */
export const CHIP_ICON: Record<Tone, IconName> = { neutral: 'timer', brand: 'link', info: 'play', success: 'check', warning: 'ban', danger: 'x' }
export const stateLabel = ({ state, by }: Pick<ChainNoticeRow, 'state' | 'by'>) => (by ? t('auto.chain.by', { state: t(`auto.chain.state.${state}`), by }) : t(`auto.chain.state.${state}`))
export const colorOf = (mine: boolean) => PLAYER_COLOR[mine ? 'mine' : 'theirs']

const voidedState = (state: ChainRowState) => state === 'negated' || state === 'disabled'

/**
 * El movimiento de la pila, una animación por cambio de estado de un eslabón (comparado por su número con el dibujo anterior): al montarse, una pila ya armada se ve como está, sin entrar. Todo de
 * compositor y corto (Web Animations, `cancelWhenDone`, nada con movimiento reducido): se leen todas las medidas primero y después se anima.
 * - Se suma un eslabón: entra arriba desde arriba (280 ms, `EASE_SNAP`) y los de abajo bajan su lugar (FLIP de `transform`, 280 ms, `EASE_OUT`).
 * - Resuelve: la fila hace un pop (320 ms) y su aro ámbar (una capa ya dibujada) se enciende con `opacity`; la marca de la izquierda viaja desde el que resolvió antes (300 ms, `EASE_IN_OUT`): se
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
 * Las filas de la pila de la cadena, en el orden en que se resuelven (el último eslabón arriba): número en el color de su dueño, arte, nombre, de quién y su estado. Cada una es un botón de 44 px o más con su
 * nombre entero («Eslabón 2: Ash Blossom, del rival. Resolviendo»); el que se resuelve lleva el aro ámbar y la marca de la izquierda; el resuelto, un tilde sobre el arte apagado; el negado o sin efecto, una
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
          {/* El aro ámbar y el velo ya dibujados: se anima su opacidad, nunca la sombra ni el fondo. */}
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
          <Badge data-part="chip" tone={STATE_TONE[link.state]} size="sm" className="shrink-0">
            {stateLabel(link)}
          </Badge>
        </button>
      </li>
    )
  })
}
