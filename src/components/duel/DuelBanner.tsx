import { Children, Fragment, isValidElement, useEffect, useId, type ReactNode } from 'react'

import type { SpectatorEnd } from '../../app/duel-spectator'
import type { Duelist } from '../../app/life-calculator'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { CloseButton } from '../ui/IconButton'
import { DuelMedal, type MedalTone } from './DuelMedal'

/** Cuánto dura el cartel de inicio en pantalla: lo justo para leerlo; no tapa la mesa (no recibe toques) ni espera a nadie. */
export const TURN_BANNER_MS = 2800

/**
 * El cartel del comienzo del duelo, en el medio de la pantalla y para los dos: una placa cuadrada con el 1 (violeta) o el 2 (lavanda) y, debajo, en una caja
 * con el borde del mismo color, si vas primero o segundo y qué sigue. Se va solo a los pocos segundos. Plano: sin degradados ni brillos.
 */
export function TurnOrderBanner({ first, rival, onDone }: { first: boolean; rival: string; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, TURN_BANNER_MS)

    return () => window.clearTimeout(id)
  }, [onDone])

  const tone: MedalTone = first ? 'first' : 'second'

  return (
    <div aria-live="polite" data-testid="turn-banner" data-turn={first ? 'first' : 'second'} className="pointer-events-none fixed inset-0 z-65 grid place-items-center">
      <span aria-hidden="true" className="absolute inset-0 animate-banner-veil bg-background/80 motion-reduce:animate-none" />
      <div className="relative grid justify-items-center gap-4 px-6 text-center">
        <DuelMedal tone={tone} numeral={first ? '1' : '2'} size="md" className="mt-2" />
        <h2 className={cx('m-0 animate-banner-rise border-2 bg-background px-4 py-1.5 text-balance text-lead font-extrabold text-foreground motion-reduce:animate-none', first ? 'border-primary' : 'border-accent')}>
          {first ? t('duel.turnOrder.first') : t('duel.turnOrder.second')}
        </h2>
        <p className="m-0 animate-banner-rise text-body text-muted motion-reduce:animate-none">{first ? t('duel.turnOrder.firstHint') : t('duel.turnOrder.secondHint', { name: rival })}</p>
      </div>
    </div>
  )
}

type ResultTone = 'win' | 'lose' | 'draw'

/** El color del resultado, lo único que resalta del cartel: lima si ganaste, rojo si perdiste, lavanda si empataron (los de la placa, `DuelMedal`). */
const RESULT_TEXT: Record<ResultTone, string> = { win: 'text-info', lose: 'text-danger-soft', draw: 'text-accent' }
const RESULT_WORD = { win: 'duel.result.word.win', lose: 'duel.result.word.lose', draw: 'duel.result.word.draw' } as const

interface ResultHeroProps {
  tone: ResultTone
  /** Cómo terminó, para el lector de pantalla (el nombre del cartel): a la vista lo dice la palabra («Victoria»). */
  title: string
  /** Por qué, en una línea debajo de la palabra. */
  reason: string
  note?: string | null
  /** `alertdialog` en el automático solo (nadie más decide), `dialog` en un duelo con otro. */
  role?: 'dialog' | 'alertdialog'
  /** La ✕ de salir del duelo. */
  onLeave?: () => void
  /** En vez de salir, la ✕ esconde el cartel y deja el campo solo («Ver el campo»; quien lo monta ofrece cómo volver a abrirlo). */
  onHide?: () => void
  /** Las secundarias: botones chicos (`Button` `sm` `fullWidth`, ícono y una o dos palabras), en la misma grilla que la principal. */
  actions?: ReactNode
  /** La principal, la última de la grilla (`primary` `sm` `fullWidth`). */
  primary?: ReactNode
  /** Fuera de la mesa (quien mira): tapa la pantalla (`fixed`); si no, la columna de la mesa (la portada de `PracticeMat`). */
  fixed?: boolean
}

/**
 * El final del duelo (Gastón, 2026-11-12: «debo poder ver el campo, todo debe estar centrado al medio, mostrar la vida no es necesario»; referencia: el VICTORY de Master Duel): un solo
 * bloque al medio del campo, sin velo ni hoja: el campo se ve entero arriba y abajo (detrás del bloque, sólo una franja oscura para leerlo). La palabra del resultado enorme («Victoria»,
 * «Derrota», «Empate»: itálica, en el color del resultado, con contorno y resplandor blancos, quietos; entra creciendo, sólo `scale`/`opacity`), el porqué debajo y las acciones en botones
 * chicos iguales: dos por fila en lo angosto y todos en una desde 36 rem (si son impares, en lo angosto la última va de lado a lado). Sin vidas: las dicen las chapas de la mesa. Recto
 * (`mat-square`). El nombre del cartel es `title` («¡Ganaste!»). Lo usan los jugadores (con sus botones) y quienes miran.
 */
