import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

import type { ChainRowState } from '../../../app/auto/chain-feed'
import { cancelWhenDone, EASE_IN_OUT, EASE_OUT, EASE_SNAP, prefersReducedMotion } from '../../../app/motion'
import { t } from '../../../i18n'
import { CardArt } from '../../CardArt'
import { ChainOrderCompare, CHIP_ICON, type ChainOrderScenario } from '../../auto/ChainOrderCompare'
import { ChainListRows, colorOf, STATE_TONE, stateLabel, type ChainNoticeRow } from '../../auto/chain-parts'
import { VOIDED_ART } from '../../probability/MatFx'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { Segmented } from '../../ui/Segmented'
import { listItem } from '../../ui/surfaces'
import type { Tone } from '../../ui/tone'
import { Specimen, Tag } from '../Specimen'

/**
 * PROPUESTA (sin cablear): la cadena animada, los chips de consecuencia y «Dos órdenes». Las animaciones de la propuesta viven acá, en Web Animations desde TS (nada nuevo en `index.css`
 * hasta que Gastón elija): sólo `opacity` y `transform`, en `replace`, con las curvas de `app/motion.ts`, `cancelWhenDone` y nada con movimiento reducido (el cambio queda seco, como hoy).
 */

const art = (id: number) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`

/** La cadena de muestra (la del catálogo): Branded Fusion, Ash del rival y el CL3 que la para. Negada: PSY-Framegear Gamma niega su activación; sin efecto: Called by the Grave niega su efecto. */
const CARDS = {
  negated: [
    { name: 'Branded Fusion', art: art(44362883), mine: true },
    { name: 'Ash Blossom & Joyous Spring', art: art(14558127), mine: false },
    { name: 'PSY-Framegear Gamma', art: art(38814750), mine: true },
  ],
  disabled: [
    { name: 'Branded Fusion', art: art(44362883), mine: true },
    { name: 'Ash Blossom & Joyous Spring', art: art(14558127), mine: false },
    { name: 'Called by the Grave', art: art(24224830), mine: true },
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

    return { number: index + 1, who: card.mine ? t('duel.bar.you') : t('duel.bar.rival'), mine: card.mine, name: card.name, art: card.art, state, ...(raw === 'X' ? { by: 3 } : {}) }
  })

const voidedState = (state: ChainRowState) => state === 'negated' || state === 'disabled'

/**
 * Las animaciones de la propuesta, una por cambio de estado, todas de compositor y cortas: se leen todas las medidas primero y después se anima (una fase de lectura y una de escritura).
 * - Se suma un eslabón: entra arriba de la pila desde arriba (280 ms, `EASE_SNAP`) y los de abajo bajan su lugar (FLIP de `transform`, 280 ms, `EASE_OUT`).
 * - Resuelve: la fila hace un pop (320 ms) y su aro ámbar (una capa ya dibujada) se enciende con `opacity`; la marca de resolución viaja desde la fila de arriba (300 ms, `EASE_IN_OUT`): se ve que
 *   se resuelve de arriba hacia abajo.
 * - Resuelta: el tilde entra girando sobre el arte (260 ms), el arte se apaga (`opacity` 1 → 0,6) y el aro se va.
 * - Negada o sin efecto: la cruz cae como un sello (260 ms) y la fila se sacude (300 ms); el arte queda gris latiendo (`VOIDED_ART`, como en la mesa).
 * - El chip cambia: el nuevo sube y aparece (200 ms).
 */
function useChainMotion(listRef: RefObject<HTMLOListElement | null>, rows: readonly ChainNoticeRow[], still: boolean) {
  const before = useRef<readonly ChainNoticeRow[]>(rows)
  const signature = rows.map((row) => `${row.state}${row.by ?? ''}`).join('|')

  useLayoutEffect(() => {
    const list = listRef.current
    const prev = before.current

    before.current = rows
    if (!list || still || prefersReducedMotion() || typeof list.animate !== 'function' || rows.length < prev.length) return

    const row = (number: number) => list.querySelector<HTMLElement>(`[data-link="${number}"]`)
    const part = (number: number, name: string) => row(number)?.querySelector<HTMLElement>(`[data-part="${name}"]`) ?? null
    const jobs: Array<() => Animation | undefined> = []

    // Lectura: dónde está cada cosa.
    const added = rows.filter((link) => !prev.some((old) => old.number === link.number))
    const fresh = added.length === 1 ? row(added[0]!.number) : null
    const shift = fresh ? fresh.offsetHeight + parseFloat(getComputedStyle(list).rowGap || '0') : 0
    const wasSolving = prev.find((link) => link.state === 'solving')?.number
    const solving = rows.find((link) => link.state === 'solving')?.number
    const from = solving && solving !== wasSolving && wasSolving ? (row(wasSolving)?.offsetTop ?? null) : null
    const to = solving ? (row(solving)?.offsetTop ?? 0) : 0

    // Escritura.
    if (fresh) {
      jobs.push(() => fresh.animate([{ opacity: 0, transform: 'translateY(-0.75rem) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE_SNAP }))
      for (const link of rows) if (link.number !== added[0]!.number) jobs.push(() => row(link.number)?.animate([{ transform: `translateY(${-shift}px)` }, { transform: 'none' }], { duration: 280, easing: EASE_OUT }))
    }
    for (const link of rows) {
      const old = prev.find((item) => item.number === link.number)

      if (!old || (old.state === link.state && old.by === link.by)) continue
      const n = link.number

      jobs.push(() => part(n, 'chip')?.animate([{ opacity: 0, transform: 'translateY(0.25rem)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE_OUT }))
      if (link.state === 'solving') {
        jobs.push(() => part(n, 'body')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 320, easing: EASE_SNAP }))
        jobs.push(() => part(n, 'ring')?.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE_SNAP }))
      }
      if (old.state === 'solving') jobs.push(() => part(n, 'ring')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_OUT }))
      if (link.state === 'solved') {
        jobs.push(() => part(n, 'mark')?.animate([{ opacity: 0, transform: 'scale(0.4) rotate(-25deg)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE_SNAP }))
        jobs.push(() => part(n, 'art')?.animate([{ opacity: 1 }, { opacity: 0.6 }], { duration: 240, easing: EASE_OUT }))
      }
      if (voidedState(link.state) && !voidedState(old.state)) {
        jobs.push(() => part(n, 'mark')?.animate([{ opacity: 0, transform: 'scale(1.8)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE_SNAP }))
        jobs.push(() => part(n, 'body')?.animate([{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 300, easing: EASE_OUT }))
      }
    }
    if (solving && solving !== wasSolving) {
      jobs.push(() =>
        part(solving, 'cursor')?.animate(from === null ? [{ opacity: 0, transform: 'translateY(-0.5rem)' }, { opacity: 1, transform: 'none' }] : [{ transform: `translateY(${from - to}px)` }, { transform: 'none' }], { duration: from === null ? 240 : 300, easing: from === null ? EASE_OUT : EASE_IN_OUT }),
      )
    }

    const animations = jobs.flatMap((job) => {
      const animation = job()

      return animation ? [cancelWhenDone(animation)] : []
    })

    // Un paso que llega antes de que termine el anterior lo deja en su lugar (seco) y anima el nuevo.
    return () => animations.forEach((animation) => animation.cancel())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, rows.length, still])
}

/** La pila de la cadena, propuesta: la misma fila que hoy (`ChainListRows`), con las capas que se animan (el aro, la marca de resolución, el tilde o la cruz sobre el arte) y el chip con su ícono. */
function ProposalRows({ rows, still }: { rows: readonly ChainNoticeRow[]; still: boolean }) {
  const listRef = useRef<HTMLOListElement | null>(null)

  useChainMotion(listRef, rows, still)

  return (
    <ol ref={listRef} aria-label={t('auto.chain.list')} className="m-0 grid list-none content-start gap-1 p-1.5">
      {[...rows].reverse().map((link) => {
        const color = colorOf(link.mine)
        const solving = link.state === 'solving'
        const voided = voidedState(link.state)
        const label = t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: stateLabel(link) })

        return (
          <li key={link.number} data-link={link.number} aria-current={solving ? 'step' : undefined} className="relative">
            {/* La marca de resolución: una sola a la vez, en la fila que se resuelve; viaja desde la anterior. */}
            {solving ? <span data-part="cursor" aria-hidden="true" className="absolute inset-y-1.5 -left-1.5 w-1 bg-info" /> : null}
            <button type="button" aria-label={label} data-part="body" className={cx(listItem, 'relative flex min-h-11 w-full items-center gap-2.5 p-1.5 text-left focus-visible:outline-none focus-visible:shadow-focus')}>
              {/* El aro ámbar y el velo ya dibujados: se anima su opacidad, nunca la sombra ni el fondo (hoy el velo de la fila transiciona `background-color`). */}
              <span data-part="ring" aria-hidden="true" className={cx('pointer-events-none absolute inset-0 rounded-card bg-tint/10 inset-ring-2 inset-ring-info/80', solving ? 'opacity-100' : 'opacity-0')} />
              <span className={cx('w-9 shrink-0 rounded-tag border py-0.5 text-center text-micro font-bold tabular-nums text-white', color.border, color.bubble)}>{`CL${link.number}`}</span>
              <span className="relative block aspect-[421/614] w-8 shrink-0 overflow-hidden bg-input">
                <span data-part="art" className={cx('block h-full w-full', link.state === 'solved' && 'opacity-60')}>
                  <CardArt remoteUrl={link.art} name={link.name} className={cx('block h-full w-full object-cover', voided && VOIDED_ART)} />
                </span>
                {link.state === 'solved' || voided ? (
                  <span data-part="mark" className="absolute inset-0 grid place-items-center">
                    <span className="grid size-5 place-items-center rounded-tag bg-background/85">
                      <Icon name={voided ? 'x' : 'check'} size={14} strokeWidth={2.6} className={voided ? 'text-danger-soft' : 'text-success-soft'} />
                    </span>
                  </span>
                ) : null}
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className={cx('truncate text-body font-semibold', solving ? 'text-info' : voided ? 'text-muted' : 'text-foreground', voided && 'line-through')}>{link.name}</span>
                <span className={cx('truncate text-micro font-semibold', color.text)}>{link.who}</span>
              </span>
              {/* Sin ícono en la pila: el tilde o la cruz ya van sobre el arte (a 390 px el nombre necesita ese lugar). */}
              <Badge data-part="chip" tone={STATE_TONE[link.state]} size="sm" className="shrink-0">
                {stateLabel(link)}
              </Badge>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// El ritmo de la mesa (`CHAIN_LINK_MS` y `CHAIN_SOLVE_MS` de `app/auto/chain-feed.ts`): el catálogo no importa valores de `src/app/auto/` (`auto-isolation.test.ts`).
const LINK_MS = 700
const SOLVE_MS = 1200

/** Hoy contra la propuesta, con el mismo guion: «Paso» de a uno o «Repetir» con el ritmo de la mesa (`LINK_MS` al sumarse, `SOLVE_MS` al resolverse). */
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
      title="PROPUESTA · La cadena animada: Hoy y Propuesta"
      layout="column"
      className="col-span-full"
      note={
        <>
          El mismo guion en las dos: CL1, CL2 y CL3 entran; CL3 resuelve y para a CL2; CL3 queda resuelta; CL1 resuelve y queda resuelta. <b>Hoy</b> es la pila real (<Tag>ChainListRows</Tag>): cada cambio es seco. <b>Propuesta</b>: el eslabón que se suma entra arriba y empuja la pila; el que resuelve hace un pop, se le enciende el aro ámbar y la marca de la izquierda baja desde el que resolvió antes (se lee que se resuelve de arriba hacia abajo); el resuelto recibe un tilde que entra girando y su arte se apaga; el negado o sin efecto, una cruz como un sello, una sacudida corta y el arte gris latiendo (como en la mesa). Todo entre 200 y 320 ms, sólo <Tag>opacity</Tag> y <Tag>transform</Tag>. «Sin movimiento» muestra lo que ve quien pidió reducirlo (lo mismo que hoy: seco). Sin cablear: vive en <Tag>sections/ChainProposal.tsx</Tag>.
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
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
          {(['Hoy', 'Propuesta'] as const).map((side) => (
            <div key={side} className="grid grid-cols-1 content-start gap-1.5">
              <p className="m-0 text-micro font-bold text-soft">{side}</p>
              <div className="rounded-card border border-border-subtle bg-card-background">
                <p className="m-0 flex h-10 items-center gap-2 px-3 text-body font-semibold">
                  <Icon name="link" size={16} className="shrink-0 text-info" aria-hidden="true" />
                  <span className="shrink-0 whitespace-nowrap">{t('auto.chain.count', { count: rows.length })}</span>
                  {side === 'Propuesta' && rows.some((link) => link.state !== 'chained') ? (
                    <span className="ml-auto flex min-w-0 items-center gap-1 text-micro font-semibold text-soft">
                      <Icon name="chevron-down" size={14} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">Se resuelve de arriba hacia abajo</span>
                    </span>
                  ) : null}
                </p>
                <div className="border-t border-border-subtle">
                  {side === 'Hoy' ? (
                    <ol aria-label={t('auto.chain.list')} className="m-0 grid list-none content-start gap-1 p-1.5">
                      <ChainListRows rows={rows} onPick={() => {}} />
                    </ol>
                  ) : (
                    <ProposalRows rows={rows} still={still} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
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

function ConsequenceSample() {
  return (
    <Specimen
      title="PROPUESTA · Chips de consecuencia"
      layout="column"
      note={
        <>
          Qué pasó con cada efecto, en una o dos palabras, con su tono (<Tag>ui/tone.ts</Tag>) y su ícono: nunca sólo el color. Regla: callar antes que decir algo falso. Arriba, lo que el núcleo ya
          dice (<Tag>chain-feed.ts</Tag>: <Tag>chain_solving</Tag>, <Tag>chain_solved</Tag>, <Tag>chain_negated</Tag>, <Tag>chain_disabled</Tag>; el «por CLn» lo deduce el adaptador y, si no hay
          duda, va). Abajo, lo que haría falta pedirle al motor: no se muestra hasta tenerlo.
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
      </div>
      <div className="grid gap-1.5">
        <p className="m-0 text-micro font-bold text-soft">Habría que pedírselo al motor (no se muestra)</p>
        <div className="flex flex-wrap gap-1.5 opacity-70">
          <Chip label="Invoca 1 monstruo" tone="success" />
          <Chip label="Añade 1 carta" tone="success" />
          <Chip label="Destruye 1 carta" tone="success" />
          <Chip label="Sin objetivo" tone="neutral" />
          <Chip label="Llega tarde" tone="warning" />
        </div>
      </div>
    </Specimen>
  )
}

/** Effect Veiler (de verdad) contra un monstruo con un Efecto Rápido (de ejemplo): el orden decide. */
const VEILER = { name: 'Effect Veiler', art: art(97268402), effect: 'Niega los efectos de 1 monstruo del rival boca arriba, hasta el final del turno' }
const RIVAL = { name: 'Monstruo del rival (ejemplo)', art: null, effect: 'Efecto Rápido: añade 1 carta del Deck a su mano' }

const ORDER_SAMPLE = (): ChainOrderScenario[] => [
  {
    letter: 'A',
    title: 'Esperá',
    good: true,
    note: 'Dejá que active su efecto y respondé: tu Veiler resuelve primero.',
    links: [
      { number: 1, who: t('duel.bar.rival'), mine: false, ...RIVAL, state: 'disabled', by: 2 },
      { number: 2, who: t('duel.bar.you'), mine: true, ...VEILER, state: 'solved' },
    ],
  },
  {
    letter: 'B',
    title: 'No dispares primero',
    good: false,
    note: 'Si activás Veiler antes, su Efecto Rápido le responde y resuelve primero.',
    links: [
      { number: 1, who: t('duel.bar.you'), mine: true, ...VEILER, state: 'solved', outcome: { label: 'Llega tarde', tone: 'warning' }, idle: true },
      { number: 2, who: t('duel.bar.rival'), mine: false, ...RIVAL, state: 'solved', outcome: { label: 'Añade 1 carta', tone: 'success' } },
    ],
  },
]

function OrderSample() {
  return (
    <Specimen
      title="PROPUESTA · Dos órdenes de la cadena"
      layout="column"
      className="col-span-full"
      note={
        <>
          Un componente real sin usar (<Tag>auto/ChainOrderCompare.tsx</Tag>): dos escenarios de la misma cadena, lado a lado si entran (en el celular, uno debajo del otro). Cada uno con su veredicto
          escrito, su ícono y el borde de toda la tarjeta; la pila en el orden en que se resuelve (el último arriba), con la línea del efecto (sólo acá: en el duelo y el registro no va) y el chip de lo
          que pasó; el que no hizo nada, apagado. Entra armándose de abajo hacia arriba, de a 70 ms; «Repetir» lo vuelve a armar. Ejemplo: Effect Veiler contra un monstruo con un Efecto Rápido
          inventado. Los chips «Resuelta» y «Sin efecto» los da el núcleo; «por CL2», «Añade 1 carta» y «Llega tarde» son de muestra.
        </>
      }
    >
      <ChainOrderCompare scenarios={ORDER_SAMPLE()} />
    </Specimen>
  )
}

/** Las tres piezas de la propuesta de la cadena, para que Gastón juzgue y elija. */
export function ChainProposalSamples() {
  return (
    <>
      <ChainMotionSample />
      <ConsequenceSample />
      <OrderSample />
    </>
  )
}
