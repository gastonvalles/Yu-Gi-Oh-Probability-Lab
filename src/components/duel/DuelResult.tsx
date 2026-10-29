import { useId } from 'react'

import type { DuelResult } from '../../app/duel-games'
import type { DuelSnapshot } from '../../app/duel-session'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { CloseButton } from '../ui/IconButton'
import { ResultHero } from './DuelBanner'
import { medalVars } from './DuelMedal'

type Tone = 'win' | 'lose' | 'draw'

interface ResultView {
  tone: Tone
  icon: IconName
  /** Cómo te fue, en una palabra. */
  title: string
  /** Por qué terminó. */
  reason: string
  /** Lo de la revancha, si ya se pidió. */
  note: string | null
}

/** Lo que dice el botón de seguir: la revancha, o en un Match el siguiente duelo (o la revancha del Match si ya lo ganó alguien). */
export function rematchLabel(snapshot: DuelSnapshot): string {
  const { series } = snapshot

  return !series.match ? t('duel.result.rematch') : series.winner !== null ? t('duel.result.rematchMatch') : t('duel.result.nextGame')
}

/** Cómo terminó el duelo contado para quien lo mira, y en un Match cómo va (o cómo terminó) el Match. `reason` reemplaza el porqué que se deduce (el duelo automático: lo dice el núcleo). */
function viewOf(result: DuelResult, snapshot: DuelSnapshot, rival: string, reason?: string): ResultView {
  const counted = gameViewOf(result, snapshot, rival)
  const view = reason === undefined ? counted : { ...counted, reason }
  const { series, me } = snapshot

  if (!series.match) {
    return view
  }

  const score = t('duel.result.matchScore', { mine: series.wins[me], theirs: series.wins[me === 0 ? 1 : 0] })

  if (series.winner === null) {
    return { ...view, reason: `${view.reason} ${score}` }
  }

  return series.winner === me
    ? { tone: 'win', icon: 'trophy', title: t('duel.result.matchWin'), reason: `${view.reason} ${score}`, note: view.note }
    : { tone: 'lose', icon: 'trophy', title: t('duel.result.matchLose'), reason: `${view.reason} ${score}`, note: view.note }
}

/** Cómo terminó el duelo contado para quien lo mira: ganó, perdió o empató, y por qué (puntos de vida o rendición). */
function gameViewOf(result: DuelResult, snapshot: DuelSnapshot, rival: string): ResultView {
  const { me, conceded, rematch, timeUp } = snapshot
  const note = rematch.mine ? t('duel.result.rematchWaiting', { name: rival }) : rematch.theirs ? t('duel.result.rematchOffered', { name: rival }) : null

  if (result.kind === 'draw') {
    return { tone: 'draw', icon: 'swap', title: t('duel.result.title.draw'), reason: t('duel.result.reason.draw'), note }
  }

  if (result.loser !== me) {
    return { tone: 'win', icon: 'trophy', title: t('duel.result.title.win'), reason: conceded !== null ? t(timeUp ? 'duel.result.reason.winTime' : 'duel.result.reason.winConceded', { name: rival }) : t('duel.result.reason.winLife', { name: rival }), note }
  }

  return conceded === me
    ? { tone: 'lose', icon: timeUp ? 'timer' : 'flag', title: t('duel.result.title.lose'), reason: t(timeUp ? 'duel.result.reason.loseTime' : 'duel.result.reason.loseConceded'), note }
    : { tone: 'lose', icon: 'heart', title: t('duel.result.title.lose'), reason: t('duel.result.reason.loseLife'), note }
}

/** El color de cada resultado: verde si ganaste, rojo si perdiste, neutro si empataron. */
const TONE: Record<Tone, { text: string; card: string; badge: string }> = {
  win: { text: 'text-success-soft', card: 'border-success/45 bg-success/10', badge: 'bg-success/20 text-success-soft' },
  lose: { text: 'text-danger-soft', card: 'border-danger/45 bg-danger/10', badge: 'bg-danger/20 text-danger-soft' },
  draw: { text: 'text-info-soft', card: 'border-info/45 bg-info/10', badge: 'bg-info/20 text-info-soft' },
}

