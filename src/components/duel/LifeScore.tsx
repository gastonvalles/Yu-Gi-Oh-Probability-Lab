import { memo, useContext, useEffect, useLayoutEffect, useRef } from 'react'

import { isEmojiSignal } from '../../app/duel-signals'
import { LifeHold, useHeldValue, useLifeNumber, useLpDelta } from '../../app/life-effects'
import { isCritical, playCritical, playLifeChange } from '../../app/life-hit'
import { prefersReducedMotion } from '../../app/motion'
import { t } from '../../i18n'
import { sacudir } from '../probability/AttackFx'
import { cx } from '../ui/cx'
import { PLAYER_COLOR, type PlayerSide } from './player-color'

/** Cuánto se queda el globo de una señal (pensando, todo bien, un 👍) junto a las vidas: el temporizador de `useSignals` (use-duel-table) lo quita a esta misma duración. */
export const SIGNAL_MS = 3500

/**
 * Las vidas de un jugador, planas (Gastón, 2026-10-27, opción A «Marcador arriba»: las placas «no le gustan»): sin caja, chapa ni barra de 8000. Arriba el nombre chico en el color del dueño
 * (`PLAYER_COLOR`), abajo el número grande y blanco, que es lo que decide. El número cuenta hasta el valor nuevo (`useLifeNumber`, por ref) y la diferencia no ocupa lugar.
 * - Al bajar, el golpe (`playLifeChange`, `app/life-hit.ts`): la casilla se sacude (`sacudir`), el número se infla, un fogonazo rojo se enciende detrás y el «−N» sube hasta debajo del
 *   número (sin cruzarlo) y se funde. Al subir, sin golpe: un fogonazo verde y el «+N» quieto, que se funde. Son capas ya dibujadas que animan `scale`/`translate`/`opacity`, disparadas por refs desde un
 *   efecto: el golpe no vuelve a dibujar la casilla. Lo dispara el valor que se ve: con `LifeHold` retenido, nada hasta que se suelta.
 * - Crítico (`CRITICAL_LP`: 2000 o menos y más de 0, en las dos casillas y para quien mira): el número queda rojo y detrás late un resplandor (sólo `opacity`). En 0, rojo y quieto.
 * - Con movimiento reducido: sólo el «±N», que se funde; en crítico, el resplandor quieto.
 * - `align`: «start» la tuya (a la izquierda del marcador), «end» la del rival (a la derecha).
 * - `size`: «sm» el número de 24 px (el marcador de la barra, hasta 1100 px); «lg» el de 33 px (escritorio, opción D2: cada vida en su esquina del campo o en su lateral).
 * - `onClick` (el duelo por enlace manual): es un botón de 44 × 44 como mínimo que abre la calculadora, con el aro de foco de siempre y un fondo tenue al apuntarlo. Sin él, `role="group"` (el automático:
 *   las vidas las lleva el núcleo).
 * - `bubble`: la señal de su dueño (🤔, «Pensando…»), un instante, con el borde de su color: debajo del número; tus vidas grandes (abajo de la pantalla, en tu esquina o tu lateral), arriba.
 * - Accesibilidad: «Puntos de vida de …: N» (con el botón, «… Abrir la calculadora de vidas»); el globo es `role="status"`.
 * - Usos: «Jugar solo automático» y los duelos por enlace en todos los anchos (el marcador de la barra hasta 1100 px; las esquinas del campo o los laterales en escritorio) y quien mira.
 * - `memo`: la barra que la lleva se redibuja por otras cosas (el turno, los avisos) y las vidas, si no cambiaron, no.
 */
