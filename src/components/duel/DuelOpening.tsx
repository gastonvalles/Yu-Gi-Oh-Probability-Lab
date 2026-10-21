import { useEffect, useState } from 'react'

import { RPS_PICKS, TOSS_METHODS, rpsOutcome, type RpsPick } from '../../app/duel-games'
import type { Duel, DuelSnapshot } from '../../app/duel-session'
import type { Duelist } from '../../app/life-calculator'
import { MAX_NAME_LENGTH } from '../../app/duel-protocol'
import { t } from '../../i18n'
import { MatScene } from '../probability/MatArena'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { RPS_GLYPH, methodName, outcomeText, rpsName } from './game-text'
import { PLAYER_COLOR, type PlayerSide } from './player-color'
import { STAGE_CARD, STAGE_INNER } from './room-stage'
import { CoinStage, DieSeat, RpsSeat } from './toss-views'

/** Lo que la sala puede hacer antes de la mesa: estar listo, elegir con qué definir quién empieza, jugarlo y elegir ir primero o segundo. */
export type OpeningActions = Pick<Duel, 'setReady' | 'chooseMethod' | 'callCoin' | 'throwDie' | 'pickRps' | 'chooseFirst'>

interface DuelOpeningProps {
  snapshot: DuelSnapshot
  myName: string
  /** Se puede estar listo: hay deck para repartir y los ajustes del anfitrión ya llegaron. */
  canReady: boolean
  actions: OpeningActions
  /** Mi nombre tal como lo escribí (vacío si no puse uno) y cómo cambiarlo: se edita en mi tarjeta hasta que toco "Estoy listo". */
  /** `onCommit` devuelve `false` si el nombre no se aceptó (el del rival): el campo vuelve al que estaba. */
  rename?: { value: string; onCommit: (name: string) => boolean | void }
}

/**
 * Lo que pasa entre entrar a la sala y la mesa, en orden: los dos tocan "Estoy listo" (y cada uno ve si el otro ya lo hizo); definen con una moneda, un dado
 * o piedra-papel-tijera quién elige ir primero o segundo; y quien gana elige. En una revancha elige quien perdió, sin tirar. Al elegir, cada uno reparte su mano.
 * Es el escenario de la sala (Gastón, 2026-10-20: «no debe haber scroll en esta pantalla nunca y las cosas están mal ordenadas», con la sala de otro simulador de referencia): sobre la arena de la mesa, cada jugador
 * a un lado (su inicial, su nombre y si está listo, con su dado o su mano debajo) y el VS en el medio; abajo, lo que toca hacer.
 */
export function DuelOpening({ snapshot, myName, canReady, actions, rename }: DuelOpeningProps) {
  const { ready, opening, me, peerName, starter, rps } = snapshot
  const rival = peerName ?? t('duel.bar.rival')
  const nameOf = (player: Duelist) => (player === me ? myName : rival)
  const bothReady = ready.mine && ready.theirs
  const tossing = bothReady && !opening.ordered
  // Lo que se tira, a la vista de los dos al mismo tiempo: un dado por jugador (el del otro gira en tu pantalla cuando lo tira) o las dos manos de piedra-papel-tijera cuando eligieron los dos; la moneda es una sola y va entre los dos.
  const stage = tossing ? (opening.method === 'die' ? 'dice' : opening.method === 'rps' && rps.mine && rps.theirs ? 'rps' : null) : null

  return (
    <section aria-label={t('duel.opening.title')} className={STAGE_CARD}>
      <MatScene className="absolute inset-0 -z-10" />
      <div className={STAGE_INNER}>
        <ul data-stage={stage ?? undefined} className="m-0 grid list-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 p-0 [perspective:40rem] [--die:4rem] @[46rem]:gap-4 @[46rem]:[--die:5rem] [@media(max-height:760px)]:[--die:3.5rem]!">
          <PlayerCard side="mine" caption={t('duel.opening.you')} name={myName || t('duel.opening.you')} ready={ready.mine} rename={ready.mine ? undefined : rename}>
            {stage === 'dice' ? <DieSeat snapshot={snapshot} side="mine" /> : stage === 'rps' && rps.mine ? <RpsSeat key={rps.mine} pick={rps.mine} /> : null}
          </PlayerCard>
          <VersusMark />
          <PlayerCard side="theirs" caption={t('duel.opening.rival')} name={rival} ready={ready.theirs}>
            {stage === 'dice' ? <DieSeat snapshot={snapshot} side="theirs" /> : stage === 'rps' && rps.theirs ? <RpsSeat key={rps.theirs} pick={rps.theirs} /> : null}
          </PlayerCard>
        </ul>

        {tossing && opening.method === 'coin' ? <CoinResult snapshot={snapshot} nameOf={nameOf} /> : null}

        {!bothReady ? (
          <div className="grid gap-1.5">
            <Button variant={ready.mine ? 'secondary' : 'primary'} size="lg" color={ready.mine ? 'brand' : 'success'} icon={ready.mine ? undefined : 'check'} disabled={!ready.mine && !canReady} onClick={() => actions.setReady(!ready.mine)}>
              {ready.mine ? t('duel.opening.readyCancel') : t('duel.opening.readyAction')}
            </Button>
            <p className="m-0 text-center text-micro text-soft" role="status">
              {ready.mine ? t('duel.opening.readyWaiting', { name: rival }) : t('duel.opening.readyHint')}
            </p>
          </div>
        ) : opening.ordered ? (
          <p className="m-0 text-center text-body font-semibold text-foreground" role="status">
            {t('duel.opening.starts', { name: nameOf(starter) })}
          </p>
        ) : opening.chooser !== null ? (
          <ChooseStep snapshot={snapshot} nameOf={nameOf} actions={actions} />
        ) : (
          <TossStep snapshot={snapshot} nameOf={nameOf} actions={actions} />
        )}
      </div>
    </section>
  )
}

