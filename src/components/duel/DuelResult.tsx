import { useId } from 'react'

import type { DuelResult } from '../../app/duel-games'
import type { DuelSnapshot } from '../../app/duel-session'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'

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

/** Cómo terminó el duelo contado para quien lo mira: ganó, perdió o empató, y por qué (puntos de vida o rendición). */
function viewOf(result: DuelResult, snapshot: DuelSnapshot, rival: string): ResultView {
  const { me, conceded, rematch } = snapshot
  const note = rematch.mine ? t('duel.result.rematchWaiting', { name: rival }) : rematch.theirs ? t('duel.result.rematchOffered', { name: rival }) : null

  if (result.kind === 'draw') {
    return { tone: 'draw', icon: 'swap', title: t('duel.result.title.draw'), reason: t('duel.result.reason.draw'), note }
  }

  if (result.loser !== me) {
    return { tone: 'win', icon: 'trophy', title: t('duel.result.title.win'), reason: conceded !== null ? t('duel.result.reason.winConceded', { name: rival }) : t('duel.result.reason.winLife', { name: rival }), note }
  }

  return conceded === me
    ? { tone: 'lose', icon: 'flag', title: t('duel.result.title.lose'), reason: t('duel.result.reason.loseConceded'), note }
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
}

/**
 * El final del duelo, al centro de la mesa: cómo te fue en grande, por qué y qué sigue (revancha, salir o mirar cómo quedó la mesa).
 * Quien ya pidió la revancha ve que espera a su rival; si el rival la pidió, "Revancha" la acepta.
 */
export function ResultCard({ result, snapshot, rival, onRematch, onLeave, onClose }: ResultProps & { onLeave: () => void; onClose: () => void }) {
  const view = viewOf(result, snapshot, rival)
  const tone = TONE[view.tone]
  const titleId = useId()

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="grid h-full place-items-center bg-background/80 p-5 backdrop-blur-sm">
      <div className={cx('grid w-full max-w-xs animate-sheet-in justify-items-center gap-3 rounded-card border px-5 py-6 text-center shadow-[0_18px_48px_rgba(0,0,0,0.45)] motion-reduce:animate-none', tone.card)}>
        <span className={cx('grid size-14 place-items-center rounded-full', tone.badge)}>
          <Icon name={view.icon} size={28} />
        </span>
        <h2 id={titleId} className={cx('m-0 text-stat font-extrabold', tone.text)}>
          {view.title}
        </h2>
        <p role="status" className="m-0 text-body text-foreground">
          {view.reason}
        </p>
        {view.note ? <p className="m-0 text-micro text-muted">{view.note}</p> : null}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Button variant="tertiary" onClick={onClose}>
            {t('duel.result.viewTable')}
          </Button>
          <Button variant="tertiary" onClick={onLeave}>
            {t('duel.bar.leave')}
          </Button>
          {snapshot.rematch.mine ? null : (
            <Button variant="primary" disabled={!snapshot.peerPresent} onClick={onRematch}>
              {t('duel.result.rematch')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Con la tarjeta cerrada, el resultado queda arriba en una línea: cómo te fue, por qué y la revancha a mano. */
export function ResultStrip({ result, snapshot, rival, onRematch }: ResultProps) {
  const view = viewOf(result, snapshot, rival)
  const tone = TONE[view.tone]

  return (
    <div className={cx('flex items-center gap-2 rounded-card border px-2.5 py-1.5', tone.card)}>
      <span className={cx('grid size-7 shrink-0 place-items-center rounded-full', tone.badge)}>
        <Icon name={view.icon} size={16} />
      </span>
      <p className="m-0 min-w-0 flex-1 text-body">
        <strong className={cx('font-extrabold', tone.text)}>{view.title}</strong>
        <span role="status" className="text-muted">{` ${view.reason}`}</span>
        {view.note ? <span className="block text-micro text-soft">{view.note}</span> : null}
      </p>
      {snapshot.rematch.mine ? null : (
        <Button variant="primary" size="sm" disabled={!snapshot.peerPresent} onClick={onRematch}>
          {t('duel.result.rematch')}
        </Button>
      )}
    </div>
  )
}
