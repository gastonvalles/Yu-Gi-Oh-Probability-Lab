import { RPS_PICKS, TOSS_METHODS, rpsOutcome } from '../../app/duel-games'
import type { Duel, DuelSnapshot } from '../../app/duel-session'
import type { Duelist } from '../../app/life-calculator'
import { t } from '../../i18n'
import { Coin } from '../life/Toss'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { methodName, outcomeText, rpsName } from './game-text'

/** Lo que la sala puede hacer antes de la mesa: estar listo, elegir con qué definir quién empieza, jugarlo y elegir ir primero o segundo. */
export type OpeningActions = Pick<Duel, 'setReady' | 'chooseMethod' | 'callCoin' | 'throwDie' | 'pickRps' | 'chooseFirst'>

interface DuelOpeningProps {
  snapshot: DuelSnapshot
  myName: string
  /** Se puede estar listo: hay deck para repartir y los ajustes del anfitrión ya llegaron. */
  canReady: boolean
  actions: OpeningActions
}

/**
 * Lo que pasa entre entrar a la sala y la mesa, en orden: los dos tocan "Estoy listo" (y cada uno ve si el otro ya lo hizo); definen con una moneda, un dado
 * o piedra-papel-tijera quién elige ir primero o segundo; y quien gana elige. En una revancha elige quien perdió, sin tirar. Al elegir, cada uno reparte su mano.
 */
export function DuelOpening({ snapshot, myName, canReady, actions }: DuelOpeningProps) {
  const { ready, opening, me, peerName, starter } = snapshot
  const rival = peerName ?? t('duel.bar.rival')
  const nameOf = (player: Duelist) => (player === me ? myName : rival)
  const bothReady = ready.mine && ready.theirs

  return (
    <section aria-label={t('duel.opening.title')} className="grid gap-3 rounded-card border border-border-subtle bg-card-background p-3">
      <ul className="m-0 grid list-none gap-1.5 p-0">
        <PlayerRow name={myName || t('duel.opening.you')} ready={ready.mine} />
        <PlayerRow name={rival} ready={ready.theirs} />
      </ul>

      {!bothReady ? (
        <div className="grid gap-1.5">
          <Button variant={ready.mine ? 'secondary' : 'primary'} icon={ready.mine ? undefined : 'check'} disabled={!ready.mine && !canReady} onClick={() => actions.setReady(!ready.mine)}>
            {ready.mine ? t('duel.opening.readyCancel') : t('duel.opening.readyAction')}
          </Button>
          <p className="m-0 text-micro text-soft" role="status">
            {ready.mine ? t('duel.opening.readyWaiting', { name: rival }) : t('duel.opening.readyHint')}
          </p>
        </div>
      ) : opening.ordered ? (
        <p className="m-0 text-body font-semibold text-foreground" role="status">
          {t('duel.opening.starts', { name: nameOf(starter) })}
        </p>
      ) : opening.chooser !== null ? (
        <ChooseStep snapshot={snapshot} nameOf={nameOf} actions={actions} />
      ) : (
        <TossStep snapshot={snapshot} nameOf={nameOf} actions={actions} />
      )}
    </section>
  )
}

function PlayerRow({ name, ready }: { name: string; ready: boolean }) {
  return (
    <li data-ready={ready} className="flex items-center justify-between gap-2 text-body text-foreground">
      <span className="min-w-0 truncate font-semibold">{name}</span>
      <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-micro font-semibold', ready ? 'bg-accent/20 text-accent' : 'bg-tint/8 text-muted')}>
        {ready ? <Icon name="check" size={12} /> : null}
        {ready ? t('duel.opening.ready') : t('duel.opening.notReady')}
      </span>
    </li>
  )
}

interface StepProps {
  snapshot: DuelSnapshot
  nameOf: (player: Duelist) => string
  actions: OpeningActions
}

