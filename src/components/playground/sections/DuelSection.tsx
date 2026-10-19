import { useMemo, useState } from 'react'

import { PILE_TITLES, CardBack } from '../../probability/MatDialogs'
import { ResultHero, TurnOrderBanner } from '../../duel/DuelBanner'
import { DuelMedal, type MedalTone } from '../../duel/DuelMedal'
import { Button } from '../../ui/Button'
import { DuelTable, type DuelSideView } from '../../duel/DuelTable'
import { TurnDial } from '../../duel/TurnDial'
import { TURN_BANK_MS, type TurnClock } from '../../../app/duel-clock'
import { CardArt } from '../../CardArt'
import { Icon } from '../../ui/Icon'
import { Segmented } from '../../ui/Segmented'
import { cx } from '../../ui/cx'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'
import { sampleDuel } from './duel-sample'

/**
 * El duelo por enlace: cómo se ven los dos campos. Las tres variantes son las que se ofrecen para el celular; en una
 * ventana ancha se ven con las medidas de escritorio. Para verlas como en el celular, achicá la ventana a menos de 1100 px.
 */
export function DuelSection() {
  const duel = useMemo(sampleDuel, [])
  const [view, setView] = useState<'mine' | 'theirs'>('mine')
  const [open, setOpen] = useState(false)

  return (
    <SpecimenGrid min="24rem">
      <Specimen
        title="A · Todo junto"
        layout="column"
        className="col-span-full"
        note={<>La mesa real: el rival arriba y espejado, las Zonas Extra compartidas en el medio, vos abajo. Archivo: <Tag>duel/DuelTable.tsx</Tag></>}
      >
        <DuelTable mine={duel.mine} theirs={duel.theirs} turn="theirs" />
      </Specimen>

      <Specimen
        title="B · Tira del rival"
        layout="column"
        note="Tu campo entero y el del rival en una tira de resumen; al tocarla se abre su campo arriba del tuyo."
      >
        <RivalStrip side={duel.theirs} open={open} onToggle={() => setOpen((value) => !value)} />
        <DuelTable mine={duel.mine} theirs={duel.theirs} show={open ? 'both' : 'mine'} />
      </Specimen>

      <Specimen
        title="C · Alternar"
        layout="column"
        note="Un campo por vez, con una pestaña para pasar del tuyo al del rival."
      >
        <Segmented
          label="Qué campo ver"
          variant="track"
          value={view}
          onChange={setView}
          options={[
            { value: 'mine', label: 'Mi campo' },
            { value: 'theirs', label: 'Campo rival' },
          ]}
          fullWidth
        />
        <DuelTable mine={duel.mine} theirs={duel.theirs} show={view} turn={view} />
      </Specimen>

      <TurnDialSamples />

      <BannerSamples />
    </SpecimenGrid>
  )
}

/** Los estados del reloj de turnos, quietos (sin correr): lo que se ve con cada tiempo y de quién es el turno. */
const DIAL_SAMPLES: Array<{ label: string; owner: 0 | 1; left: number; other: number }> = [
  { label: 'Tu turno, entero', owner: 0, left: TURN_BANK_MS, other: TURN_BANK_MS },
  { label: 'Turno del rival, a la mitad', owner: 1, left: TURN_BANK_MS / 2, other: 270_000 },
  { label: 'Faltan 20 s: parpadea en rojo', owner: 0, left: 20_000, other: 150_000 },
  { label: 'En cero: sin círculo, 0:00 en rojo', owner: 0, left: 0, other: 90_000 },
]

/** El reloj de turnos: el círculo que se vacía (violeta si el turno es tuyo, ámbar si es del rival), el tiempo del otro debajo, y el parpadeo rojo del final. */
function TurnDialSamples() {
  return (
    <Specimen
      title="E · Reloj de turnos"
      layout="column"
      className="col-span-full"
      note={
        <>
          5 minutos por jugador, y 2 más cada vez que el rival pasa el turno. Va en el centro del campo, entre las dos Zonas Extra (<Tag>duel.clock</Tag> de <Tag>PracticeMat</Tag>). Archivo: <Tag>duel/TurnDial.tsx</Tag>; la cuenta, <Tag>app/duel-clock.ts</Tag>.
        </>
      }
    >
      <div className="flex flex-wrap items-start justify-center gap-8 py-4">
        {DIAL_SAMPLES.map((sample) => {
          const clock: TurnClock = { banks: sample.owner === 0 ? [sample.left, sample.other] : [sample.other, sample.left], running: null, at: 0, span: TURN_BANK_MS }

          return (
            <div key={sample.label} className="grid w-36 justify-items-center gap-2 text-center">
              <div className="size-28 rounded-card border border-border-subtle">
                <TurnDial clock={clock} owner={sample.owner} me={0} names={['Vos', 'Rival']} />
              </div>
              <Tag>{sample.label}</Tag>
            </div>
          )
        })}
      </div>
    </Specimen>
  )
}

