import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { useLifeNumber, useLpDelta } from '../../../app/life-effects'
import { EASE_OUT, animationsOf, cancelWhenDone, prefersReducedMotion } from '../../../app/motion'
import type { PickStat } from '../../../app/field-stats'
import { CardArt } from '../../CardArt'
import { LifeScore } from '../../duel/LifeScore'
import { PLAYER_COLOR } from '../../duel/player-color'
import { LandingBurst, StatTag } from '../../probability/MatFx'
import { Button } from '../../ui/Button'
import { IconButton } from '../../ui/IconButton'
import { Icon } from '../../ui/Icon'
import { cx } from '../../ui/cx'
import { Specimen, Tag } from '../Specimen'
import { CRITICAL_LP, DUST, LIFT_FLIGHT_MS, playChips, playCritical, playHit, playLift, playToday, leaveFrames, type FlightStart } from '../motion-proposal'

/**
 * La propuesta de movimiento: cada muestra pone lo de hoy al lado de lo propuesto, para juzgarlo en movimiento antes de llevar nada a la mesa. Va en su sección (y no dentro del duelo) porque
 * toca el duelo por enlace, «Jugar solo» y el automático a la vez, y porque se borra entera cuando Gastón elija. Los cuadros están en `motion-proposal.ts`.
 */
export function MotionSection() {
  return (
    <div className="grid min-w-0 gap-4">
      <FlightSample />
      <ChipsSample />
      <LifeSample />
    </div>
  )
}

/** Una muestra «Hoy | Propuesta»: «Repetir» corre las dos a la vez y el botón de cada columna, sólo esa. Cada columna recibe cuántas veces se corrió (`run`) y arranca al cambiar. */
function Compare({ today, proposal }: { today: (run: number) => ReactNode; proposal: (run: number) => ReactNode }) {
  const [runs, setRuns] = useState({ today: 0, proposal: 0 })
  const column = (key: 'today' | 'proposal', title: string, body: ReactNode) => (
    <div data-motion-column={key} className="grid min-w-0 content-start gap-2">
      <div className="flex items-center justify-between gap-2">
        <Tag>{title}</Tag>
        <IconButton size="sm" aria-label={`Repetir sólo ${title}`} onClick={() => setRuns((current) => ({ ...current, [key]: current[key] + 1 }))}>
          <Icon name="play" />
        </IconButton>
      </div>
      {body}
    </div>
  )

  return (
    <>
      <Button size="sm" variant="secondary" icon="refresh" className="justify-self-start" onClick={() => setRuns((current) => ({ today: current.today + 1, proposal: current.proposal + 1 }))}>
        Repetir
      </Button>
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-4">
        {column('today', 'Hoy', today(runs.today))}
        {column('proposal', 'Propuesta', proposal(runs.proposal))}
      </div>
    </>
  )
}

