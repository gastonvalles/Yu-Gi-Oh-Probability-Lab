import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { EASE_OUT, animationsOf, cancelWhenDone, prefersReducedMotion } from '../../../app/motion'
import type { PickStat } from '../../../app/field-stats'
import { CardArt } from '../../CardArt'
import { LifeScore } from '../../duel/LifeScore'
import { LandingBurst, StatTag } from '../../probability/MatFx'
import { Button } from '../../ui/Button'
import { IconButton } from '../../ui/IconButton'
import { Icon } from '../../ui/Icon'
import { Specimen, Tag } from '../Specimen'
import { DUST, LIFT_FLIGHT_MS, playLift, playToday, leaveFrames, type FlightStart } from '../motion-proposal'

/**
 * La propuesta de movimiento: cada muestra pone lo de hoy al lado de lo propuesto, para juzgarlo en movimiento antes de llevar nada a la mesa. Va en su sección (y no dentro del duelo) porque
 * toca el duelo por enlace, «Jugar solo» y el automático a la vez, y porque se borra entera cuando Gastón elija. Los cuadros están en `motion-proposal.ts`. El golpe de vidas y las fichas al
 * invocar ya pasaron a la mesa: sus muestras son las de producción, solas.
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

/** Monstruos de muestra: uno con Nivel, un Xyz con Rango, un Link (sin DEF) y uno sin ficha (lo que no se sabe con certeza, como un Pendulum: se calla). */
const SUMMONED: ReadonlyArray<{ name: string; art: string; stat: PickStat }> = [
  { name: 'Ponix', art: ART(14558127), stat: { attack: 1900, defense: 1000, badge: { kind: 'level', value: 4 } } },
  { name: 'Xyz de Rango 4', art: ART(84013237), stat: { attack: 2500, defense: 2000, badge: { kind: 'rank', value: 4 } } },
  { name: 'Link-2', art: ART(97268402), stat: { attack: 1500, defense: null, badge: { kind: 'link', value: 2 } } },
  { name: 'Sin ficha', art: ART(14558127), stat: { attack: 1800, defense: 1200 } },
]

/**
 * Las fichas de un monstruo que llega a su casilla: el `StatTag` real, con su Nivel (★), Rango (R) o LINK arriba y su ATK/DEF abajo. Lo de la animación, la posición y lo que se calla está
 * en el comentario de `StatTag`; «Repetir» vuelve a montar las cartas.
 */
function ChipsSample() {
  const [run, setRun] = useState(0)

  return (
    <Specimen
      title="Fichas al invocar"
      layout="column"
      note={
        <>
          Cuando la carta toca su casilla, el Nivel, el Rango o el LINK baja desde arriba y, 70 ms después, el ATK/DEF sube desde abajo, con un pop corto. Sin dato seguro, sin ficha. Con «Reducir movimiento», quietas. Archivos: <Tag>probability/MatFx.tsx</Tag> (<Tag>StatTag</Tag>) <Tag>app/field-stats.ts</Tag>
        </>
      }
    >
      <Button size="sm" variant="secondary" icon="refresh" className="justify-self-start" onClick={() => setRun((current) => current + 1)}>
        Repetir
      </Button>
      <div data-motion-stage="chips" className="flex min-w-0 flex-wrap justify-center gap-3 rounded-card border border-border-subtle bg-background/60 px-3 py-5">
        {SUMMONED.map((monster) => (
          // La carta entra con el `card-in` de siempre; sus fichas, cuando toca la casilla.
          <div key={`${monster.name}-${run}`} className="relative aspect-[421/614] w-16 bg-input">
            <div className="absolute inset-0 overflow-hidden motion-safe:animate-card-in">
              <CardArt remoteUrl={monster.art} name={monster.name} className="block h-full w-full object-cover" />
            </div>
            <StatTag stat={monster.stat} />
          </div>
        ))}
      </div>
    </Specimen>
  )
}

/** Lo que van marcando las vidas del rival con cada «Repetir»: bajan de a 1500 hasta 0 (pasando por la zona crítica) y vuelven a empezar. */
const LIFE_STEPS = [8000, 6500, 5000, 3500, 2000, 500, 0]

/**
 * El golpe de vidas, ya en la mesa: es el `LifeScore` real (el golpe y el crítico están en su comentario y en `app/life-hit.ts`). Cada «Repetir» le saca 1500 al rival; la vuelta de 0 a 8000
 * (la revancha) no golpea.
 */
function LifeSample() {
  const [run, setRun] = useState(0)

  return (
    <Specimen
      title="Golpe de vidas"
      layout="column"
      note={
        <>
          Cada «Repetir» le saca 1500 al rival: el número se infla, un fogonazo rojo y el «−1500» sube; en 2000 o menos el número queda rojo y late. Archivos: <Tag>duel/LifeScore.tsx</Tag> <Tag>app/life-hit.ts</Tag>
        </>
      }
    >
      <Button size="sm" variant="secondary" icon="refresh" className="justify-self-start" onClick={() => setRun((current) => current + 1)}>
        Repetir
      </Button>
      <div data-motion-stage="life" className="grid min-h-32 min-w-0 place-items-center rounded-card border border-border-subtle bg-background/60 px-3 py-6">
        <LifeScore name="Rival" life={LIFE_STEPS[run % LIFE_STEPS.length]!} size="lg" />
      </div>
    </Specimen>
  )
}