/** Los dos están listos y falta saber quién elige: con qué se define y cómo va. */
function TossStep({ snapshot, nameOf, actions }: StepProps) {
  const { opening, me, rps, peerName } = snapshot
  const rival = peerName ?? t('duel.bar.rival')
  const tie = opening.dice.mine !== null && opening.dice.mine === opening.dice.theirs
  const outcome = rpsOutcome(rps.mine, rps.theirs)

  return (
    <div className="grid gap-2">
      <p className="m-0 text-micro font-semibold uppercase tracking-[0.04em] text-soft">{t('duel.opening.title')}</p>

      {opening.method === null ? (
        <>
          <p className="m-0 text-body text-muted">{t('duel.opening.pick')}</p>
          <div className="grid grid-cols-3 gap-2">
            {TOSS_METHODS.map((method) => (
              <Button key={method} variant="secondary" size="sm" onClick={() => actions.chooseMethod(method)}>
                {methodName(method)}
              </Button>
            ))}
          </div>
        </>
      ) : opening.method === 'coin' ? (
        opening.caller === me ? (
          <>
            <p className="m-0 text-body text-foreground">{t('duel.opening.coin.call')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => actions.callCoin(0)}>
                {t('shell.life.coin.heads')}
              </Button>
              <Button variant="secondary" onClick={() => actions.callCoin(1)}>
                {t('shell.life.coin.tails')}
              </Button>
            </div>
          </>
        ) : (
          <p className="m-0 text-body text-muted" role="status">
            {t('duel.opening.coin.waiting', { name: nameOf(opening.caller ?? (me === 0 ? 1 : 0)) })}
          </p>
        )
      ) : opening.method === 'die' ? (
        <>
          {opening.dice.mine !== null ? (
            <p className="m-0 text-body text-foreground" role="status">
              {tie
                ? t('duel.opening.die.tie', { value: opening.dice.mine })
                : opening.dice.theirs !== null
                  ? t('duel.opening.die.result', { mine: opening.dice.mine, theirs: opening.dice.theirs, name: rival })
                  : t('duel.opening.die.waiting', { name: rival })}
            </p>
          ) : opening.dice.theirs !== null ? (
            <p className="m-0 text-body text-muted" role="status">
              {t('duel.opening.die.rivalRolled', { name: rival })}
            </p>
          ) : null}
          <Button variant="primary" icon="dice" disabled={opening.dice.mine !== null && !tie} onClick={actions.throwDie}>
            {t('duel.opening.die.roll')}
          </Button>
        </>
      ) : rps.mine === null ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {RPS_PICKS.map((pick) => (
              <Button key={pick} variant="secondary" onClick={() => actions.pickRps(pick)}>
                {rpsName(pick)}
              </Button>
            ))}
          </div>
          <p className="m-0 text-micro text-soft" role="status">
            {rps.theirs !== null ? t('duel.games.rps.rivalPicked', { name: rival }) : t('duel.games.rps.hint')}
          </p>
        </>
      ) : outcome === 'draw' ? (
        <div className="grid gap-2" role="status">
          <p className="m-0 text-body text-muted">{t('duel.games.rps.versus', { mine: rpsName(rps.mine), theirs: rpsName(rps.theirs!) })}</p>
          <p className="m-0 text-title font-bold text-foreground">{outcomeText('draw')}</p>
          <Button variant="secondary" size="sm" onClick={() => actions.pickRps(null)}>
            {t('duel.games.rps.again')}
          </Button>
        </div>
      ) : (
        <p className="m-0 text-body text-foreground" role="status">
          {t('duel.games.rps.waiting', { pick: rpsName(rps.mine), name: rival })}
        </p>
      )}
    </div>
  )
}

/** Ya se sabe quién elige (el que ganó o, en una revancha, el que perdió): él elige ir primero o segundo y el otro espera. */
function ChooseStep({ snapshot, nameOf, actions }: StepProps) {
  const { opening, me, games, peerName, rps } = snapshot
  const chooser = opening.chooser as Duelist
  const rival = peerName ?? t('duel.bar.rival')
  const rival01: Duelist = me === 0 ? 1 : 0
  const rematch = opening.method === null
  const coin = [...games].reverse().find((entry) => entry.game.kind === 'coin' && entry.game.call !== undefined)
  const coinGame = coin?.game.kind === 'coin' ? coin.game : null

  return (
    <div className="grid gap-2" role="status">
      {opening.method === 'coin' && coin && coinGame ? (
        <div className="grid justify-items-center gap-1 [perspective:40rem]">
          <Coin key={coin.id} face={coinGame.face} />
          <p className="m-0 text-micro text-muted">
            {t('duel.opening.coin.result', { name: nameOf(coin.from), call: t(coinGame.call === 0 ? 'shell.life.coin.heads' : 'shell.life.coin.tails'), face: t(coinGame.face === 0 ? 'shell.life.coin.heads' : 'shell.life.coin.tails') })}
          </p>
        </div>
      ) : null}
      {opening.method === 'die' && opening.dice.mine !== null && opening.dice.theirs !== null ? (
        <p className="m-0 text-micro text-muted">{t('duel.opening.die.result', { mine: opening.dice.mine, theirs: opening.dice.theirs, name: rival })}</p>
      ) : null}
      {opening.method === 'rps' && rps.mine && rps.theirs ? (
        <p className="m-0 text-micro text-muted">{t('duel.games.rps.versus', { mine: rpsName(rps.mine), theirs: rpsName(rps.theirs) })}</p>
      ) : null}

      <p className="m-0 text-body font-semibold text-foreground">
        {chooser === me ? (rematch ? t('duel.opening.rematch') : t('duel.opening.won')) : rematch ? t('duel.opening.rematchRival', { name: rival }) : t('duel.opening.lost', { name: rival })}
      </p>

      {chooser === me ? (
        <>
          <p className="m-0 text-body text-muted">{t('duel.opening.choose')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={() => actions.chooseFirst(me)}>
              {t('duel.opening.first')}
            </Button>
            <Button variant="secondary" onClick={() => actions.chooseFirst(rival01)}>
              {t('duel.opening.second')}
            </Button>
          </div>
        </>
      ) : (
        <p className="m-0 text-body text-muted">{t('duel.opening.chooserWaiting', { name: rival })}</p>
      )}
    </div>
  )
}