interface ResultProps {
  result: DuelResult
  snapshot: DuelSnapshot
  rival: string
  onRematch: () => void
  /** Por qué terminó, si no es por las vidas ni por rendirse (el duelo automático: sin cartas para robar, el efecto de una carta). */
  reason?: string
}

/**
 * El final del duelo, al centro de la mesa: la medalla en 3D (ganar o perder pesa más que cualquier otro cartel), cómo te fue en grande, por qué y qué sigue
 * (revancha, salir o mirar cómo quedó la mesa). Quien ya pidió la revancha ve que espera a su rival; si el rival la pidió, "Revancha" la acepta.
 */
export function ResultCard({ result, snapshot, rival, onRematch, onLeave, onClose, onSaveReplay, reason }: ResultProps & { onLeave: () => void; onClose: () => void; /** «Guardar replay» (el duelo automático). */ onSaveReplay?: () => void }) {
  const view = viewOf(result, snapshot, rival, reason)
  const titleId = useId()

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative grid h-full place-items-center overflow-hidden bg-background/85 p-5" style={medalVars(view.tone)}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 animate-banner-rise bg-[radial-gradient(circle_at_50%_36%,rgb(var(--medal-rgb)/0.3),transparent_62%)] motion-reduce:animate-none" style={{ animationDelay: '0ms' }} />
      <CloseButton size="sm" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} className="absolute right-2 top-2" onClick={onLeave} />
      <ResultHero tone={view.tone} icon={view.icon} title={view.title} reason={view.reason} note={view.note} titleId={titleId}>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Button variant="tertiary" onClick={onClose}>
            {t('duel.result.viewTable')}
          </Button>
          {onSaveReplay ? (
            <Button variant="secondary" icon="save" aria-haspopup="dialog" onClick={onSaveReplay}>
              {t('meta.duels.save.button')}
            </Button>
          ) : null}
          {snapshot.rematch.mine ? null : (
            <Button variant="primary" disabled={!snapshot.peerPresent} onClick={onRematch}>
              {rematchLabel(snapshot)}
            </Button>
          )}
        </div>
      </ResultHero>
    </div>
  )
}

/** Con la tarjeta cerrada, el resultado queda arriba en una línea: cómo te fue, por qué y la revancha a mano. En un lateral del campo (`rail`) se apila: el texto completo y la revancha debajo. */
export function ResultStrip({ result, snapshot, rival, onRematch, rail = false, reason }: ResultProps & { rail?: boolean }) {
  const view = viewOf(result, snapshot, rival, reason)
  const tone = TONE[view.tone]

  return (
    // En escritorio es una pastilla de una línea dentro de la barra (no una franja que le saca el lugar a las vidas); en el celular, una fila propia.
    <div className={cx('flex gap-2 rounded-card border px-2.5', rail ? 'flex-col py-2' : 'items-center py-1 min-[1101px]:max-w-[28rem]', tone.card)}>
      <span className={cx('grid size-6 shrink-0 place-items-center rounded-full', tone.badge)}>
        <Icon name={view.icon} size={14} />
      </span>
      <p className={cx('m-0 min-w-0 flex-1 text-body leading-tight', !rail && 'min-[1101px]:truncate')} title={`${view.title} ${view.reason}${view.note ? ` ${view.note}` : ''}`}>
        <strong className={cx('font-extrabold', tone.text)}>{view.title}</strong>
        <span role="status" className="text-muted">{` ${view.reason}`}</span>
        {view.note ? <span className={cx('block text-micro text-soft', !rail && 'min-[1101px]:hidden')}>{view.note}</span> : null}
      </p>
      {snapshot.rematch.mine ? null : (
        <Button variant="primary" size="sm" fullWidth={rail} disabled={!snapshot.peerPresent} onClick={onRematch}>
          {rematchLabel(snapshot)}
        </Button>
      )}
    </div>
  )
}
