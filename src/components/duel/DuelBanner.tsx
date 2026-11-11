import { useEffect, type ReactNode } from 'react'

import type { SpectatorEnd } from '../../app/duel-spectator'
import type { Duelist } from '../../app/life-calculator'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import type { IconName } from '../ui/Icon'
import { DuelMedal, type MedalTone } from './DuelMedal'

/** Cuánto dura el cartel de inicio en pantalla: lo justo para leerlo; no tapa la mesa (no recibe toques) ni espera a nadie. */
export const TURN_BANNER_MS = 2800

/**
 * El cartel del comienzo del duelo, en el medio de la pantalla y para los dos: una placa cuadrada con el 1 (violeta) o el 2 (lavanda) y, debajo, en una caja
 * con el borde del mismo color, si vas primero o segundo y qué sigue. Se va solo a los pocos segundos. Es del mismo lenguaje que el cartel del final
 * (`ResultHero`), pero más chico: ganar o perder pesa más. Plano: sin degradados ni brillos.
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

interface ResultHeroProps {
  tone: 'win' | 'lose' | 'draw'
  icon: IconName
  /** Cómo terminó, en la placa. */
  title: string
  /** Por qué. */
  reason: string
  note?: string | null
  titleId?: string
  score?: ResultScore
  /** Lo que se puede hacer ahora (botones), debajo. */
  children?: ReactNode
}

/**
 * El cartel del final del duelo: la placa (lima si ganaste, roja si perdiste, lavanda si empataron) con cómo te fue adentro, por qué terminó, las vidas finales
 * en grande («3100 a 0») y qué sigue. Lo usan los jugadores (con sus botones y sus vidas) y quienes miran (sin ellos).
 */
export function ResultHero({ tone, icon, title, reason, note, titleId, score, children }: ResultHeroProps) {
  return (
    <div data-testid="result-hero" data-tone={tone} className="grid w-full max-w-sm justify-items-center gap-3 px-5 text-center">
      <DuelMedal tone={tone} icon={icon} className="my-3">
        <h2 id={titleId} className="m-0 text-balance text-lead font-extrabold [overflow-wrap:anywhere] min-[1101px]:text-title">
          {title}
        </h2>
      </DuelMedal>
      <p role="status" className="m-0 animate-banner-rise text-body text-muted motion-reduce:animate-none">
        {reason}
      </p>
      {note ? <p className="m-0 text-micro text-muted">{note}</p> : null}
      {score ? (
        // Los espacios sueltos no se dibujan entre las piezas de un flex o una grilla, pero hacen que se lea «Vos 3100 a Rival 0».
        <p data-score="" className="m-0 flex animate-banner-rise items-end justify-center gap-4 font-extrabold tabular-nums motion-reduce:animate-none">
          <span className="grid justify-items-center">
            <span className="text-micro font-bold text-accent">{t('duel.bar.you')}</span>{' '}
            <span className="text-display leading-none text-foreground">{score.mine}</span>
          </span>{' '}
          <span className="pb-1 text-lead font-bold text-muted">{t('duel.result.scoreTo')}</span>{' '}
          <span className="grid min-w-0 justify-items-center">
            <span className="max-w-32 truncate text-micro font-bold text-info">{score.rival}</span>{' '}
            <span className="text-display leading-none text-foreground">{score.theirs}</span>
          </span>
        </p>
      ) : null}
      {children}
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
    <div role="dialog" aria-modal="true" aria-label={title} data-testid="watch-result" className="fixed inset-0 z-65 grid place-items-center overflow-hidden bg-background/90 p-5">
      <ResultHero tone={winner === null ? 'draw' : 'win'} icon={winner === null ? 'swap' : 'trophy'} title={title} reason={`${why}${score}`}>
        {end.over ? (
          <div className="mt-1 grid justify-items-center gap-2">
            <p className="m-0 text-micro text-muted">{t('duel.watch.end.back')}</p>
            <Button variant="secondary" onClick={onLeave}>
              {t('duel.watch.end.backNow')}
            </Button>
          </div>
        ) : null}
      </ResultHero>
    </div>
  )
}
