import { useEffect, useState } from 'react'

import type { ChainOutcome, ChainStep } from '../../../app/auto/chain-feed'
import { CHAIN_LINGER_MS, chainDwell, chainFeed } from '../../auto/ChainNotice'
import { frameKindOf, type CardFrame } from '../../../app/card-frame'
import { ChainStage, outcomeLabel, type ChainNoticeRow } from '../../auto/ChainNotice'
import { Button } from '../../ui/Button'
import { Specimen, Tag } from '../Specimen'

/** La cadena en grande (K-01 a K-03), con el ritmo de la mesa: los mismos `chainFeed` y `chainDwell` que usa `use-auto-asks.tsx`. */

const art = (id: number) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`

/** Engage! tuya, Ash del rival y tu Called by the Grave, que destierra a Ash y la deja sin efecto (el código del paso es el índice + 1). */
const CARDS: Array<{ name: string; art: string; mine: boolean; frame: CardFrame; outcome?: ChainOutcome }> = [
  { name: 'Sky Striker Mobilize - Engage!', art: art(63166095), mine: true, frame: frameKindOf('spell'), outcome: { kind: 'add', count: 1 } },
  { name: 'Ash Blossom & Joyous Spring', art: art(14558127), mine: false, frame: frameKindOf('effect') },
  { name: 'Called by the Grave', art: art(24224830), mine: true, frame: frameKindOf('spell'), outcome: { kind: 'banish', count: 1 } },
  { name: 'Infinite Impermanence', art: art(10045474), mine: false, frame: frameKindOf('trap') },
  { name: 'Crossout Designator', art: art(65681983), mine: true, frame: frameKindOf('spell') },
]

const link = (index: number): ChainStep => ({ kind: 'chain', at: 0, index, link: { card: null, code: index + 1, mine: CARDS[index]!.mine } })
const at = (kind: ChainStep['kind'], index: number, extra: Partial<ChainStep> = {}): ChainStep => ({ kind, at: 0, index, ...extra })
const solve = (index: number): ChainStep[] => [at('solving', index), at('solved', index, CARDS[index]!.outcome ? { outcome: CARDS[index]!.outcome } : {})]

/** Los pasos como los anota el adaptador: una activación sola, que nadie puede responder; dos; tres (Called by deja a Ash sin efecto mientras se resuelve), cuatro y cinco. */
const RUNS = {
  alone: [link(0), ...solve(0), at('end', -1)],
  two: [link(0), link(1), ...solve(1), ...solve(0), at('end', -1)],
  three: [link(0), link(1), link(2), at('solving', 2), at('disabled', 1, { by: 3 }), at('solved', 2, { outcome: { kind: 'banish', count: 1 } }), ...solve(1), ...solve(0), at('end', -1)],
  four: [link(0), link(1), link(2), link(3), ...solve(3), ...solve(2), ...solve(1), ...solve(0), at('end', -1)],
  five: [link(0), link(1), link(2), link(3), link(4), ...solve(4), ...solve(3), ...solve(2), ...solve(1), ...solve(0), at('end', -1)],
} satisfies Record<string, ChainStep[]>
const RUN_LABELS: Record<keyof typeof RUNS, string> = { alone: 'Una activación sin respuesta', two: 'Cadena de dos', three: 'Cadena de tres', four: 'Cadena de cuatro', five: 'Cadena de cinco' }

/** Hasta dónde se muestra de una vez (como `use-auto-asks.tsx`): lo que no se deja ver solo sale junto con el siguiente. */
const nextCount = (steps: readonly ChainStep[], count: number) => {
  let next = count + 1

  while (next < steps.length && chainDwell(steps, next - 1) === 0) next += 1
  return next
}

function ChainStageSample() {
  const [run, setRun] = useState<{ steps: readonly ChainStep[]; count: number; started: number } | null>(null)
  const [took, setTook] = useState<number | null>(null)
  // Una pregunta del núcleo que no es responder, abierta mientras se encadena: la escena se corre (`away`).
  const [away, setAway] = useState(false)
  const feed = run ? chainFeed(run.steps, run.count) : null

  useEffect(() => {
    if (!run) return
    const end = run.count >= run.steps.length
    const timer = window.setTimeout(
      () => {
        if (end) {
          setTook(Date.now() - run.started)
          setRun(null)
        } else setRun({ ...run, count: nextCount(run.steps, run.count) })
      },
      end ? CHAIN_LINGER_MS : run.count === 0 ? 0 : chainDwell(run.steps, run.count - 1),
    )

    return () => window.clearTimeout(timer)
  }, [run])

  const rows: ChainNoticeRow[] =
    feed?.rows.map((row) => {
      const card = CARDS[row.code - 1]!

      return { number: row.number, mine: card.mine, name: card.name, art: card.art, frame: card.frame, state: row.state, ...(row.by ? { by: row.by } : {}), ...(row.outcome ? { outcome: outcomeLabel(row.outcome) } : {}) }
    }) ?? []
  const start = (steps: ChainStep[]) => {
    setTook(null)
    setRun({ steps, count: 0, started: Date.now() })
  }

  return (
    <Specimen
      title="ChainStage · la cadena en grande"
      layout="column"
      className="col-span-full"
      note={
        <>
          Igual a Master Duel (Gastón: «debemos clonar esto»), todo dibujado por nosotros, sólo al encadenar: cada activación entra grande y derecha con un destello amarillo y cae
          inclinada a su lugar (la última adelante, abajo a la izquierda, a −8°; la anterior arriba a la derecha, a +5°; las de antes, más chicas y más arriba; desde la quinta se van hacia
          arriba). Cada carta entera con su halo blanco y atada por dos esquinas; entre carta y carta, una cadena de metal (sombra, cuerpo y brillo) que cuelga en curva por delante. El
          número, enorme, blanco con contorno y resplandor celestes, de siete segmentos, igual para los dos; el campo de atrás baja y se azula. Con dos o más, «CADENA» destella detrás. El
          nombre va sólo en la carta sin imagen; «Se resuelve del último al primero», sólo para el lector de pantalla. Al empezar a resolverse la escena y el velo se van con un fundido de
          0,2 s y no vuelven: quedan los medallones sobre la mesa (la muestra de la mesa, en Duelo). Con «¿Respondés?» abierto se achica hacia arriba (el número no queda bajo el cartel);
          con una pregunta que no es responder (elegir casilla o cartas, sí o no) se corre y el campo se ve entero. Ritmo (<Tag>chainDwell</Tag>): 0,7 s por eslabón que entra y 0,9 s por cada uno que se resuelve (tres, 4,8 s; sola, 1 s). Sólo <Tag>translate</Tag>, <Tag>rotate</Tag>,{' '}
          <Tag>scale</Tag> y <Tag>opacity</Tag>; con movimiento reducido (la preferencia del sistema) aparece y se va sin moverse ni destellar. No ataja toques. Archivo: <Tag>auto/ChainNotice.tsx</Tag>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(RUNS) as Array<keyof typeof RUNS>).map((name) => (
          <Button key={name} variant="secondary" size="sm" icon={name === 'alone' ? 'play' : 'link'} onClick={() => start(RUNS[name])}>
            {RUN_LABELS[name]}
          </Button>
        ))}
        <Button variant="secondary" size="sm" aria-pressed={away} onClick={() => setAway(!away)}>
          {away ? 'Cerrar la pregunta' : 'Abrir una pregunta'}
        </Button>
        {took !== null ? <Tag>{`Duró ${(took / 1000).toFixed(1)} s, con la salida`}</Tag> : null}
      </div>
      <div className="relative flex h-128 items-center justify-center overflow-hidden border border-border-subtle bg-card-background p-4">
        {feed && rows.length > 0 ? <ChainStage key={run?.started} rows={rows} current={feed.current} done={feed.done} away={away} /> : <p className="m-0 text-micro text-muted">Sin cadena: tocá un botón.</p>}
      </div>
    </Specimen>
  )
}

/** La cadena en grande. */
export function ChainProposalSamples() {
  return <ChainStageSample />
}
