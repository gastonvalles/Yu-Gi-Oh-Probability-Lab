import { useState } from 'react'

import { RPS_PICKS, SIGNALS, duelResult, rpsOutcome, type RpsPick, type SignalId } from '../../app/duel-games'
import type { Duel, DuelSnapshot } from '../../app/duel-session'
import { t } from '../../i18n'
import { Coin, Die } from '../life/Toss'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Modal } from '../ui/Modal'
import { overline } from '../ui/typography'
import { gameText, outcomeText, rpsName, signalText, tossResult } from './game-text'

/** Lo que el panel puede hacer: tirar, elegir, decir quién empieza y mandar una señal. */
export type GameActions = Pick<Duel, 'throwCoin' | 'throwDie' | 'pickRps' | 'chooseFirst' | 'signal' | 'concede' | 'rematch'>

interface DuelGamesProps {
  isOpen: boolean
  onClose: () => void
  snapshot: DuelSnapshot
  myName: string
  actions: GameActions
}

/** Cuántas líneas del registro se ven. */
const LOG_LINES = 8

/**
 * Moneda y dado (los dos ven la misma tirada, con la misma animación de la calculadora de LP), piedra-papel-tijera (el rival no ve tu
 * elección hasta que elegís), quién va primero y unas señales rápidas. Con el registro de lo último que pasó.
 */