const MEDALS: Array<{ tone: MedalTone; label: string; numeral?: string; icon?: 'trophy' | 'flag' | 'swap' }> = [
  { tone: 'first', label: 'first · vas primero', numeral: '1' },
  { tone: 'second', label: 'second · vas segundo', numeral: '2' },
  { tone: 'win', label: 'win · ganaste', icon: 'trophy' },
  { tone: 'lose', label: 'lose · perdiste', icon: 'flag' },
  { tone: 'draw', label: 'draw · empate', icon: 'swap' },
]

/** Los carteles 3D del duelo: la medalla en sus cinco colores, el final (ganar pesa más que perder) y el cartel del comienzo, que se ve dos segundos y se va. */
function BannerSamples() {
  const [run, setRun] = useState(0)
  const [first, setFirst] = useState<boolean | null>(null)

  return (
    <Specimen
      title="D · Carteles del duelo"
      layout="column"
      className="col-span-full"
      note={
        <>
          La medalla 3D (<Tag>DuelMedal</Tag>, una pila de discos con aro y disco) y los carteles que la usan: el del comienzo (<Tag>TurnOrderBanner</Tag>, para los dos) y el del final (<Tag>ResultHero</Tag>, en la tarjeta del resultado y para quien mira). El color del metal dice qué pasó; con <Tag>prefers-reduced-motion</Tag> quedan quietos. Archivos: <Tag>duel/DuelMedal.tsx</Tag>, <Tag>duel/DuelBanner.tsx</Tag>.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon="refresh" onClick={() => setRun((count) => count + 1)}>
          Repetir las animaciones
        </Button>
        <Button variant="secondary" onClick={() => setFirst(true)}>
          Cartel: vas primero
        </Button>
        <Button variant="secondary" onClick={() => setFirst(false)}>
          Cartel: vas segundo
        </Button>
      </div>
      <div key={run} className="grid gap-8 py-4">
        <div className="flex flex-wrap items-start justify-center gap-10">
          {MEDALS.map((medal) => (
            <div key={medal.tone} className="grid justify-items-center gap-2">
              <DuelMedal tone={medal.tone} size="md" numeral={medal.numeral} icon={medal.icon} />
              <Tag>{medal.label}</Tag>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] justify-items-center gap-6">
          <ResultHero tone="win" icon="trophy" title="¡Ganaste!" reason="Beto se rindió." />
          <ResultHero tone="lose" icon="flag" title="Perdiste" reason="Te rendiste." />
          <ResultHero tone="draw" icon="swap" title="Empate" reason="Los dos se quedaron sin puntos de vida." />
        </div>
      </div>
      {first !== null ? <TurnOrderBanner key={String(first)} first={first} rival="Beto" onDone={() => setFirst(null)} /> : null}
    </Specimen>
  )
}

/** Resumen del rival en una línea (cuántas cartas tiene en cada lado) con sus monstruos en miniatura; al tocarla se abre su campo. */
function RivalStrip({ side, open, onToggle }: { side: DuelSideView; open: boolean; onToggle: () => void }) {
  const { state } = side
  const counts: [string, number][] = [
    [PILE_TITLES.hand, state.hand.length],
    [PILE_TITLES.deck, state.deck.length],
    [PILE_TITLES.extra, state.extra.length],
    [PILE_TITLES.gy, state.gy.length],
    [PILE_TITLES.banished, state.banished.length],
  ]

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="grid w-full gap-1.5 rounded-card border border-border-subtle bg-card-background/70 px-3 py-2 text-left"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-micro font-extrabold uppercase tracking-[0.06em] text-soft">Rival</span>
        <span className="flex flex-wrap gap-x-2 text-micro tabular-nums text-foreground">
          {counts.map(([label, count]) => (
            <span key={label}>
              {label} {count}
            </span>
          ))}
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} className="shrink-0 text-soft" />
      </span>
      {open ? null : (
        <span className="flex gap-1" aria-hidden="true">
          {state.mz.map((placed, index) => {
            const art = placed ? side.artOf(placed.id) : null

            return (
              <span key={index} className={cx('block aspect-[421/614] w-7 overflow-hidden border border-dashed border-tint/20', placed && 'border-solid')}>
                {placed ? art && placed.pos !== 'set' ? <CardArt remoteUrl={art} name="" className="block h-full w-full object-cover" /> : <CardBack className="h-full" /> : null}
              </span>
            )
          })}
        </span>
      )}
    </button>
  )
}
