import { useEffect, useRef, useState } from 'react'

import type { ChainOutcome, ChainRowState } from '../../../app/auto/chain-feed'
import { play, resolveSchedule, type LinkFate } from '../../../app/chain-motion'
import { t } from '../../../i18n'
import { CardArt } from '../../CardArt'
import { ChainLessonBody } from '../../auto/ChainLesson'
import { ChainLine } from '../../auto/ChainNotice'
import { CHIP_ICON, outcomeChip, STATE_TONE, stateLabel, type ChainNoticeRow } from '../../auto/chain-parts'
import { ChainBadge, ChainTrace } from '../../probability/MatFx'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Segmented } from '../../ui/Segmented'
import type { Tone } from '../../ui/tone'
import { Specimen, Tag } from '../Specimen'

/** La cadena: los eslabones y el trazo animados (`ChainLinks`, `ChainTrace`), sus chips (estado y, resuelta, lo que hizo) y la hoja «Cómo se resuelve» (`ChainLesson`). */

const art = (id: number) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`

/**
 * La cadena de muestra (la del catálogo): Branded Fusion, Ash del rival y el CL3 que la para. Negada: PSY-Framegear Gamma niega su activación; sin efecto: Called by the Grave niega su efecto.
 * `outcome`: lo que dice el núcleo real al resolverse (`auto-chain-feed.slow.test.ts`): Gamma se Invoca con Psy-Frame Driver, Called by destierra a Ash; Branded Fusion manda materiales al
 * Cementerio e Invoca a la vez, así que se calla («Resuelta»).
 */
const CARDS: Record<'negated' | 'disabled', Array<{ name: string; art: string; mine: boolean; outcome?: ChainOutcome }>> = {
  negated: [
    { name: 'Branded Fusion', art: art(44362883), mine: true },
    { name: 'Ash Blossom & Joyous Spring', art: art(14558127), mine: false },
    { name: 'PSY-Framegear Gamma', art: art(38814750), mine: true, outcome: { kind: 'summon', count: 2 } },
  ],
  disabled: [
    { name: 'Branded Fusion', art: art(44362883), mine: true },
    { name: 'Ash Blossom & Joyous Spring', art: art(14558127), mine: false },
    { name: 'Called by the Grave', art: art(24224830), mine: true, outcome: { kind: 'banish', count: 1 } },
  ],
}
type Variant = keyof typeof CARDS

const voidedState = (state: ChainRowState) => state === 'negated' || state === 'disabled'

/** El cuarto eslabón posible (el prototipo llega a cuatro): Infinite Impermanence del rival. */
const FOURTH: { name: string; art: string; mine: boolean; outcome?: ChainOutcome } = { name: 'Infinite Impermanence', art: art(10045474), mine: false }
/** Dónde está cada carta de la cadena en el campo de muestra (casilla de 0 a 34, siete por fila, el rival arriba): tu Mágica, el Cementerio del rival, otra Mágica tuya y una Trampa del rival. */
const SPOTS = [31, 0, 30, 4]
type Ending = Variant | 'solved'

/**
 * La cadena animada con el trazo en la mesa: «Encadenar» suma un eslabón (hasta cuatro), «Resolver» la resuelve de atrás para adelante con el guion de `resolveSchedule` (750 ms por eslabón y 200
 * de cierre: 2,45 s con tres) y «Repetir» la arma y la resuelve de nuevo. La línea es la del celular (`ChainLine`, 96 px de alto) y el campo, un tapete de siete por cinco de arriba o en 3D.
 */
function ChainMotionSample() {
  const [rows, setRows] = useState<ChainNoticeRow[]>([])
  const [done, setDone] = useState(false)
  const [focus, setFocus] = useState(0)
  const [ending, setEnding] = useState<Ending>('negated')
  const [still, setStill] = useState(false)
  const [tilted, setTilted] = useState(false)
  const [slot, setSlot] = useState<HTMLSpanElement | null>(null)
  const run = useRef<{ cancel: () => void } | null>(null)
  const busy = rows.some((row) => row.state !== 'chained')
  const cardOf = (index: number) => (index < 3 ? CARDS[ending === 'solved' ? 'disabled' : ending][index]! : FOURTH)

  const rowOf = (index: number, state: ChainRowState, count: number): ChainNoticeRow => {
    const card = cardOf(index)
    const by = voidedState(state) && count > index + 1 ? { by: index + 2 } : {}

    return { number: index + 1, who: card.mine ? t('duel.bar.you') : t('duel.bar.rival'), mine: card.mine, name: card.name, art: card.art, state, ...by, ...(state === 'solved' && card.outcome ? { outcome: outcomeChip(card.outcome) } : {}) }
  }
  const reset = () => {
    run.current?.cancel()
    setRows([])
    setDone(false)
  }
  const chain = () => {
    setFocus(rows.length)
    setRows([...rows, rowOf(rows.length, 'chained', rows.length + 1)])
  }
  const resolve = (count: number) => {
    const fates: LinkFate[] = Array.from({ length: count }, (_, index) => (index === 1 && count > 2 && ending !== 'solved' ? ending : 'solved'))

    run.current = play(resolveSchedule(fates).steps, (step) => {
      if ('done' in step) return setDone(true)
      setFocus(step.link - 1)
      setRows((now) => now.map((row) => (row.number === step.link ? rowOf(step.link - 1, step.state, now.length) : row)))
    })
  }
  const replay = () => {
    reset()
    // Se arma de a un eslabón y, armada, se resuelve («Reiniciar» corta lo que falte).
    const steps = [...[0, 1, 2].map((index) => ({ at: index * 500 + 50, index })), { at: 1800, index: -1 }]

    run.current = play(steps, ({ index }) => {
      if (index < 0) return resolve(3)
      setFocus(index)
      setRows((now) => [...now, rowOf(index, 'chained', 3)])
    })
  }

  useEffect(() => () => run.current?.cancel(), [])

  return (
    <Specimen
      title="ChainLinks y ChainTrace · la cadena animada"
      layout="column"
      className="col-span-full"
      note={
        <>
          Cada efecto es un eslabón hexagonal recto (<Tag>clip-path</Tag> fijo) entrelazado con el siguiente, de izquierda a derecha CL1, CL2…; en la mesa, las cartas de la cadena unidas por un
          trazo recto naranja numerado, un <Tag>span</Tag> rotado que crece con <Tag>scaleX</Tag> y se mide con <Tag>offsetLeft</Tag>/<Tag>offsetTop</Tag> en el plano del campo (en 3D se inclina con
          él). Armar: el eslabón encaja (entra de 40 px, se pasa 3 y se traba, 300 ms), la carta se levanta y el trazo crece. Resolver, de atrás para adelante, 750 ms por eslabón: se ilumina en lima y
          sube 4 px, la cadena se tensa hacia él (7 px), la carta ejecuta y cambia el estado (320 ms), y se suelta (480 ms): se parte en dos mitades que se separan y se funden; lo negado, en rojo tras
          su tajo; «sin efecto», apagado y deslizándose abajo; su trazo se apaga. Al final lo que queda se disuelve (200 ms): 2,45 s con tres. Sólo <Tag>transform</Tag> y <Tag>opacity</Tag>; «Sin
          movimiento» (como con la preferencia del sistema): nada se mueve ni se va, cambian el color y el texto, y lo dice la línea. Archivos: <Tag>auto/chain-parts.tsx</Tag>,{' '}
          <Tag>probability/MatFx.tsx</Tag> y <Tag>app/chain-motion.ts</Tag>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon="link" disabled={busy || done || rows.length >= 4} onClick={chain}>
          Encadenar
        </Button>
        <Button variant="secondary" size="sm" icon="play" disabled={busy || done || rows.length === 0} onClick={() => resolve(rows.length)}>
          Resolver
        </Button>
        <Button variant="tertiary" size="sm" icon="refresh" onClick={replay}>
          Repetir
        </Button>
        <Button variant="tertiary" size="sm" onClick={reset}>
          Reiniciar
        </Button>
        <Button variant="tertiary" size="sm" aria-pressed={still} onClick={() => (reset(), setStill((value) => !value))}>
          Sin movimiento
        </Button>
        <Button variant="tertiary" size="sm" aria-pressed={tilted} onClick={() => setTilted((value) => !value)}>
          3D
        </Button>
        <Segmented
          label="Qué pasa con CL2"
          value={ending}
          onChange={(value) => (reset(), setEnding(value))}
          options={[
            { value: 'negated', label: 'Negada' },
            { value: 'disabled', label: 'Sin efecto' },
            { value: 'solved', label: 'Todo resuelve' },
          ]}
        />
      </div>
      <div className="grid gap-3 min-[1101px]:grid-cols-[minmax(0,1fr)_24rem] min-[1101px]:items-start">
        <div className="mx-auto w-full max-w-xl">
          <div className={cx('relative isolate grid aspect-[7/5] grid-cols-[minmax(0,0.6857fr)_repeat(5,minmax(0,1fr))_minmax(0,0.6857fr)] grid-rows-5 gap-1 [transform-origin:50%_100%]', tilted && '[transform:perspective(60rem)_rotateX(26deg)]')}>
            {Array.from({ length: 35 }, (_, cell) => {
              const index = SPOTS.indexOf(cell)
              const row = index >= 0 ? rows[index] : undefined
              const card = row ? cardOf(index) : null

              return (
                <div key={cell} className={cx('relative min-h-0 border', cell < 14 ? 'border-info/40' : 'border-accent/40')}>
                  {row && card ? (
                    <>
                      <span className="absolute inset-[8%] overflow-hidden bg-input">
                        <CardArt remoteUrl={card.art} name={card.name} className={cx('block h-full w-full object-cover', !card.mine && 'rotate-180')} />
                      </span>
                      <ChainBadge link={{ numbers: [row.number], mine: row.mine, fromHand: false, ...(voidedState(row.state) ? { voided: { state: row.state as 'negated' | 'disabled' } } : {}) }} className="left-0 top-0" />
                    </>
                  ) : null}
                </div>
              )
            })}
            <span ref={setSlot} aria-hidden="true" className="pointer-events-none absolute inset-0 z-12" />
          </div>
          <ChainTrace rows={rows} done={done} slot={slot} still={still} />
        </div>
        <div className="h-24">{rows.length > 0 ? <ChainLine key={`${ending}-${still}`} rows={rows} focus={focus} done={done} still={still} onPick={() => {}} /> : <p className="m-0 grid h-full place-items-center border border-border-subtle text-micro text-muted">Sin cadena: tocá «Encadenar» o «Repetir».</p>}</div>
      </div>
    </Specimen>
  )
}

/** Un chip de consecuencia como en la propuesta: texto, tono e ícono. */
const Chip = ({ label, tone }: { label: string; tone: Tone }) => (
  <Badge tone={tone} size="sm" icon={CHIP_ICON[tone]}>
    {label}
  </Badge>
)

/** Un ejemplo de cada consecuencia que sale en el duelo (con plural donde hay cartas reales que lo dan: Pot of Greed roba 2, Gamma Invoca 2). */
const OUTCOMES: ChainOutcome[] = [
  { kind: 'add', count: 1 },
  { kind: 'draw', count: 2 },
  { kind: 'summon', count: 2 },
  { kind: 'grave', count: 1 },
  { kind: 'banish', count: 1 },
]

function ConsequenceSample() {
  return (
    <Specimen
      title="Chips de la cadena"
      layout="column"
      note={
        <>
          Cómo va cada eslabón y, resuelto, qué hizo, en pocas palabras, con su tono (<Tag>ui/tone.ts</Tag>) y su ícono: nunca sólo el color. Un solo chip por eslabón: lo que hizo reemplaza a
          «Resuelta» (y el nombre accesible de la fila lo dice entero). Regla: callar antes que decir algo falso. El estado sale de <Tag>chain_solving</Tag>, <Tag>chain_solved</Tag>,{' '}
          <Tag>chain_negated</Tag> y <Tag>chain_disabled</Tag> (el «por CLn» lo deduce el adaptador); lo que hizo, de lo que el núcleo mueve entre <Tag>chain_solving</Tag> y{' '}
          <Tag>chain_solved</Tag> (<Tag>chainOutcome</Tag> en <Tag>chain-feed.ts</Tag>): sólo si pasó una sola clase de cosa, contada sin nombrar cartas. «Destruye» no sale: el núcleo no dice
          por qué se movió una carta, y destruir y mandar al Cementerio llegan iguales. Abajo, lo que no se muestra: «Sin objetivo» (ningún mensaje dice que el objetivo ya no está: el eslabón
          se resuelve igual) y «Llega tarde» (es una lectura del orden de la cadena, no un dato del núcleo: va en «Cómo se resuelve»).
        </>
      }
    >
      <div className="grid gap-1.5">
        <p className="m-0 text-micro font-bold text-soft">Lo sabe el motor hoy</p>
        <div className="flex flex-wrap gap-1.5">
          {(['chained', 'solving', 'solved', 'negated', 'disabled'] as const).map((state) => (
            <Chip key={state} label={stateLabel({ state, ...(voidedState(state) ? { by: 3 } : {}) })} tone={STATE_TONE[state]} />
          ))}
          <Chip label={stateLabel({ state: 'disabled' })} tone="warning" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {OUTCOMES.map((outcome) => (
            <Chip key={outcome.kind} {...outcomeChip(outcome)} />
          ))}
        </div>
      </div>
      <div className="grid gap-1.5">
        <p className="m-0 text-micro font-bold text-soft">No lo sabe el motor (no se muestra)</p>
        <div className="flex flex-wrap gap-1.5 opacity-70">
          <Chip label="Sin objetivo" tone="neutral" />
          <Chip label="Llega tarde" tone="warning" />
        </div>
      </div>
    </Specimen>
  )
}

function LessonSample() {
  return (
    <Specimen
      title="ChainLesson · Cómo se resuelve"
      layout="column"
      className="col-span-full"
      note={
        <>
          La hoja que abre el ⓘ de la cadena (en <Tag>ChainNotice</Tag> y en <Tag>ChainSheet</Tag>; probalo en «ChainNotice · la pila de la cadena»), acá abierta: la línea clave, dos pares de
          órdenes con cartas reales (<Tag>ChainOrderCompare</Tag>: veredicto escrito, ícono y borde de toda la tarjeta; la pila en el orden en que se resuelve, con la línea del efecto; lado a lado si
          entran, uno debajo del otro en el celular) y el cierre. Cada par enseña otra cosa: responder al efecto y no adelantarse (Effect Veiler y Mirrorjade), y responder en la misma cadena y no
          después (Called by the Grave y Maxx "C"). En la mesa es un diálogo sin velo (<Tag>Modal anchor="mat"</Tag>): el duelo sigue a su ritmo y la cadena no se va mientras se lee. Archivo:{' '}
          <Tag>auto/ChainLesson.tsx</Tag>
        </>
      }
    >
      <ChainLessonBody />
    </Specimen>
  )
}

/** La cadena animada, sus chips y la hoja «Cómo se resuelve». */
export function ChainProposalSamples() {
  return (
    <>
      <ChainMotionSample />
      <ConsequenceSample />
      <LessonSample />
    </>
  )
}