export function DuelGames({ isOpen, onClose, snapshot, myName, actions }: DuelGamesProps) {
  const { games, rps, me, peerPresent, peerName, starter } = snapshot
  const rival = peerName ?? t('duel.bar.rival')
  const nameOf = (player: 0 | 1) => (player === me ? myName : rival)
  const outcome = rpsOutcome(rps.mine, rps.theirs)
  const toss = [...games].reverse().find((entry) => entry.game.kind === 'coin' || entry.game.kind === 'die')
  const rival01 = me === 0 ? 1 : 0
  const finished = duelResult(snapshot.life.lp, snapshot.conceded) !== null
  const [conceding, setConceding] = useState(false)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" title={t('duel.games.title')} ariaLabel={t('duel.games.title')}>
      <div className="grid gap-5">
        {peerPresent ? null : <Callout tone="warning" icon="alert">{t('duel.games.needRival')}</Callout>}

        <section className="grid gap-2" aria-label={`${t('duel.games.coin')} / ${t('duel.games.die')}`}>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={!peerPresent} onClick={actions.throwCoin}>
              {t('duel.games.coin')}
            </Button>
            <Button variant="secondary" disabled={!peerPresent} onClick={actions.throwDie}>
              {t('duel.games.die')}
            </Button>
          </div>
          <div className="grid min-h-40 place-items-center [perspective:40rem]">
            {toss === undefined ? (
              <p className="m-0 text-body text-muted">{t('duel.games.tossHint')}</p>
            ) : toss.game.kind === 'coin' ? (
              <Coin key={toss.id} face={toss.game.face} />
            ) : toss.game.kind === 'die' ? (
              <Die key={toss.id} value={toss.game.value} />
            ) : null}
          </div>
          <p aria-live="polite" className="m-0 min-h-7 text-center text-title font-bold text-foreground">
            {toss && (toss.game.kind === 'coin' || toss.game.kind === 'die') ? t('duel.games.tossed', { name: nameOf(toss.from), result: tossResult(toss.game) }) : ' '}
          </p>
        </section>

        <section className="grid gap-2 border-t border-border-subtle pt-3" aria-label={t('duel.games.rps.title')}>
          <span className={overline}>{t('duel.games.rps.title')}</span>
          {rps.mine === null ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {RPS_PICKS.map((pick) => (
                  <RpsButton key={pick} pick={pick} disabled={!peerPresent} onPick={actions.pickRps} />
                ))}
              </div>
              <p className="m-0 text-micro text-soft" role="status">
                {rps.theirs !== null ? t('duel.games.rps.rivalPicked', { name: rival }) : t('duel.games.rps.hint')}
              </p>
            </>
          ) : outcome === null ? (
            <p className="m-0 text-body text-foreground" role="status">
              {t('duel.games.rps.waiting', { pick: rpsName(rps.mine), name: rival })}
            </p>
          ) : (
            <div className="grid gap-2" role="status">
              <p className="m-0 text-body text-muted">{t('duel.games.rps.versus', { mine: rpsName(rps.mine), theirs: rpsName(rps.theirs!) })}</p>
              <p className={cx('m-0 text-title font-bold', outcome === 'win' ? 'text-accent' : 'text-foreground')}>{outcomeText(outcome)}</p>
              <Button variant="secondary" size="sm" onClick={() => actions.pickRps(null)}>
                {t('duel.games.rps.again')}
              </Button>
            </div>
          )}
        </section>

        <section className="grid gap-2 border-t border-border-subtle pt-3" aria-label={t('duel.games.order.title')}>
          <span className={overline}>{t('duel.games.order.title')}</span>
          <p className="m-0 text-body text-foreground">{t('duel.games.order.current', { name: nameOf(starter) })}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" disabled={!peerPresent || starter === me} onClick={() => actions.chooseFirst(me)}>
              {t('duel.games.order.me')}
            </Button>
            <Button variant="secondary" size="sm" disabled={!peerPresent || starter === rival01} onClick={() => actions.chooseFirst(rival01)}>
              {t('duel.games.order.them', { name: rival })}
            </Button>
          </div>
        </section>

        <section className="grid gap-2 border-t border-border-subtle pt-3" aria-label={t('duel.games.signal.title')}>
          <span className={overline}>{t('duel.games.signal.title')}</span>
          <div className="flex flex-wrap gap-2">
            {SIGNALS.map((signal) => (
              <SignalButton key={signal} signal={signal} disabled={!peerPresent} onSend={actions.signal} />
            ))}
          </div>
        </section>

        <section className="grid gap-2 border-t border-border-subtle pt-3" aria-label={t('duel.games.end.title')}>
          <span className={overline}>{t('duel.games.end.title')}</span>
          {conceding ? (
            <>
              <p className="m-0 text-body text-foreground">{t('duel.games.concede.confirm', { name: rival })}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="primary"
                  color="danger"
                  size="sm"
                  onClick={() => {
                    setConceding(false)
                    actions.concede()
                    onClose()
                  }}
                >
                  {t('duel.games.concede.yes')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConceding(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="secondary" color="danger" size="sm" disabled={!peerPresent || finished} onClick={() => setConceding(true)}>
              {t('duel.games.concede')}
            </Button>
          )}
        </section>

        <section className="grid gap-1.5 border-t border-border-subtle pt-3" aria-label={t('duel.games.log.title')}>
          <span className={overline}>{t('duel.games.log.title')}</span>
          {games.length === 0 ? (
            <p className="m-0 text-micro text-soft">{t('duel.games.log.empty')}</p>
          ) : (
            <ol className="m-0 grid list-none gap-1 p-0">
              {[...games]
                .slice(-LOG_LINES)
                .reverse()
                .map((entry) => (
                  <li key={entry.id} className="text-micro text-muted">
                    {gameText(entry, nameOf)}
                  </li>
                ))}
            </ol>
          )}
        </section>
      </div>
    </Modal>
  )
}

function RpsButton({ pick, disabled, onPick }: { pick: RpsPick; disabled: boolean; onPick: (pick: RpsPick) => void }) {
  return (
    <Button variant="secondary" disabled={disabled} onClick={() => onPick(pick)}>
      {rpsName(pick)}
    </Button>
  )
}

function SignalButton({ signal, disabled, onSend }: { signal: SignalId; disabled: boolean; onSend: (signal: SignalId) => void }) {
  return (
    <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onSend(signal)}>
      {signalText(signal)}
    </Button>
  )
}
