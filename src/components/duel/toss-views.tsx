import { useEffect, useRef, useState } from 'react'

import type { GameEntry, RpsPick } from '../../app/duel-games'
import type { DuelSnapshot } from '../../app/duel-session'
import type { Duelist } from '../../app/life-calculator'
import { t } from '../../i18n'
import { Coin, Die } from '../life/Toss'
import { cx } from '../ui/cx'
import { tossResult } from './game-text'

/**
 * Lo que se tira en un duelo, para que los dos lo vean: el dado de cada uno (el del otro gira en tu pantalla cuando lo tira), la moneda con lo que salió
 * y las dos manos de piedra-papel-tijera al mismo tiempo. Las usa la sala (cuando se define quién empieza) y la mesa (cuando el rival tira algo).
 */

/** Cuánto se queda en pantalla lo que tira el rival durante el duelo. */
const TOSS_MS = 3200

const RPS_GLYPH: Record<RpsPick, string> = { rock: '✊', paper: '✋', scissors: '✌️' }

/** La última vez que `from` tiró un dado (de ahí sale la clave que hace girar el dado de nuevo cuando vuelve a tirar). */
const lastDie = (games: readonly GameEntry[], from: Duelist) => [...games].reverse().find((entry) => entry.game.kind === 'die' && entry.from === from)

/** Los dados de los dos, uno al lado del otro: el que todavía no tiró es un lugar vacío. */
export function DiceStage({ snapshot, myName }: { snapshot: DuelSnapshot; myName: string }) {
  const { games, me, opening, peerName } = snapshot
  const rival = peerName ?? t('duel.bar.rival')
  const seats = [
    { name: myName || t('duel.opening.you'), value: opening.dice.mine, entry: lastDie(games, me) },
    { name: rival, value: opening.dice.theirs, entry: lastDie(games, me === 0 ? 1 : 0) },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 [perspective:40rem]" data-stage="dice">
      {seats.map((seat, index) => (
        <div key={index} className="grid justify-items-center gap-1">
          {seat.value !== null && seat.entry ? <Die key={seat.entry.id} value={seat.value} /> : <span aria-hidden="true" className="mb-6 mt-1 grid size-20 place-items-center rounded-card border-2 border-dashed border-border-subtle text-title font-bold text-soft">?</span>}
          <span className="max-w-full truncate text-micro font-semibold text-muted">{seat.name}</span>
        </div>
      ))}
    </div>
  )
}

/** La moneda con lo que salió, girando en las dos pantallas. */
export function CoinStage({ entry, caption }: { entry: GameEntry & { game: { kind: 'coin' } }; caption: string }) {
  return (
    <div className="grid justify-items-center gap-1 [perspective:40rem]" data-stage="coin">
      <Coin key={entry.id} face={entry.game.face} />
      <p className="m-0 text-center text-micro text-muted">{caption}</p>
    </div>
  )
}

/** Las dos manos de piedra-papel-tijera, que se muestran juntas cuando eligieron los dos (cada una se sacude y aparece). */
export function RpsStage({ mine, theirs, myName, rival }: { mine: RpsPick; theirs: RpsPick; myName: string; rival: string }) {
  const hands = [
    { name: myName || t('duel.opening.you'), pick: mine },
    { name: rival, pick: theirs },
  ]

  return (
    <div className="grid grid-cols-2 gap-2" data-stage="rps">
      {hands.map((hand, index) => (
        <div key={`${index}-${hand.pick}`} className="grid justify-items-center gap-1">
          <span aria-hidden="true" className="animate-rps-reveal text-[3.5rem] leading-none motion-reduce:animate-none">
            {RPS_GLYPH[hand.pick]}
          </span>
          <span className="max-w-full truncate text-micro font-semibold text-muted">{hand.name}</span>
        </div>
      ))}
    </div>
  )
}

type Shown = { key: number; kind: 'toss'; entry: GameEntry } | { key: number; kind: 'rps'; mine: RpsPick; theirs: RpsPick }

/**
 * Lo que el rival tira durante el duelo (moneda o dado) y las dos manos al cerrarse una ronda de piedra-papel-tijera, a la vista aunque el panel de juegos esté
 * cerrado: se muestra un rato en el centro, sin tapar los toques. Lo que ya estaba tirado al abrir la pantalla no se muestra.
 */
export function TossOverlay({ snapshot, myName }: { snapshot: DuelSnapshot; myName: string }) {
  const { games, rps, me, peerName } = snapshot
  const rival = peerName ?? t('duel.bar.rival')
  const seen = useRef(games.at(-1)?.id ?? 0)
  const [shown, setShown] = useState<Shown | null>(null)
  const picks = rps.mine && rps.theirs ? `${rps.mine}:${rps.theirs}` : null

  useEffect(() => {
    const fresh = games.filter((entry) => entry.id > seen.current)

    seen.current = Math.max(seen.current, games.at(-1)?.id ?? 0)

    const toss = [...fresh].reverse().find((entry) => entry.from !== me && (entry.game.kind === 'coin' || entry.game.kind === 'die'))

    if (toss) {
      setShown({ key: toss.id, kind: 'toss', entry: toss })
    }
  }, [games, me])

  useEffect(() => {
    if (picks && rps.mine && rps.theirs) {
      setShown({ key: Date.now(), kind: 'rps', mine: rps.mine, theirs: rps.theirs })
    }
    // Sólo importa cuando se completa la ronda: `picks` lo resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks])

  useEffect(() => {
    if (!shown) return

    const id = setTimeout(() => setShown(null), TOSS_MS)
    return () => clearTimeout(id)
  }, [shown])

  if (!shown) {
    return null
  }

  const game = shown.kind === 'toss' ? shown.entry.game : null

  return (
    <div role="status" className="pointer-events-none fixed inset-0 z-[170] grid place-items-center">
      <div className={cx('grid min-w-56 justify-items-center gap-2 rounded-panel border border-border-subtle bg-background/90 px-5 py-4 shadow-overlay')}>
        {shown.kind === 'rps' ? (
          <RpsStage mine={shown.mine} theirs={shown.theirs} myName={myName} rival={rival} />
        ) : game?.kind === 'coin' ? (
          <CoinStage entry={{ ...shown.entry, game }} caption={t('duel.games.tossed', { name: rival, result: tossResult(game) })} />
        ) : game?.kind === 'die' ? (
          <div className="grid justify-items-center gap-1 [perspective:40rem]">
            <Die key={shown.entry.id} value={game.value} />
            <p className="m-0 text-center text-micro text-muted">{t('duel.games.tossed', { name: rival, result: tossResult(game) })}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