/** La moneda con lo que salió, entre los dos jugadores (es una sola: no va debajo de ninguno). */
function CoinResult({ snapshot, nameOf }: { snapshot: DuelSnapshot; nameOf: (player: Duelist) => string }) {
  const coin = [...snapshot.games].reverse().find((entry) => entry.game.kind === 'coin' && entry.game.call !== undefined)

  if (!coin || coin.game.kind !== 'coin' || coin.game.call === undefined) {
    return null
  }

  const word = (face: 0 | 1) => t(face === 0 ? 'shell.life.coin.heads' : 'shell.life.coin.tails')

  return <CoinStage entry={{ ...coin, game: coin.game }} caption={t('duel.opening.coin.result', { name: nameOf(coin.from), call: word(coin.game.call), face: word(coin.game.face) })} />
}

/** El «VS» entre los dos jugadores (decoración: el lector de pantalla lee los dos jugadores, no el VS). */
export function VersusMark() {
  return (
    <li aria-hidden="true" className="self-center text-lead font-extrabold italic tracking-wider text-soft @[46rem]:text-title">
      {t('duel.opening.versus')}
    </li>
  )
}

/** Cada uno de los dos jugadores: su inicial en una chapa de su color (violeta el tuyo, ámbar el rival), su nombre y, abajo, si ya está listo (la tarjeta se enciende en verde), y debajo lo que tiró. `showReady: false`: antes de que llegue el rival no hay nada que decir. */
export function PlayerCard({ side, caption, name, ready, showReady = true, rename, children }: { side: PlayerSide; caption: string; name: string; ready: boolean; showReady?: boolean; rename?: DuelOpeningProps['rename']; children?: React.ReactNode }) {
  const color = PLAYER_COLOR[side]

  return (
    <li data-ready={ready} className={cx('grid min-w-0 content-start justify-items-center gap-1 rounded-card border px-2 py-2 text-center backdrop-blur-sm transition-colors @[46rem]:gap-1.5 @[46rem]:py-4', ready ? 'border-success/60 bg-success/10' : 'border-border-subtle bg-card-background/70')}>
      <span aria-hidden="true" className={cx('hidden size-12 place-items-center rounded-full border-2 text-lead font-extrabold uppercase @[46rem]:grid', color.border, color.bubble, color.text)}>
        {Array.from((rename?.value || name).trim())[0] ?? '?'}
      </span>
      <span className="text-micro font-semibold uppercase tracking-[0.04em] text-soft">{caption}</span>
      {rename ? <NameInput value={rename.value} onCommit={rename.onCommit} /> : <span className="max-w-full truncate text-body font-bold text-foreground @[46rem]:text-lead">{name}</span>}
      {showReady ? (
        <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-micro font-semibold', ready ? 'bg-success/20 text-success-soft' : 'bg-tint/8 text-muted')}>
          {ready ? <Icon name="check" size={12} /> : null}
          {ready ? t('duel.opening.ready') : t('duel.opening.notReady')}
        </span>
      ) : null}
      {children}
    </li>
  )
}

