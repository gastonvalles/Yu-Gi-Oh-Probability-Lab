import { useEffect, useId, type ReactNode } from 'react'

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

/** Las vidas con que terminó el duelo, «3100 a 0»: el número que decide, el más grande del cartel. */
export interface ResultScore {
  mine: number
  theirs: number
  /** Cómo se llama el rival (la etiqueta de su número). */
  rival: string
}

type ResultTone = 'win' | 'lose' | 'draw'

/** El color del resultado, lo único que resalta del cartel: lima si ganaste, rojo si perdiste, lavanda si empataron (los de la placa, `DuelMedal`). */
const RESULT_TEXT: Record<ResultTone, string> = { win: 'text-info', lose: 'text-danger-soft', draw: 'text-accent' }
const RESULT_BAND: Record<ResultTone, string> = { win: 'via-info/20', lose: 'via-danger/20', draw: 'via-accent/20' }
const RESULT_WORD = { win: 'duel.result.word.win', lose: 'duel.result.word.lose', draw: 'duel.result.word.draw' } as const

interface ResultHeroProps {
  tone: ResultTone
  /** Cómo terminó, para el lector de pantalla (el nombre del cartel): a la vista lo dice la palabra («Victoria»). */
  title: string
  /** Por qué, la cabeza de la hoja. */
  reason: string
  note?: string | null
  score?: ResultScore
  /** `alertdialog` en el automático solo (nadie más decide), `dialog` en un duelo con otro. */
  role?: 'dialog' | 'alertdialog'
  /** La ✕ de salir, dentro de la hoja (nunca encima de la barra). */
  onLeave?: () => void
  /** Las secundarias, una debajo de la otra y del mismo ancho (`Button` `secondary` `fullWidth`). */
  actions?: ReactNode
  /** La principal, abajo de todo, grande y de lado a lado (`primary` `lg` `fullWidth`): al alcance del pulgar. */
  primary?: ReactNode
  /** Fuera de la mesa (quien mira): tapa la pantalla (`fixed`); si no, la columna de la mesa (la portada de `PracticeMat`). */
  fixed?: boolean
}

/**
 * El final del duelo (Gastón, 2026-11-12: «mejorar la pantalla de victoria»; referencia: el VICTORY de Master Duel): sobre la mesa con un velo, la palabra del resultado enorme
 * cruzando el campo («Victoria», «Derrota», «Empate»: itálica, en el color del resultado, con contorno y resplandor blancos, quietos; entra creciendo, sólo `scale`/`opacity`), y
 * abajo (en escritorio, al centro de la columna de la mesa, debajo de la palabra) una hoja opaca que no la repite: el porqué, las vidas finales en grande («3100 a 0»: el número
 * que decide), las secundarias del mismo ancho y la principal, grande, abajo de todo. Recta (`mat-square`); la hoja entra subiendo (sólo `transform`) y el velo aparece
 * (`opacity`). El nombre del cartel es `title` («¡Ganaste!»). Lo usan los jugadores (con sus botones y sus vidas) y quienes miran (sin ellos).
 */
export function ResultHero({ tone, title, reason, note, score, role = 'dialog', onLeave, actions, primary, fixed = false }: ResultHeroProps) {
  const titleId = useId()

  return (
    <div role={role} aria-modal="true" aria-labelledby={titleId} data-testid="result-hero" data-tone={tone} className={cx('mat-square inset-0 z-65 flex flex-col justify-end min-[1101px]:justify-center', fixed ? 'fixed' : 'absolute')}>
      <span aria-hidden="true" className="absolute inset-0 animate-nav-scrim bg-background/75 motion-reduce:animate-none" />
      <h2 id={titleId} className="sr-only">
        {title}
      </h2>
      {/* La palabra, en el lugar que deja la hoja (en escritorio, pegada arriba de ella): una franja tenue del color del resultado la cruza de lado a lado. Su tamaño, por el ancho que tiene («Victoria» entra en un renglón desde 360 px). */}
      <div aria-hidden="true" data-result-word={tone} className="@container relative grid min-h-0 flex-1 place-items-center overflow-hidden py-4 min-[1101px]:flex-none min-[1101px]:py-6">
        <span className={cx('absolute inset-x-0 top-1/2 h-1/2 max-h-32 -translate-y-1/2 bg-linear-to-r from-transparent to-transparent', RESULT_BAND[tone])} />
        <p
          className={cx(
            'relative m-0 whitespace-nowrap px-4 text-display font-extrabold uppercase italic leading-none tracking-tight [paint-order:stroke_fill] [-webkit-text-stroke:0.1875rem_var(--color-foreground)] text-shadow-[0_0_1.5rem_rgb(255_255_255/0.45)] @min-[23rem]:text-hit @min-[30rem]:text-hit-lg',
            'transition-[scale,opacity] duration-300 ease-snap starting:scale-150 starting:opacity-0 motion-reduce:transition-none',
            RESULT_TEXT[tone],
          )}
        >
          {t(RESULT_WORD[tone])}
        </p>
      </div>
      <section className="relative grid w-full animate-sheet-up gap-4 border-t border-border bg-card-background px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] motion-reduce:animate-none min-[1101px]:mx-auto min-[1101px]:max-w-md min-[1101px]:animate-sheet-in min-[1101px]:border min-[1101px]:p-6">
        <div className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 gap-1 pt-1">
            <p role="status" className="m-0 text-balance text-lead font-bold text-foreground">
              {reason}
            </p>
            {note ? <p className="m-0 text-micro text-muted">{note}</p> : null}
          </div>
          {onLeave ? <CloseButton size="md" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} className="-mr-2 shrink-0" onClick={onLeave} /> : null}
        </div>
        {score ? (
          // Los espacios sueltos no se dibujan entre las piezas de un flex o una grilla, pero hacen que se lea «Vos 3100 a Rival 0».
          <p data-score="" className="m-0 flex min-w-0 items-end gap-3 font-extrabold tabular-nums">
            <span className="grid">
              <span className="text-micro font-bold text-muted">{t('duel.bar.you')}</span>{' '}
              <span className="text-display leading-none text-foreground">{score.mine}</span>
            </span>{' '}
            <span className="pb-1 text-lead font-bold text-muted">{t('duel.result.scoreTo')}</span>{' '}
            <span className="grid min-w-0">
              <span className="truncate text-micro font-bold text-muted">{score.rival}</span>{' '}
              <span className="text-display leading-none text-foreground">{score.theirs}</span>
            </span>
          </p>
        ) : null}
        {actions || primary ? (
          <div className="grid gap-2">
            {actions}
            {primary}
          </div>
        ) : null}
      </section>
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
                <Button variant="secondary" size="lg" fullWidth onClick={onLeave}>
                  {t('duel.watch.end.backNow')}
                </Button>
              ),
            }
          : {})}
      />
    </div>
  )
}