const ART = (id: number) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`
const FLYER = { name: 'Ponix', art: ART(14558127) }

/** Lo que lleva a la carta, quieta en su lugar (`to`), a donde estaba (`from`): el corrimiento entre los centros y la escala por el ancho. */
function startOf(from: DOMRect, to: DOMRect): FlightStart {
  return { x: from.left + from.width / 2 - (to.left + to.width / 2), y: from.top + from.height / 2 - (to.top + to.height / 2), scale: from.width / Math.max(1, to.width) }
}

/**
 * El vuelo de una carta de la mano a una zona de monstruo (una invocación).
 * - Para qué: que se sienta que la carta se levanta de la mano y cae en la mesa, no que se desliza.
 * - Hoy: el FLIP derecho de `useCardFlights` (480 ms, `EASE_IN_OUT`, sin subir) y el destello de la invocación (`LandingBurst`), que es el componente real.
 * - Propuesta: cuatro capas, cada una con su animación: lo de afuera hace el camino, sube y se agranda (más cerca) y se aplasta al caer; lo de adentro se inclina con perspectiva
 *   y gira apenas; el brillo (una franja ya dibujada) cruza la carta según la inclinación; la sombra (ya dibujada) se aleja al subir. Lo acompañan el rótulo con el nombre y, al
 *   tocar la casilla, el polvo y el mismo destello de hoy. Dura lo mismo y toca la casilla en el mismo momento (`LANDING_AT`).
 * - Variantes: con rótulo o sin él (`label`); el mismo vuelo sirve de una pila a otra.
 * - Estados: quieta (todas las capas apagadas: la carta se ve como siempre), en vuelo, y con movimiento reducido (un fundido de 150 ms; hoy, nada).
 * - Accesibilidad: todo lo que se mueve es `aria-hidden` y decorativo; lo que pasó lo dice el registro de la mesa.
 * - Hacer: animar sólo `transform`/`translate`/`scale`/`opacity`, cancelar al terminar y no cortar un vuelo en curso. No hacer: escribir `style` en cada cuadro ni animar la sombra
 *   o un `filter`.
 */
function FlightSample() {
  return (
    <Specimen
      title="Vuelo de una carta en 3D"
      layout="column"
      note={
        <>
          De la mano a una zona de monstruo. Hoy la carta se desliza derecha; la propuesta se levanta, se inclina con perspectiva, la cruza un brillo, la sigue su sombra y su nombre, y cae con un golpe (se aplasta y levanta polvo), con el mismo destello de la invocación. Mismo tiempo que hoy (480 ms). Con «Reducir movimiento», un fundido corto. Archivos: <Tag>playground/motion-proposal.ts</Tag> <Tag>app/use-card-flights.ts</Tag>
        </>
      }
    >
      <Compare today={(run) => <FlightStage run={run} mode="today" />} proposal={(run) => <FlightStage run={run} mode="proposal" />} />
    </Specimen>
  )
}

function FlightStage({ run, mode }: { run: number; mode: 'today' | 'proposal' }) {
  const source = useRef<HTMLDivElement | null>(null)
  const slot = useRef<HTMLDivElement | null>(null)
  const path = useRef<HTMLDivElement | null>(null)
  const tilt = useRef<HTMLDivElement | null>(null)
  const gloss = useRef<HTMLSpanElement | null>(null)
  const shadow = useRef<HTMLSpanElement | null>(null)
  const label = useRef<HTMLSpanElement | null>(null)
  const dust = useRef<Array<HTMLSpanElement | null>>([])

  // En la misma fase que el dibujo que monta el destello (su espera arranca con él): la carta sale en el mismo cuadro.
  useLayoutEffect(() => {
    const card = path.current

    // Si la carta todavía vuela, no se corta: se espera a que llegue.
    if (!run || !card || !source.current || !slot.current || animationsOf(card).some((animation) => animation.playState === 'running')) return

    const from = startOf(source.current.getBoundingClientRect(), slot.current.getBoundingClientRect())
    const reduced = prefersReducedMotion()

    if (!reduced) cancelWhenDone(source.current.animate(leaveFrames, { duration: LIFT_FLIGHT_MS + 400, easing: EASE_OUT }))
    if (mode === 'today') playToday(card, from, reduced)
    else playLift({ path: card, tilt: tilt.current!, gloss: gloss.current!, shadow: shadow.current!, label: label.current, dust: dust.current.filter((dot) => dot !== null) }, from, reduced)
  }, [run, mode])

  const art = <CardArt remoteUrl={FLYER.art} name={FLYER.name} className="block h-full w-full object-cover" />

  return (
    // La zona va bajada: la carta sube por encima de ella (con su rótulo) sin que el marco la recorte.
    <div data-motion-stage={mode} className="relative h-64 min-w-0 overflow-hidden rounded-card border border-border-subtle bg-background/60">
      <div className="absolute bottom-3 left-3 grid justify-items-center gap-1">
        <div ref={source} className="relative aspect-[421/614] w-14 overflow-hidden bg-input">
          {art}
        </div>
        <span className="text-micro text-soft">Mano</span>
      </div>
      <div className="absolute right-3 top-20 grid justify-items-center gap-1">
        <div ref={slot} className="relative aspect-[421/614] w-16">
          <span aria-hidden="true" className="absolute inset-0 border border-dashed border-border-subtle" />
          {mode === 'proposal'
            ? DUST.map((_, index) => <span key={index} ref={(node) => void (dust.current[index] = node)} aria-hidden="true" className="absolute -bottom-0.5 left-1/2 -ml-1 size-2 rounded-full bg-foreground/60 opacity-0" />)
            : null}
          <div ref={path} aria-hidden="true" className="absolute inset-0">
            {mode === 'proposal' ? <span ref={shadow} className="absolute inset-0 bg-radial from-black/70 to-transparent to-70% opacity-0" /> : null}
            <div ref={tilt} className="absolute inset-0 overflow-hidden bg-input">
              {art}
              {mode === 'proposal' ? <span ref={gloss} className="pointer-events-none absolute -inset-1/2 rotate-12 bg-linear-to-r from-transparent via-white/55 to-transparent opacity-0" /> : null}
            </div>
            {mode === 'proposal' ? (
              <span ref={label} className="absolute inset-x-0 bottom-full mx-auto mb-1.5 w-fit whitespace-nowrap rounded-tag bg-background/90 px-1.5 py-0.5 text-micro font-bold text-foreground opacity-0 ring-1 ring-border-subtle">
                {FLYER.name}
              </span>
            ) : null}
          </div>
          {run > 0 ? <LandingBurst key={run} tone="normal" flies /> : null}
        </div>
        <span className="text-micro text-soft">Zona de monstruo</span>
      </div>
    </div>
  )
}

/** Tres monstruos de muestra: uno con Nivel, un Xyz con Rango y un Link (sin DEF). */
const SUMMONED: ReadonlyArray<{ name: string; art: string; badge: string; stat: PickStat }> = [
  { name: 'Ponix', art: ART(14558127), badge: '★ 4', stat: { attack: 1900, defense: 1000 } },
  { name: 'Xyz de Rango 4', art: ART(84013237), badge: 'R 4', stat: { attack: 2500, defense: 2000 } },
  { name: 'Link-2', art: ART(97268402), badge: 'LINK 2', stat: { attack: 1500, defense: null } },
]

/**
 * Las fichas de un monstruo que se invoca: su Nivel (o Rango, o LINK) arriba y su ATK/DEF abajo.
 * - Para qué: que al caer la carta se lea de un vistazo qué es y cuánto pega, sin abrirla.
 * - Hoy: sólo el ATK/DEF (`StatTag`, el componente real), que se funde cuando la carta toca su casilla. El Nivel no se ve en el campo.
 * - Propuesta: el ATK/DEF (la misma etiqueta) sube desde abajo y una ficha nueva con el Nivel, el Rango o el LINK baja desde arriba, cada una con un rebote corto (`EASE_SNAP`),
 *   escalonadas 70 ms, cuando la carta toca su casilla.
 * - Variantes: Nivel (★), Rango (R) y LINK; boca abajo, ninguna.
 * - Estados: entrando, quietas, y con movimiento reducido (un fundido de 150 ms).
 * - Accesibilidad: decorativas (`aria-hidden`): el Nivel tendría que sumarse al nombre de la carta, como el ATK/DEF (`statLabel`).
 * - Hacer: que no cambien la caja de la carta ni de la casilla. No hacer: tapar el arte entero ni animar su fondo o su borde.
 */
function ChipsSample() {
  return (
    <Specimen
      title="Fichas al invocar"
      layout="column"
      note={
        <>
          La carta entra y, cuando toca su casilla, sus fichas. Hoy el ATK/DEF se funde; la propuesta suma el Nivel, el Rango o el LINK arriba, y las dos fichas entran con un rebote corto, una tras otra. Archivos: <Tag>probability/MatFx.tsx</Tag> (<Tag>StatTag</Tag>) <Tag>playground/motion-proposal.ts</Tag>
        </>
      }
    >
      <Compare today={(run) => <ChipsRow run={run} mode="today" />} proposal={(run) => <ChipsRow run={run} mode="proposal" />} />
    </Specimen>
  )
}

function ChipsRow({ run, mode }: { run: number; mode: 'today' | 'proposal' }) {
  const row = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!run || mode !== 'proposal' || !row.current) return

    playChips(
      [...row.current.querySelectorAll<HTMLElement>('[data-chip]')].map((element) => ({ element, from: element.dataset.chip === 'top' ? 'top' : 'bottom' })),
      prefersReducedMotion(),
    )
  }, [run, mode])

  return (
    <div ref={row} data-motion-stage={mode} className="flex min-w-0 flex-wrap justify-center gap-3 rounded-card border border-border-subtle bg-background/60 px-3 py-5">
      {SUMMONED.map((monster) => (
        <div key={monster.name} className="relative aspect-[421/614] w-16 bg-input">
          {/* La carta entra con el `card-in` de siempre; sus fichas, cuando toca la casilla. */}
          <div key={run} className="absolute inset-0 overflow-hidden motion-safe:animate-card-in">
            <CardArt remoteUrl={monster.art} name={monster.name} className="block h-full w-full object-cover" />
          </div>
          {mode === 'today' ? (
            <StatTag key={`stat-${run}`} stat={monster.stat} />
          ) : (
            <>
              <span aria-hidden="true" data-chip="top" className="pointer-events-none absolute inset-x-0 top-0.5 z-11 mx-auto block w-fit whitespace-nowrap rounded-tag bg-background/85 px-1 text-micro font-extrabold tabular-nums text-info ring-1 ring-border-subtle">
                {monster.badge}
              </span>
              <span aria-hidden="true" data-chip="bottom" className="pointer-events-none absolute inset-x-0 bottom-0 z-11 h-5">
                <StatTag stat={monster.stat} />
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

/** Lo que van marcando las vidas del rival con cada «Repetir»: bajan de a 1500 hasta 0 (pasando por la zona crítica) y vuelven a empezar. */
const LIFE_STEPS = [8000, 6500, 5000, 3500, 2000, 500, 0]

/**
 * El golpe de vidas.
 * - Para qué: que una pérdida de vidas se sienta como un golpe y que las vidas bajas se noten sin leer el número.
 * - Hoy: `LifeScore` (el componente real): cuenta, se tiñe de rojo un instante, el «−1500» se queda abajo y se funde, y la casilla se sacude (`sacudir`).
 * - Propuesta: la casilla se sacude, el número se infla y vuelve, se enciende un fogonazo rojo detrás (capa ya dibujada) y el «−1500» sube desde el número y se funde. En 2000 o menos
 *   el número queda rojo y detrás late un resplandor (dos golpes cada 1,1 s, sólo `opacity`).
 * - Variantes: tus vidas o las del rival (su color en el nombre); una ganancia no se muestra en esta muestra.
 * - Estados: quieto, golpe, crítico (latiendo), en cero, y con movimiento reducido (sólo el «−1500», fundido y quieto; crítico, el resplandor quieto).
 * - Accesibilidad: el número se lee entero en el nombre del grupo («Puntos de vida de Rival: 2000»); el fogonazo, el latido y el «−N» son decorativos.
 * - Hacer: que el número cuente escribiendo su texto (`useLifeNumber`), sin redibujar la casilla. No hacer: transicionar su color ni animar una sombra o un `filter`.
 */
function LifeSample() {
  return (
    <Specimen
      title="Golpe de vidas"
      layout="column"
      note={
        <>
          Cada «Repetir» le saca 1500 al rival. La propuesta pega más fuerte (el número se infla, un fogonazo y el «−1500» sube) y en 2000 o menos el número queda rojo y late. Archivos: <Tag>duel/LifeScore.tsx</Tag> <Tag>app/life-effects.ts</Tag> <Tag>playground/motion-proposal.ts</Tag>
        </>
      }
    >
      <Compare
        today={(run) => (
          <LifeStage mode="today">
            <LifeScore name="Rival" life={LIFE_STEPS[run % LIFE_STEPS.length]!} size="lg" />
          </LifeStage>
        )}
        proposal={(run) => (
          <LifeStage mode="proposal">
            <LifeHit name="Rival" life={LIFE_STEPS[run % LIFE_STEPS.length]!} />
          </LifeStage>
        )}
      />
    </Specimen>
  )
}

function LifeStage({ mode, children }: { mode: 'today' | 'proposal'; children: ReactNode }) {
  return (
    <div data-motion-stage={mode} className="grid min-h-32 min-w-0 place-items-center rounded-card border border-border-subtle bg-background/60 px-3 py-6">
      {children}
    </div>
  )
}

/** Las vidas de la propuesta: el mismo marcador plano que `LifeScore` (el nombre en su color y el número grande), con el golpe y el estado crítico de `motion-proposal.ts`. */
function LifeHit({ name, life }: { name: string; life: number }) {
  const box = useRef<HTMLDivElement | null>(null)
  const punch = useRef<HTMLSpanElement | null>(null)
  const number = useRef<HTMLSpanElement | null>(null)
  const flash = useRef<HTMLSpanElement | null>(null)
  const glow = useRef<HTMLSpanElement | null>(null)
  const floater = useRef<HTMLSpanElement | null>(null)
  const shown = useLifeNumber(life, number)
  const change = useLpDelta(life)
  const critical = life > 0 && life <= CRITICAL_LP

  useLayoutEffect(() => {
    if (!change || change.delta >= 0 || !box.current || !punch.current || !flash.current || !floater.current) return

    const hit = playHit({ box: box.current, number: punch.current, flash: flash.current, floater: floater.current }, prefersReducedMotion())

    return () => hit.forEach((animation) => animation.cancel())
  }, [change])

  useEffect(() => {
    if (!critical || !glow.current || prefersReducedMotion()) return

    const beat = playCritical(glow.current)

    return () => beat.cancel()
  }, [critical])

  return (
    <div ref={box} role="group" aria-label={`Puntos de vida de ${name}: ${life}`} className="relative grid justify-items-start gap-1">
      <span aria-hidden="true" className={cx('text-micro font-bold uppercase leading-none tracking-wider', PLAYER_COLOR.theirs.text)}>
        {name}
      </span>
      <span ref={punch} aria-hidden="true" className="relative">
        <span ref={glow} className={cx('pointer-events-none absolute -inset-x-6 -inset-y-4 bg-radial from-danger/55 to-transparent to-70% opacity-0', critical && 'motion-reduce:opacity-60')} />
        <span ref={flash} className="pointer-events-none absolute -inset-x-8 -inset-y-5 bg-radial from-danger-soft/70 to-transparent to-70% opacity-0" />
        <span ref={number} className={cx('relative text-stat font-bold leading-none tabular-nums', critical || life === 0 ? 'text-danger-soft' : 'text-foreground')}>
          {shown}
        </span>
      </span>
      <span ref={floater} aria-hidden="true" className="pointer-events-none absolute left-0 top-full mt-1 text-lead font-extrabold leading-none tabular-nums text-danger-soft opacity-0">
        {change && change.delta < 0 ? `−${Math.abs(change.delta)}` : ''}
      </span>
    </div>
  )
}