export function ResultHero({ tone, title, reason, note, role = 'dialog', onLeave, onHide, actions, primary, fixed = false }: ResultHeroProps) {
  const titleId = useId()
  // Cada botón en su celda (un fragmento de secundarias se abre).
  const buttons = Children.toArray([actions, primary]).flatMap((node) => (isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment ? Children.toArray(node.props.children) : [node]))
  const close = onHide ?? onLeave
  const closeLabel = onHide ? t('duel.result.hide') : t('duel.bar.leave')

  return (
    <div role={role} aria-modal="true" aria-labelledby={titleId} data-testid="result-hero" data-tone={tone} className={cx('mat-square inset-0 z-65 grid place-items-center', fixed ? 'fixed' : 'absolute')}>
      <h2 id={titleId} className="sr-only">
        {title}
      </h2>
      <section data-result-block="" className="@container relative grid w-full justify-items-center gap-2 p-4">
        {/* La franja que deja leer el bloque: de lado a lado, oscura al medio y transparente en los bordes; aparece (`opacity`). */}
        <span aria-hidden="true" className="absolute inset-0 animate-nav-scrim bg-linear-to-r from-transparent via-background/85 to-transparent motion-reduce:animate-none" />
        {/* La palabra: su tamaño, por el ancho que tiene («Victoria» entra en un renglón desde 360 px). */}
        <div aria-hidden="true" data-result-word={tone} className="@container relative grid w-full place-items-center">
          <p
            className={cx(
              'm-0 whitespace-nowrap text-display font-extrabold uppercase italic leading-none tracking-tight [paint-order:stroke_fill] [-webkit-text-stroke:0.1875rem_var(--color-foreground)] text-shadow-[0_0_1.5rem_rgb(255_255_255/0.45)] @min-[21rem]:text-hit @min-[28rem]:text-hit-lg',
              'transition-[scale,opacity] duration-300 ease-snap starting:scale-150 starting:opacity-0 motion-reduce:transition-none',
              RESULT_TEXT[tone],
            )}
          >
            {t(RESULT_WORD[tone])}
          </p>
        </div>
        {/* El porqué, y la ✕ a su altura en el borde (no pisa la palabra). */}
        <div className="relative grid w-full justify-items-center gap-0.5 px-12 text-center transition-[opacity,translate] delay-200 duration-300 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none">
          <p role="status" className="m-0 max-w-md text-balance text-body font-semibold text-foreground">
            {reason}
          </p>
          {note ? <p className="m-0 text-micro text-muted">{note}</p> : null}
          {close ? <CloseButton size="md" aria-label={closeLabel} title={closeLabel} className="absolute -right-2 top-1/2 -translate-y-1/2" onClick={close} /> : null}
        </div>
        {buttons.length > 0 ? (
          <div className="relative mt-1 grid w-full max-w-md grid-cols-2 gap-2 transition-[opacity,translate] delay-300 duration-300 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none @min-[36rem]:max-w-2xl @min-[36rem]:auto-cols-fr @min-[36rem]:grid-flow-col @min-[36rem]:grid-cols-none">
            {buttons.map((button, at) => (
              <div key={at} className={cx('grid', buttons.length % 2 === 1 && at === buttons.length - 1 && 'col-span-2 @min-[36rem]:col-span-1')}>
                {button}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}

/** Con el final escondido (su ✕), el campo queda solo y al medio, chico, «Ver el resultado» lo vuelve a abrir. */
export function ResultPeek({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-65 grid place-items-center">
      <span className="pointer-events-auto">
        <Button variant="secondary" size="sm" icon="trophy" onClick={onOpen}>
          {t('duel.result.show')}
        </Button>
      </span>
    </div>
  )
}

/** Cuánto se ve el cartel del final antes de volver al inicio (y, en un Match que sigue, antes de seguir mirando). */
export const WATCH_RETURN_MS = 8000
export const WATCH_NEXT_MS = 5000

/**
 * El final de lo que se mira, para un espectador: la placa (lima para el ganador, lavanda si empataron) con quién ganó y por qué. Cuando se terminó todo (un duelo suelto, o el
 * Match) vuelve solo al inicio a los pocos segundos (o ya, con el botón); si es un duelo de un Match que sigue, el cartel se va y se sigue mirando.
 */
export function WatchResultBanner({ end, nameOf, onLeave, onClose }: { end: SpectatorEnd; nameOf: (player: Duelist) => string; onLeave: () => void; onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(end.over ? onLeave : onClose, end.over ? WATCH_RETURN_MS : WATCH_NEXT_MS)

    return () => window.clearTimeout(id)
  }, [end.over, onLeave, onClose])

  const winner = end.matchWinner ?? end.winner
  const title = winner === null ? t('duel.watch.end.draw') : end.matchWinner !== null ? t('duel.watch.end.matchWinner', { name: nameOf(winner) }) : t('duel.watch.end.winner', { name: nameOf(winner) })
  const why = end.loser === null ? t('duel.watch.end.drawReason') : end.reason === 'conceded' ? t('duel.watch.end.conceded', { name: nameOf(end.loser) }) : end.reason === 'time' ? t('duel.watch.end.time', { name: nameOf(end.loser) }) : t('duel.watch.end.life', { name: nameOf(end.loser) })
  const score = end.match ? ` ${t('duel.watch.end.score', { a: end.wins[0], b: end.wins[1] })}${end.over ? '' : ` ${t('duel.watch.end.next')}`}` : ''

  return (
    <div data-testid="watch-result" className="contents">
      <ResultHero
        fixed
        tone={winner === null ? 'draw' : 'win'}
        title={title}
        // La palabra dice «Victoria»: quién ganó, en la línea de abajo.
        reason={`${winner === null ? '' : `${title}. `}${why}${score}`}
        {...(end.over ? { note: t('duel.watch.end.back') } : {})}
        {...(end.over
          ? {
              primary: (
                <Button variant="secondary" size="sm" icon="home" fullWidth onClick={onLeave}>
                  {t('duel.watch.end.backNow')}
                </Button>
              ),
            }
          : {})}
      />
    </div>
  )
}
