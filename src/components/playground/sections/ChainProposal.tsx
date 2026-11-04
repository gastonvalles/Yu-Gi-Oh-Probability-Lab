import { useEffect, useState } from 'react'

import type { ChainOutcome, ChainRowState } from '../../../app/auto/chain-feed'
import { t } from '../../../i18n'
import { ChainLessonBody } from '../../auto/ChainLesson'
import { CHIP_ICON, ChainListRows, outcomeChip, STATE_TONE, stateLabel, type ChainNoticeRow } from '../../auto/chain-parts'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Segmented } from '../../ui/Segmented'
import type { Tone } from '../../ui/tone'
import { Specimen, Tag } from '../Specimen'

/** La cadena: la pila real animada paso a paso (`ChainListRows`), sus chips (estado y, resuelta, lo que hizo) y la hoja «Cómo se resuelve» (`ChainLesson`). */

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

/** El guion: cómo queda cada eslabón después de cada paso (lo que arma `chainFeed`); `X` es negado o sin efecto, según la variante. */
const SCRIPT: Array<{ states: Array<ChainRowState | 'X'>; caption: string }> = [
  { states: ['chained'], caption: 'CL1 entra' },
  { states: ['chained', 'chained'], caption: 'CL2 entra' },
  { states: ['chained', 'chained', 'chained'], caption: 'CL3 entra' },
  { states: ['chained', 'chained', 'solving'], caption: 'CL3 resuelve' },
  { states: ['chained', 'X', 'solving'], caption: 'CL3 para a CL2' },
  { states: ['chained', 'X', 'solved'], caption: 'CL3 resuelta' },
  { states: ['solving', 'X', 'solved'], caption: 'CL1 resuelve' },
  { states: ['solved', 'X', 'solved'], caption: 'CL1 resuelta' },
]

const rowsOf = (step: number, variant: Variant): ChainNoticeRow[] =>
  SCRIPT[step]!.states.map((raw, index) => {
    const card = CARDS[variant][index]!
    const state = raw === 'X' ? variant : raw

    return { number: index + 1, who: card.mine ? t('duel.bar.you') : t('duel.bar.rival'), mine: card.mine, name: card.name, art: card.art, state, ...(raw === 'X' ? { by: 3 } : {}), ...(state === 'solved' && card.outcome ? { outcome: outcomeChip(card.outcome) } : {}) }
  })

const voidedState = (state: ChainRowState) => state === 'negated' || state === 'disabled'

// El ritmo de la mesa (`CHAIN_LINK_MS` y `CHAIN_SOLVE_MS` de `app/auto/chain-feed.ts`): el catálogo no importa valores de `src/app/auto/` (`auto-isolation.test.ts`).
const LINK_MS = 700
const SOLVE_MS = 1200

/** La pila real con el guion: «Paso» de a uno o «Repetir» con el ritmo de la mesa (`LINK_MS` al sumarse, `SOLVE_MS` al resolverse). */
function ChainMotionSample() {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [variant, setVariant] = useState<Variant>('negated')
  const [still, setStill] = useState(false)
  const rows = rowsOf(step, variant)
  const last = SCRIPT.length - 1

  useEffect(() => {
    if (!playing) return
    if (step >= last) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setStep((value) => value + 1), step < 2 ? LINK_MS : SOLVE_MS)

    return () => window.clearTimeout(timer)
  }, [playing, step, last])

  return (
    <Specimen
      title="ChainListRows · la cadena animada"
      layout="column"
      className="col-span-full"
      note={
        <>
          La pila real de la cadena (la de <Tag>ChainNotice</Tag> y <Tag>ChainSheet</Tag>) con un guion: CL1, CL2 y CL3 entran; CL3 resuelve y para a CL2; CL3 queda resuelta; CL1 resuelve y queda resuelta. El eslabón que se suma entra arriba y empuja la pila; el que resuelve hace un pop, se le enciende el aro ámbar y la marca de la izquierda baja desde el que resolvió antes (se lee que se resuelve de arriba hacia abajo); el resuelto recibe un tilde que entra girando y su arte se apaga, y su chip dice lo que hizo si el núcleo lo sabe sin duda (CL3: «Invoca 2 monstruos» o «Destierra 1 carta»; Branded Fusion manda materiales e Invoca a la vez: «Resuelta»); el negado o sin efecto, una cruz como un sello, una sacudida corta y el arte gris latiendo (como en la mesa); sólo el negado tacha su nombre. Todo entre 200 y 320 ms, sólo <Tag>opacity</Tag> y <Tag>transform</Tag>, y sólo cuando un eslabón cambia: una pila que se abre ya armada no anima. «Sin movimiento» muestra los cambios secos, como los ve quien pidió reducir el movimiento (el latido del gris lo apaga esa preferencia del sistema). Archivo: <Tag>auto/chain-parts.tsx</Tag>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon="play" disabled={step >= last || playing} onClick={() => setStep((value) => Math.min(last, value + 1))}>
          Paso
        </Button>
        <Button variant="tertiary" size="sm" icon="refresh" onClick={() => (setStep(0), setPlaying(true))}>
          Repetir
        </Button>
        <Button variant="tertiary" size="sm" aria-pressed={still} onClick={() => setStill((value) => !value)}>
          Sin movimiento
        </Button>
        <Segmented
          label="Cómo para CL3 a CL2"
          value={variant}
          onChange={(value) => (setVariant(value), setStep(0), setPlaying(false))}
          options={[
            { value: 'negated', label: 'Negada' },
            { value: 'disabled', label: 'Sin efecto' },
          ]}
        />
        <Tag>{`Paso ${step + 1} de ${SCRIPT.length} · ${SCRIPT[step]!.caption}`}</Tag>
      </div>
      <div className="w-full max-w-96 rounded-card border border-border-subtle bg-card-background">
        <p className="m-0 flex h-11 items-center gap-2 px-3 text-body font-semibold">
          <Icon name="link" size={18} className="shrink-0 text-info" aria-hidden="true" />
          {t('auto.chain.count', { count: rows.length })}
        </p>
        {/* Sin movimiento, cada paso monta una pila nueva: lo que se monta ya armado no anima (el mismo cambio seco que con la preferencia del sistema). */}
        <ol key={still ? `${variant}-${step}` : variant} aria-label={t('auto.chain.list')} className="m-0 grid list-none content-start gap-1 border-t border-border-subtle p-1.5">
          <ChainListRows rows={rows} onPick={() => {}} />
        </ol>
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