/** El nombre propio, editable: se manda al rival al salir del campo (o con Enter), no en cada letra. */
function NameInput({ value, onCommit }: { value: string; onCommit: (name: string) => boolean | void }) {
  const [draft, setDraft] = useState(value)

  // Si el nombre cambia desde afuera (el invitado que llega con el mismo nombre que el anfitrión pasa a llevar un número), el campo lo sigue.
  useEffect(() => setDraft(value), [value])

  return (
    <input
      aria-label={t('duel.lobby.name')}
      placeholder={t('duel.lobby.defaultName')}
      maxLength={MAX_NAME_LENGTH}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (onCommit(draft) === false) setDraft(value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className="w-full min-w-0 rounded-input border border-border-subtle bg-transparent px-2 py-1 text-center text-body font-bold text-foreground outline-none placeholder:font-normal placeholder:text-soft focus:border-info"
    />
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
      <p className="m-0 text-center text-micro font-semibold uppercase tracking-[0.04em] text-soft">{t('duel.opening.title')}</p>

      {opening.method === null ? (
        <>
          <p className="m-0 text-center text-body text-muted">{t('duel.opening.pick')}</p>
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
            <p className="m-0 text-center text-body text-foreground">{t('duel.opening.coin.call')}</p>
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
          <p className="m-0 text-center text-body text-muted" role="status">
            {t('duel.opening.coin.waiting', { name: nameOf(opening.caller ?? (me === 0 ? 1 : 0)) })}
          </p>
        )
      ) : opening.method === 'die' ? (
        <>
          {opening.dice.mine !== null ? (
            <p className="m-0 text-center text-body text-foreground" role="status">
              {tie
                ? t('duel.opening.die.tie', { value: opening.dice.mine })
                : opening.dice.theirs !== null
                  ? t('duel.opening.die.result', { mine: opening.dice.mine, theirs: opening.dice.theirs, name: rival })
                  : t('duel.opening.die.waiting', { name: rival })}
            </p>
          ) : opening.dice.theirs !== null ? (
            <p className="m-0 text-center text-body text-muted" role="status">
              {t('duel.opening.die.rivalRolled', { name: rival })}
            </p>
          ) : null}
          <Button variant="primary" size="lg" icon="dice" disabled={opening.dice.mine !== null && !tie} onClick={actions.throwDie}>
            {t('duel.opening.die.roll')}
          </Button>
        </>
      ) : rps.mine === null ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {RPS_PICKS.map((pick: RpsPick) => (
              <Button key={pick} variant="secondary" className="h-auto flex-col gap-0.5 py-2" onClick={() => actions.pickRps(pick)}>
                <span aria-hidden="true" className="text-title leading-none">{RPS_GLYPH[pick]}</span>
                {rpsName(pick)}
              </Button>
            ))}
          </div>
          <p className="m-0 text-center text-micro text-soft" role="status">
            {rps.theirs !== null ? t('duel.games.rps.rivalPicked', { name: rival }) : t('duel.games.rps.hint')}
          </p>
        </>
      ) : outcome === 'draw' ? (
        <div className="grid justify-items-center gap-2 text-center" role="status">
          <p className="m-0 text-body text-muted">{t('duel.games.rps.versus', { mine: rpsName(rps.mine), theirs: rpsName(rps.theirs!) })}</p>
          <p className="m-0 text-title font-bold text-foreground">{outcomeText('draw')}</p>
          <Button variant="secondary" size="sm" onClick={() => actions.pickRps(null)}>
            {t('duel.games.rps.again')}
          </Button>
        </div>
      ) : (
        <p className="m-0 text-center text-body text-foreground" role="status">
          {t('duel.games.rps.waiting', { pick: rpsName(rps.mine), name: rival })}
        </p>
      )}
    </div>
  )
}

/** Ya se sabe quién elige (el que ganó o, en una revancha, el que perdió): él elige ir primero o segundo y el otro espera. */
function ChooseStep({ snapshot, actions }: StepProps) {
  const { opening, me, peerName } = snapshot
  const chooser = opening.chooser as Duelist
  const rival = peerName ?? t('duel.bar.rival')
  const rival01: Duelist = me === 0 ? 1 : 0
  const rematch = opening.method === null

  return (
    <div className="grid gap-2 text-center" role="status">
      <p className="m-0 text-body font-semibold text-foreground">
        {chooser === me ? (rematch ? t('duel.opening.rematch') : t('duel.opening.won')) : rematch ? t('duel.opening.rematchRival', { name: rival }) : t('duel.opening.lost', { name: rival })}
      </p>

      {chooser === me ? (
        <>
          <p className="m-0 text-body text-muted">{t('duel.opening.choose')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => actions.chooseFirst(me)}>
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
