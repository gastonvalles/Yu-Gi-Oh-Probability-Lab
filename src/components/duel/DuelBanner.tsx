import { useEffect, type ReactNode } from 'react'

import type { SpectatorEnd } from '../../app/duel-spectator'
import type { Duelist } from '../../app/life-calculator'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import type { IconName } from '../ui/Icon'
import { Confetti, DuelMedal, medalVars, type MedalTone } from './DuelMedal'

/** Cuánto dura el cartel de inicio en pantalla: lo justo para leerlo; no tapa la mesa (no recibe toques) ni espera a nadie. */
export const TURN_BANNER_MS = 2800

const TURN_TITLE = 'text-balance text-stat font-extrabold uppercase tracking-[0.12em]'

/**
 * El cartel del comienzo del duelo, en el medio de la pantalla y para los dos: una medalla 3D con el 1 o el 2 entra de costado, y debajo dice si vas primero
 * o segundo y qué sigue. Se va solo a los pocos segundos. Es del mismo lenguaje que el cartel del final (`ResultHero`), pero más chico: ganar o perder pesa más.
 */
export function TurnOrderBanner({ first, rival, onDone }: { first: boolean; rival: string; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, TURN_BANNER_MS)

    return () => window.clearTimeout(id)
  }, [onDone])

  const tone: MedalTone = first ? 'first' : 'second'

  return (
    <div aria-live="polite" data-testid="turn-banner" data-turn={first ? 'first' : 'second'} className="pointer-events-none fixed inset-0 z-65 grid place-items-center">
      <span aria-hidden="true" className="absolute inset-0 animate-banner-veil bg-[radial-gradient(circle_at_50%_45%,rgb(var(--background-rgb)/0.9),rgb(var(--background-rgb)/0.6)_55%,transparent_85%)] motion-reduce:animate-none" />
      <div className="relative grid justify-items-center gap-3 px-6 text-center" style={medalVars(tone)}>
        <DuelMedal tone={tone} numeral={first ? '1' : '2'} size="md" />
        <h2 className={cx('m-0 animate-banner-rise motion-reduce:animate-none [text-shadow:0_0_26px_rgb(var(--medal-rgb)/0.75)]', TURN_TITLE, first ? 'text-success-soft' : 'text-accent')}>{first ? t('duel.turnOrder.first') : t('duel.turnOrder.second')}</h2>
        <p className="m-0 animate-banner-rise text-body text-muted motion-reduce:animate-none">{first ? t('duel.turnOrder.firstHint') : t('duel.turnOrder.secondHint', { name: rival })}</p>
      </div>
    </div>
  )
}

const TITLE_COLOR: Record<'win' | 'lose' | 'draw', string> = { win: 'text-info-soft', lose: 'text-danger-soft', draw: 'text-accent' }
/** Cuánto tarda en salir el título: después de que la medalla aterriza (la que gana tarda más en llegar; la que pierde, hasta que pega). */
const TITLE_DELAY: Record<'win' | 'lose' | 'draw', string> = { win: '1000ms', lose: '700ms', draw: '600ms' }

interface ResultHeroProps {
  tone: 'win' | 'lose' | 'draw'
  icon: IconName
  /** Cómo terminó, en grande. */
  title: string
  /** Por qué. */
  reason: string
  note?: string | null
  titleId?: string
  /** Lo que se puede hacer ahora (botones), debajo. */
  children?: ReactNode
}

/**
 * El cartel del final del duelo: la medalla en 3D (ámbar con rayos y confeti si ganaste, roja que cae y se agrieta si perdiste, lavanda si empataron), el título en
 * grande sobre una banda del color del resultado, por qué terminó y qué sigue. Lo usan los jugadores (con sus botones) y quienes miran (sin ellos).
 */
export function ResultHero({ tone, icon, title, reason, note, titleId, children }: ResultHeroProps) {
  return (
    <div data-testid="result-hero" data-tone={tone} className="relative grid w-full max-w-sm justify-items-center gap-3 px-5 text-center" style={medalVars(tone)}>
      <div className="relative mb-2 mt-2">
        <DuelMedal tone={tone} icon={icon} />
        {tone === 'win' ? <Confetti /> : null}
      </div>
      <div className="relative grid w-full justify-items-center gap-1.5 py-3">
        <span aria-hidden="true" className="absolute -inset-x-5 inset-y-0 animate-banner-rise bg-[linear-gradient(90deg,transparent,rgb(var(--medal-rgb)/0.24)_18%,rgb(var(--medal-rgb)/0.24)_82%,transparent)] motion-reduce:animate-none" style={{ animationDelay: TITLE_DELAY[tone] }} />
        <h2 id={titleId} className={cx('relative m-0 animate-banner-rise motion-reduce:animate-none [text-shadow:0_0_26px_rgb(var(--medal-rgb)/0.8)]', TURN_TITLE, TITLE_COLOR[tone])} style={{ animationDelay: TITLE_DELAY[tone] }}>
          {title}
        </h2>
        <p role="status" className="relative m-0 animate-banner-rise text-body text-foreground motion-reduce:animate-none" style={{ animationDelay: TITLE_DELAY[tone] }}>
          {reason}
        </p>
        {note ? <p className="relative m-0 text-micro text-muted">{note}</p> : null}
      </div>
      {children}
    </div>
  )
}

/** Cuánto se ve el cartel del final antes de volver al inicio (y, en un Match que sigue, antes de seguir mirando). */
export const WATCH_RETURN_MS = 8000
export const WATCH_NEXT_MS = 5000

/**
 * El final de lo que se mira, para un espectador: la medalla (ámbar para el ganador, lavanda si empataron) con quién ganó y por qué. Cuando se terminó todo (un duelo suelto, o el
 * Match) vuelve solo al inicio a los pocos segundos (o ya, con el botón); si es un duelo de un Match que sigue, el cartel se va y se sigue mirando.
 */
export function WatchResultBanner({ end, nameOf, onLeave, onClose }: { end: SpectatorEnd; nameOf: (player: Duelist) => string; onLeave: () => void; onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(end.over ? onLeave : onClose, end.over ? WATCH_RETURN_MS : WATCH_NEXT_MS)

    return () => window.clearTimeout(id)
  }, [end.over, onLeave, onClose])

  const winner = end.matchWinner ?? end.winner
  const title = winner === null ? t('duel.watch.end.draw') : end.matchWinner !== null ? t('duel.watch.end.matchWinner', { name: nameOf(winner) }) : t('duel.watch.end.winner', { name: nameOf(winner) })
  const why = end.loser === null ? t('duel.watch.end.drawReason') : end.reason === 'conceded' ? t('duel.watch.end.conceded', { name: nameOf(end.loser) }) : t('duel.watch.end.life', { name: nameOf(end.loser) })
  const score = end.match ? ` ${t('duel.watch.end.score', { a: end.wins[0], b: end.wins[1] })}${end.over ? '' : ` ${t('duel.watch.end.next')}`}` : ''

  return (
    <div role="dialog" aria-modal="true" aria-label={title} data-testid="watch-result" className="fixed inset-0 z-65 grid place-items-center overflow-hidden bg-background/85 p-5 backdrop-blur-sm" style={medalVars(winner === null ? 'draw' : 'win')}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgb(var(--medal-rgb)/0.3),transparent_62%)]" />
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