export const LifeScore = memo(function LifeScore({
  name,
  label,
  life: real,
  mine = false,
  color,
  align = mine ? 'start' : 'end',
  size = 'sm',
  onClick,
  bubble = null,
  bubbleKey,
}: {
  name: string
  /** Lo que dice arriba, si no es el nombre (tus vidas: «Vos»). */
  label?: string
  life: number
  mine?: boolean
  /** De qué jugador es el color (por defecto, el tuyo si es `mine`): quien mira pone el suyo a cada uno. */
  color?: PlayerSide
  align?: 'start' | 'end'
  size?: 'sm' | 'lg'
  /** Abre la calculadora de vidas del duelo: con esto es un botón. */
  onClick?: (() => void) | undefined
  /** Un aviso que sale un instante junto a las vidas, con el color de su dueño. */
  bubble?: string | null
  /** Cambia con cada señal (aunque diga lo mismo): el globo vuelve a entrar. */
  bubbleKey?: number | undefined
}) {
  const side = mine ? 'mine' : 'theirs'
  const tone = PLAYER_COLOR[color ?? side]
  // Las que se ven: las de verdad, salvo mientras un ataque todavía no golpeó (`LifeHold`: igual que la placa).
  const life = useHeldValue(real, useContext(LifeHold))
  // El número cuenta escribiendo su texto en cada cuadro, sin redibujar el marcador (`useLifeNumber` con `into`).
  const number = useRef<HTMLSpanElement | null>(null)
  const shown = useLifeNumber(life, number)
  const critical = isCritical(life)
  const box = useRef<HTMLElement | null>(null)
  const setBox = (node: HTMLElement | null) => {
    box.current = node
  }
  const punch = useRef<HTMLSpanElement | null>(null)
  const flash = useRef<HTMLSpanElement | null>(null)
  const glow = useRef<HTMLSpanElement | null>(null)
  const floater = useRef<HTMLSpanElement | null>(null)
  const previous = useRef(life)

  // El golpe, por refs y sin estado: escribe el «±N», elige el color de las capas (`data-dir`) y anima. Lo que ya estaba al abrir no cuenta, ni la vuelta desde 0 (la revancha).
  useLayoutEffect(() => {
    const before = previous.current

    previous.current = life
    if (before === life || before <= 0 || !box.current || !punch.current || !flash.current || !floater.current) return

    const delta = life - before
    const dir = delta < 0 ? 'down' : 'up'

    floater.current.textContent = `${delta < 0 ? '−' : '+'}${Math.abs(delta)}`
    floater.current.dataset.dir = dir
    flash.current.dataset.dir = dir
    const shake = delta < 0 ? sacudir(box.current, 'life') : null
    const hit = playLifeChange({ punch: punch.current, flash: flash.current, floater: floater.current }, delta, prefersReducedMotion())

    return () => {
      shake?.cancel()
      hit.forEach((animation) => animation.cancel())
    }
  }, [life])

  useEffect(() => {
    const beat = critical && glow.current ? playCritical(glow.current, prefersReducedMotion()) : null

    return () => beat?.cancel()
  }, [critical])

  const lifeOf = `${t('duel.bar.lifeOf', { name })}: ${life}`
  const body = (
    <>
      {/* Un nombre largo se corta con «…»: no le quita lugar al turno del marcador. */}
      <span aria-hidden="true" className={cx('max-w-28 truncate text-micro font-bold uppercase leading-none tracking-wider', tone.text)}>{label ?? name}</span>
      {/* Lo que se infla envuelve al número y a sus capas (el resplandor del crítico y el fogonazo), que quedan detrás. */}
      <span ref={punch} aria-hidden="true" className="relative">
        <span ref={glow} className={cx('pointer-events-none absolute -inset-x-4 -inset-y-3 bg-radial from-danger/55 to-transparent to-70% opacity-0', critical && 'motion-reduce:opacity-60')} />
        <span ref={flash} className="pointer-events-none absolute -inset-x-5 -inset-y-4 bg-radial from-danger-soft/70 to-transparent to-70% opacity-0 data-[dir=up]:from-success-soft/60" />
        <span ref={number} className={cx(size === 'lg' ? 'text-stat' : 'text-title', 'relative block font-bold leading-none tabular-nums', critical || life === 0 ? 'text-danger-soft' : 'text-foreground')}>
          {shown}
        </span>
      </span>
      {/* El «±N» flota debajo del número (no ensancha el marcador ni corre el turno): su texto lo escribe el golpe. */}
      <span ref={floater} aria-hidden="true" className={cx('pointer-events-none absolute top-full mt-1 font-extrabold leading-none tabular-nums text-danger-soft opacity-0 data-[dir=up]:text-success-soft', size === 'lg' ? 'text-lead' : 'text-body', align === 'end' ? 'right-0 origin-right' : 'left-0 origin-left')} />
      {bubble ? (
        <span
          key={bubbleKey}
          role="status"
          style={{ animationDuration: `${SIGNAL_MS}ms` }}
          className={cx(
            'pointer-events-none absolute z-30 w-max max-w-[16rem] animate-linger rounded-card border bg-card-background normal-case tracking-normal text-foreground shadow-[0_8px_20px_rgba(0,0,0,0.4)] motion-reduce:animate-none',
            isEmojiSignal(bubble) ? 'px-3 py-1 text-display leading-none' : 'truncate px-2.5 py-1 text-body font-semibold',
            tone.border,
            align === 'end' ? 'right-0' : 'left-0',
            mine && size === 'lg' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {bubble}
        </span>
      ) : null}
    </>
  )
  // `data-lp`: a qué casilla va la espada de un ataque directo (ver `measureStrike`).
  const place = cx('relative grid shrink-0 gap-1', align === 'end' ? 'justify-items-end text-right' : 'justify-items-start text-left')

  return onClick ? (
    <button ref={setBox} type="button" data-lp={side} data-life-score="" aria-label={`${lifeOf}. ${t('duel.bar.openCalculator')}`} className={cx(place, '-mx-1 min-h-11 min-w-11 cursor-pointer content-center rounded-control px-1 transition-colors hover:bg-tint/8 focus-visible:outline-none focus-visible:shadow-focus')} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div ref={setBox} role="group" data-lp={side} data-life-score="" aria-label={lifeOf} className={place}>
      {body}
    </div>
  )
})

/** La etiqueta de cada chapa: «Vos» en violeta con texto blanco, «Rival» en lima con texto carbón. */
const BADGE_TAG = { mine: 'bg-primary text-white', theirs: 'bg-info text-background' } as const

/**
 * La chapa de vidas del duelo (Gastón, 2026-11-10: el diseño de la mesa del celular, como Master Duel): junto a cada lado de la mesa, la del rival arriba a la derecha y la tuya abajo a la izquierda (en
 * escritorio, a los costados del campo). Recta, con fondo carbón al 82 % en alfa plano (sin desenfoque: el texto blanco pasa AA sobre el remolino) y el borde del dueño; arriba la etiqueta («Vos» violeta,
 * «Rival» lima) y, si se da, el turno (`turn`); abajo, el número de 33 px.
 * - **El cambio de vidas:** el número crece a 1,08 y vuelve (`animate-life-bump`) y al lado sale «−1100 ▼» que sube y se funde (`animate-life-delta`): rojo si te conviene poco (tu daño, lo que el rival
 *   gana), menta si te conviene (el daño al rival, lo que ganás). Sólo `transform`/`opacity`; con movimiento reducido el «−1100» queda quieto y se va solo. Lo anuncia el lector de pantalla (`aria-live`).
 * - Crítico (2000 o menos) y en 0, el número en rojo. `onClick` (el duelo manual): un botón de 44 px que abre la calculadora. `bubble`: la señal de su dueño, como en `LifeScore`.
 * - Usos: los duelos (manual, por enlace y automático) en el celular y en las esquinas del campo en escritorio; la marca y la fila de 640 a 1100 px siguen con `LifeScore`.
 */
export const LifeBadge = memo(function LifeBadge({
  name,
  label,
  life: real,
  mine = false,
  color,
  align = mine ? 'start' : 'end',
  turn,
  turnMine,
  onClick,
  bubble = null,
  bubbleKey,
}: {
  name: string
  label: string
  life: number
  mine?: boolean
  color?: PlayerSide
  align?: 'start' | 'end'
  /** El turno, junto a la etiqueta («tu turno 3»), en el color de quién lo tiene. */
  turn?: string | undefined
  turnMine?: boolean | undefined
  onClick?: (() => void) | undefined
  bubble?: string | null
  bubbleKey?: number | undefined
}) {
  const side = mine ? 'mine' : 'theirs'
  const owner = color ?? side
  const life = useHeldValue(real, useContext(LifeHold))
  // Sin `into`: el número que late se vuelve a montar con cada cambio (su clave) y React tiene que ser el dueño de su texto. La chapa es chica: dibujarla por cuadro mientras cuenta no pesa.
  const shown = useLifeNumber(life)
  const change = useLpDelta(life)
  const box = useRef<HTMLElement | null>(null)
  const setBox = (node: HTMLElement | null) => {
    box.current = node
  }

  // Al bajar, la chapa se sacude como en el impacto (`sacudir`: sólo `transform`; con movimiento reducido no se mueve).
  useEffect(() => {
    const shake = change && change.delta < 0 && box.current && !prefersReducedMotion() ? sacudir(box.current, 'life') : null

    return () => shake?.cancel()
  }, [change])

  // A quién le conviene: menta si es bueno para vos (el rival pierde o vos ganás), rojo si no.
  const good = change ? change.delta < 0 !== mine : false
  const deltaText = change ? `${change.delta < 0 ? '−' : '+'}${Math.abs(change.delta)}` : ''
  const lifeOf = `${t('duel.bar.lifeOf', { name })}: ${life}`
  const body = (
    <>
      <span className={cx('flex min-w-0 items-center gap-1.5 text-micro font-bold leading-4', align === 'end' && 'flex-row-reverse')}>
        <span aria-hidden="true" className={cx('shrink-0 px-1.5 uppercase tracking-wider', BADGE_TAG[owner])}>{label}</span>
        {turn ? <span className={cx('min-w-0 truncate', turnMine === false ? 'text-info-soft' : 'text-accent')}>{turn}</span> : null}
      </span>
      <span className={cx('relative flex items-center', align === 'end' && 'flex-row-reverse')}>
        {/* El golpe: la clave cambia con cada cambio y vuelve a correr la animación. */}
        <span key={change?.key ?? 'idle'} aria-hidden="true" className={cx('origin-center', change && 'animate-life-bump motion-reduce:animate-none')}>
          <span className={cx('block text-stat font-extrabold leading-none tabular-nums', isCritical(life) || life === 0 ? 'text-danger-soft' : 'text-foreground')}>
            {shown}
          </span>
        </span>
        {change ? (
          // Flota al costado del número (no ensancha la chapa ni corre nada): hacia la mesa, a la derecha la tuya y a la izquierda la del rival.
          <span key={change.key} aria-hidden="true" data-life-delta={good ? 'good' : 'bad'} className={cx('pointer-events-none absolute z-30 animate-life-delta whitespace-nowrap text-lead font-extrabold tabular-nums motion-reduce:animate-none', align === 'end' ? 'right-full mr-3' : 'left-full ml-3', good ? 'text-success' : 'text-danger-soft')}>
            {deltaText} {change.delta < 0 ? '▼' : '▲'}
          </span>
        ) : null}
      </span>
      <span aria-live="polite" className="sr-only">
        {change ? `${label} ${deltaText}` : ''}
      </span>
      {bubble ? (
        <span key={bubbleKey} role="status" style={{ animationDuration: `${SIGNAL_MS}ms` }} className={cx('pointer-events-none absolute z-30 w-max max-w-[16rem] animate-linger border bg-card-background text-foreground shadow-[0_8px_20px_rgba(0,0,0,0.4)] motion-reduce:animate-none', isEmojiSignal(bubble) ? 'px-3 py-1 text-display leading-none' : 'truncate px-2.5 py-1 text-body font-semibold', PLAYER_COLOR[owner].border, align === 'end' ? 'right-0' : 'left-0', mine ? 'bottom-full mb-1.5' : 'top-full mt-1.5')}>
          {bubble}
        </span>
      ) : null}
    </>
  )
  // Recta y traslúcida (82 %, alfa plano), con el borde de su dueño.
  const plate = cx('relative grid shrink-0 gap-0.5 border bg-background/82 px-2 py-1', owner === 'mine' ? 'border-primary' : 'border-info', align === 'end' ? 'justify-items-end text-right' : 'justify-items-start text-left')

  return onClick ? (
    <button ref={setBox} type="button" data-lp={side} data-life-score="" data-life-badge="" aria-label={`${lifeOf}. ${t('duel.bar.openCalculator')}`} className={cx(plate, 'min-h-11 min-w-11 cursor-pointer rounded-none transition-colors hover:border-info focus-visible:outline-none focus-visible:shadow-focus')} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div ref={setBox} role="group" data-lp={side} data-life-score="" data-life-badge="" aria-label={lifeOf} className={plate}>
      {body}
    </div>
  )
})
