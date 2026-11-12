import { useEffect, useState } from 'react'

import { CHAIN_LINGER_MS, chainDwell, chainFeed, type ChainOutcome, type ChainStep } from '../../../app/auto/chain-feed'
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
]

const link = (index: number): ChainStep => ({ kind: 'chain', at: 0, index, link: { card: null, code: index + 1, mine: CARDS[index]!.mine } })
const at = (kind: ChainStep['kind'], index: number, extra: Partial<ChainStep> = {}): ChainStep => ({ kind, at: 0, index, ...extra })
const solve = (index: number): ChainStep[] => [at('solving', index), at('solved', index, CARDS[index]!.outcome ? { outcome: CARDS[index]!.outcome } : {})]

/** Los pasos como los anota el adaptador: la cadena de tres (Called by deja a Ash sin efecto mientras se resuelve) y una activación sola, que nadie puede responder. */
const RUNS = {
  three: [link(0), link(1), link(2), at('solving', 2), at('disabled', 1, { by: 3 }), at('solved', 2, { outcome: { kind: 'banish', count: 1 } }), ...solve(1), ...solve(0), at('end', -1)],
  alone: [link(0), ...solve(0), at('end', -1)],
} satisfies Record<string, ChainStep[]>

/** Hasta dónde se muestra de una vez (como `use-auto-asks.tsx`): lo que no se deja ver solo sale junto con el siguiente. */
const nextCount = (steps: readonly ChainStep[], count: number) => {
  let next = count + 1

  while (next < steps.length && chainDwell(steps, next - 1) === 0) next += 1
  return next
}

function ChainStageSample() {
  const [run, setRun] = useState<{ steps: readonly ChainStep[]; count: number; started: number } | null>(null)
  const [took, setTook] = useState<number | null>(null)
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
          Como en Master Duel: cada activación entra grande y se acomoda inclinada (entre 3 y 7°), con su número enorme en el color de su dueño y el borde del color de su tipo; un eslabón la
          une con la anterior. Se resuelve del último al primero: la carta va al centro y crece; cuando empieza la siguiente, se va hacia arriba y su eslabón se corta. La que quedó sin efecto
          se tacha antes y se queda 1,6 s más en el centro. Abajo, una sola línea: armando, «Se resuelve del último al primero»; resolviendo, qué pasó. Una activación sola entra igual con su
          «1». Ritmo (<Tag>chainDwell</Tag>): 0,7 s por eslabón que entra y 0,9 s por cada uno que se resuelve (tres, 4,8 s; sola, 1,2 s). Sólo <Tag>translate</Tag>, <Tag>rotate</Tag>,{' '}
          <Tag>scale</Tag> y <Tag>opacity</Tag>; con movimiento reducido (la preferencia del sistema) aparece y se va sin moverse. No ataja toques. Archivo: <Tag>auto/ChainNotice.tsx</Tag>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon="link" onClick={() => start(RUNS.three)}>
          Cadena de tres
        </Button>
        <Button variant="secondary" size="sm" icon="play" onClick={() => start(RUNS.alone)}>
          Una activación sin respuesta
        </Button>
        {took !== null ? <Tag>{`Duró ${(took / 1000).toFixed(1)} s, con la salida`}</Tag> : null}
      </div>
      <div className="relative flex h-128 items-center justify-center overflow-hidden border border-border-subtle bg-card-background p-4">
        {feed && rows.length > 0 ? <ChainStage key={run?.started} rows={rows} current={feed.current} done={feed.done} /> : <p className="m-0 text-micro text-muted">Sin cadena: tocá un botón.</p>}
      </div>
    </Specimen>
  )
}

/** La cadena en grande. */
export function ChainProposalSamples() {
  return <ChainStageSample />
}
