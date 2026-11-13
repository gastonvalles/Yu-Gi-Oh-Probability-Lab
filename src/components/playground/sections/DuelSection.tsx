import { useMemo, useRef, useState, type CSSProperties } from 'react'

import { PILE_TITLES, CardBack } from '../../probability/MatDialogs'
import { MatScene, PickMarks } from '../../probability/MatArena'
import { AttackMark, ChainBadge, FX_CARD, FxFrame, HOLD_PRESS, SPOTLIGHT_TONE, Spotlight, SpotlightSwap, TargetMark, fxVars } from '../../probability/MatFx'
import { glowFrame } from '../../probability/practice-styles'
import { AttackFx, ChevronTrail, measureStrike, type Strike } from '../../probability/AttackFx'
import { t } from '../../../i18n'
import { MaterialCount, MaterialStack } from '../../probability/MaterialStack'
import { CELL, CELL_MONSTER, CELL_SPELL, PileBadge, ZoneLines } from '../../probability/PracticeMat'
import { RivalHandStrip, type RivalHandCard } from '../../probability/RivalHandStrip'
import { HandtrapPicker, HandtrapPoolCard } from '../../duel/HandtrapPool'
import { RivalExtraDeck } from '../../duel/RivalExtraDeck'
import { DEFAULT_RIVAL_EXTRA, HANDTRAP_CATALOG, type ExtraPick, type HandtrapConfig } from '../../../app/handtraps'
import type { PickStat } from '../../../app/auto/ask-ui'
import type { TallyView } from '../../../app/auto/tally'
import type { ChainMedal } from '../../../app/card-glow'
import { ArenaPanel } from '../../duel/ArenaPanel'
import { DuelOffline } from '../../duel/DuelOffline'
import { ResultHero, TurnOrderBanner } from '../../duel/DuelBanner'
import { DuelMedal, type MedalTone } from '../../duel/DuelMedal'
import { LethalBlow } from '../../duel/LethalBlow'
import { Button } from '../../ui/Button'
import { BAR_SEAT, DuelLine, type LaneNotice } from '../../duel/DuelBar'
import { LifeBadge } from '../../duel/LifeScore'
import { OptionsGear } from '../../auto/AutoBar'
import { ChainStage, type ChainNoticeRow } from '../../auto/ChainNotice'
import { IconButton } from '../../ui/IconButton'
import { DuelTable, type DuelSideView } from '../../duel/DuelTable'
import { TurnDial } from '../../duel/TurnDial'
import { TURN_BANK_MS, type TurnClock } from '../../../app/duel-clock'
import type { RoomsApi } from '../../../app/duel-rooms'
import { CardArt } from '../../CardArt'
import { Icon } from '../../ui/Icon'
import { ResizeHandle } from '../../ui/ResizeHandle'
import { Segmented } from '../../ui/Segmented'
import { cx } from '../../ui/cx'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'
import { sampleDuel } from './duel-sample'
import { ShuffleSamples } from './ShuffleSamples'
import { FlightSample } from './FlightSample'
import { PhaseBandSample } from './PhaseBandSample'
import { Presence } from '../../../app/use-presence'
import { PendulumPicker, type PendulumPickCard } from '../../probability/PendulumPicker'

/**
 * El duelo por enlace: cómo se ven los dos campos. Las tres variantes son las que se ofrecen para el celular; en una
 * ventana ancha se ven con las medidas de escritorio. Para verlas como en el celular, achicá la ventana a 1100 px o menos.
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
        note={<>La mesa real: el rival arriba y espejado, las Zonas Extra compartidas en el medio, vos abajo. Siete columnas en todos los anchos: arriba como en escritorio y debajo, a 390 px (la casilla de 57 px de `phoneDuelLayout`). Archivo: <Tag>duel/DuelTable.tsx</Tag></>}
      >
        <DuelTable mine={duel.mine} theirs={duel.theirs} turn="theirs" />
        <div className="mx-auto w-full max-w-[24.375rem] [--cell:3.57rem]">
          <DuelTable mine={duel.mine} theirs={duel.theirs} turn="theirs" />
        </div>
      </Specimen>

      <Specimen title="A2 · Replay de un duelo" layout="column" className="col-span-full" note={<>Como la mesa que se juega: la caja de la fase al medio (<Tag>centerPhase</Tag>, la del turno de abajo en lima, de sólo lectura) en vez de la tira de siglas. La usa el replay de un duelo, con el remolino, las chapas y las dos manos.</>}>
        <div className="mx-auto w-full max-w-[24.375rem] [--cell:3.57rem]">
          <DuelTable mine={duel.mine} theirs={duel.theirs} turn="mine" centerPhase />
        </div>
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

      <SeatsAndLineSample duel={duel} />
      <FieldArtSample duel={duel} />
      <ChainBadgeSample duel={duel} />
      <StatTagSample duel={duel} />
      <TallySample duel={duel} />
      <MaterialSamples />
      <HoldSample />
      <ShuffleSamples />
      <FlightSample />
      <PhaseBandSample />
      <RingsSample />
      <GlowsSample />
      <TrailSample />
      <ResizeHandleSample />
      <PendulumPickerSample range="Niveles 2 a 7" title="Péndulo · varias, con rango" note="Invocar varias por Péndulo en la mesa manual: la mano y el Extra boca arriba en una hoja, con el rango arriba. La que no entra (Nivel 8) va apagada y lo dice, pero se elige: al confirmar, la mesa avisa y sigue." />
      <PendulumPickerSample range="Sin rango (una escala sin dato)" title="Péndulo · sin rango" note="Una escala sin dato (un deck guardado antes de que se guardara la escala): no se marca ninguna ni se valida." />

      <ArenaSamples />

      <RivalEffectSample />

      <HandtrapSamples />

      <LobbyArenaSamples />
      <LobbyOfflineSample />

      <TurnDialSamples />

      <BannerSamples />
    </SpecimenGrid>
  )
}

const SEAT_CHAIN: ChainNoticeRow[] = [
  { number: 1, who: 'Vos', mine: true, name: 'Sky Striker Mobilize - Engage!', art: 'https://images.ygoprodeck.com/images/cards_small/63166095.jpg', state: 'chained' },
  { number: 2, who: 'Ana', mine: false, name: 'Ash Blossom & Joyous Spring', art: 'https://images.ygoprodeck.com/images/cards_small/14558127.jpg', state: 'chained' },
]

/**
 * Las chapas de vidas y lo que flota sobre la mesa (la del celular y la de escritorio): en el celular la del rival en la barra de arriba y la tuya abajo a la izquierda con el turno y la botonera; en
 * escritorio, a los costados del campo. Sin línea entre el campo y tu mano: un aviso flota sobre su borde de arriba sólo mientras está y la cadena va en una capa sobre el campo. «Bajar vidas» prueba
 * el cambio.
 */
function SeatsAndLineSample({ duel }: { duel: ReturnType<typeof sampleDuel> }) {
  const [line, setLine] = useState<'none' | 'notice' | 'chain' | 'moment'>('none')
  const [turn, setTurn] = useState<'mine' | 'rival'>('mine')
  const [life, setLife] = useState({ mine: 8000, theirs: 8000 })
  const mineTurn = turn !== 'rival'
  const lane: LaneNotice | null = line === 'notice' ? { kind: 'undoAsked', onAllow: () => {}, onDeny: () => {} } : line === 'moment' ? { kind: 'ask', text: 'Gene-Warped Warwolf ataca a Sky Striker Ace - Zeke', actions: [] } : null
  const content = line === 'chain' ? <ChainStage rows={SEAT_CHAIN} current={-1} /> : lane ? <DuelLine lane={lane} rivalName="Ana" /> : null
  const rival = <LifeBadge name="Ana" label="Rival" life={life.theirs} compact active={!mineTurn} />
  const mine = <LifeBadge name="Vos" label="Vos" life={life.mine} mine active={mineTurn} />
  const buttons = (
    <span className="flex items-center gap-2">
      <IconButton tone="tile" size="sm" aria-label={t('practice.mat.undo')}>
        <Icon name="undo" />
      </IconButton>
      <IconButton tone="tile" size="sm" aria-label="Pasos y combos">
        <Icon name="list" />
      </IconButton>
      <OptionsGear concede={{ onConcede: () => {}, text: t('duel.options.concedeSolo') }}>
        <p className="m-0 text-body text-muted">Acá va lo propio de cada duelo (la cadena, la casilla, el rival…).</p>
      </OptionsGear>
    </span>
  )

  return (
    <Specimen
      title="Las chapas y la línea"
      layout="column"
      className="col-span-full"
      note={
        <>
          Las vidas: cada jugador con su chapa (recta, carbón al 82 % en alfa plano, la etiqueta en su color); en el celular la del rival va en la fila de los íconos de la barra, con el número un paso más chico (<Tag>compact</Tag>: entra en sus 44 px), y la tuya abajo con las herramientas: ↶ (Deshacer, el primero: el pulgar), ≡ (pasos) y ⚙ (Opciones, el único menú: «La mesa» con la vista 3D, los sonidos, los colores y los menús flotantes, lo de cada duelo y, al final, Rendirse; tocalo para verlo). El turno lo dice sólo el borde: grueso (3 px) en la chapa de quien juega y tenue en la otra, sin texto. No hay línea entre el campo y tu mano: un aviso (o «Momento», lo que pasó al invocar o atacar, 1,5 s: el daño no sale acá, lo cuenta la chapa) va debajo de la barra, sobre la mano del rival, sólo mientras está; uno sin botones («Momento») se saca deslizándolo de costado (o con Supr) y uno con botones («Aviso») no. La cadena va en una capa centrada sobre el campo. El cambio de vidas, todo adentro de la chapa: tiembla, el número baja contando (700 ms como mucho) y el «−N» chico toma el lugar de la etiqueta 1,6 s (rojo tu daño, menta el del rival); no sale ningún número afuera. Las fases van en el botón del medio del campo. A 390 y a 1440 px. Archivos: <Tag>duel/LifeScore.tsx</Tag> <Tag>duel/DuelBar.tsx</Tag> <Tag>auto/AutoBar.tsx</Tag> <Tag>auto/ChainNotice.tsx</Tag>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Qué flota sobre la mesa"
          variant="track"
          value={line}
          onChange={setLine}
          options={[
            { value: 'none', label: 'Nada' },
            { value: 'notice', label: 'Aviso' },
            { value: 'chain', label: 'Cadena' },
            { value: 'moment', label: 'Momento' },
          ]}
        />
        <Segmented
          label="De quién es el turno"
          variant="track"
          value={turn}
          onChange={setTurn}
          options={[
            { value: 'mine', label: 'Tuyo' },
            { value: 'rival', label: 'Del rival' },
          ]}
        />
        <Button size="sm" variant="secondary" onClick={() => setLife((now) => ({ mine: now.mine - 1100, theirs: now.theirs - 1000 }))}>
          Bajar vidas
        </Button>
      </div>
      <div className="mat-square relative grid w-[24.375rem] max-w-full gap-2 bg-background p-1 [--cell:3.57rem]">
        <div className="relative flex h-11 items-center justify-end">
          <span className={BAR_SEAT}>{rival}</span>
          {lane ? <div className="pointer-events-none absolute inset-x-0.5 top-full z-20 mt-1 h-11">{content}</div> : null}
        </div>
        <div className="relative">
          <DuelTable mine={duel.mine} theirs={duel.theirs} turn="theirs" />
          {line === 'chain' ? <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">{content}</div> : null}
        </div>
        <div data-duel-line="" className="relative h-0" />
        <div aria-hidden="true" className="h-24 bg-tint/8" />
        <div className="flex h-15 items-center justify-between gap-2">
          {mine}
          {buttons}
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        <div className="mat-square grid w-[90rem] grid-cols-[1fr_auto_1fr] items-end gap-6 bg-background p-4">
          <div className="justify-self-end">{mine}</div>
          <div className="grid w-[40rem] gap-2 [--cell:4.625rem]">
            <DuelTable mine={duel.mine} theirs={duel.theirs} turn="theirs" />
            <div className="relative h-16 overflow-hidden">{content}</div>
          </div>
          <div className="self-start">{rival}</div>
        </div>
      </div>
    </Specimen>
  )
}

/** La hoja de «Invocar varias por Péndulo» (`PendulumPicker`), abierta con un botón, con o sin rango. */
function PendulumPickerSample({ range, title, note }: { range: string; title: string; note: string }) {
  const [open, setOpen] = useState(false)
  const known = !range.startsWith('Sin')
  const cards: PendulumPickCard[] = [
    { id: 'a', name: 'Dinomist Rex', art: null, from: 'hand', level: 6, fit: known ? 'in' : 'unknown' },
    { id: 'b', name: 'Odd-Eyes Dragon', art: null, from: 'hand', level: 8, fit: known ? 'out' : 'unknown' },
    { id: 'c', name: 'Performapal Hip Hippo', art: null, from: 'extra', level: 3, fit: known ? 'in' : 'unknown' },
  ]

  return (
    <Specimen title={title} note={<>{note} Archivo: <Tag>probability/PendulumPicker.tsx</Tag></>}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Abrir la hoja
      </Button>
      <Presence>{open ? <PendulumPicker cards={cards} range={range} initial={['a']} onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)} /> : null}</Presence>
    </Specimen>
  )
}

/** Una cadena de seis resolviéndose (ya se fueron el 6 y el 5; el 4 late): cada eslabón donde se activó. Dos en tu Cementerio y sólo el 3 tachado. */
const medal = (number: number, mine: boolean, extra: Partial<ChainMedal> = {}): ChainMedal => ({ number, mine, voided: false, resolving: false, ...extra })
const SAMPLE_MEDALS = {
  mine: new Map<string, ChainMedal[]>([
    ['gy', [medal(3, true, { voided: true }), medal(4, true, { resolving: true })]],
    ['st:3', [medal(1, true)]],
  ]),
  theirs: new Map<string, ChainMedal[]>([
    ['mz:0', [medal(2, false)]],
    ['hand', [medal(5, false)]],
  ]),
}

/**
 * Los medallones de la cadena al resolver, sobre la mesa de muestra (`medalsOf` de `app/card-glow.ts`, por lugar): el 1 en una casilla tuya que quedó vacía (la carta se fue), el 2 en un
 * monstruo del rival, el 3 (sin efecto, tachado) y el 4 (el que se resuelve, late) en tu Cementerio, y el 5, de la mano del rival, sobre su abanico.
 */
function ChainBadgeSample({ duel }: { duel: { mine: DuelSideView; theirs: DuelSideView } }) {
  const [mode, setMode] = useState<'solve' | 'off'>('solve')
  const sides = useMemo(() => {
    const on = mode === 'solve'

    return { mine: { ...duel.mine, ...(on ? { medals: SAMPLE_MEDALS.mine } : {}) }, theirs: { ...duel.theirs, handCount: duel.theirs.handCount ?? 5, ...(on ? { medals: SAMPLE_MEDALS.theirs } : {}) } }
  }, [duel, mode])

  return (
    <Specimen
      title="Los medallones de la cadena"
      layout="column"
      className="col-span-full"
      note={
        <>
          Como en Master Duel, sólo al resolver (al encadenar lo dice la escena grande): un medallón por eslabón, un aro de cadena redondo (una ficha, del metal de la escena) con su número blanco y
          luz celeste (como la escena, para los dos), de 36 px, en el lugar donde se activó, aunque la carta se haya ido: la casilla (aunque quede vacía), la pila (Cementerio, Desterradas, Deck, Extra) o la mano (la tuya o el abanico del rival).
          Varios en un mismo lugar, corridos. Del último al primero: el que se resuelve late (con movimiento reducido, quieto) y, al empezar el siguiente, se va; sólo el negado o sin efecto se
          tacha en rojo. No ataja toques: el eslabón también va en el nombre de la carta. Archivo: <Tag>probability/MatFx.tsx</Tag> (<Tag>ChainBadge</Tag>)
        </>
      }
    >
      <Segmented label="Cadena" variant="track" value={mode} onChange={setMode} options={[{ value: 'solve', label: 'Resolviendo' }, { value: 'off', label: 'Sin cadena' }]} />
      <DuelTable mine={sides.mine} theirs={sides.theirs} turn="mine" />
    </Specimen>
  )
}

/**
 * Lo que cuenta una carta en el duelo automático (`TallyChip`; Angelechy Shatranga, los efectos de monstruo del rival): el número arriba a la derecha de la carta en las Mágicas y Trampas, de los dos
 * lados; en el umbral, en ámbar con su aro. «Sumar uno» lo sube con su rebote.
 */
function TallySample({ duel }: { duel: { mine: DuelSideView; theirs: DuelSideView } }) {
  const [count, setCount] = useState(2)
  const sides = useMemo(() => {
    // La Mágica boca arriba de cada lado hace de Shatranga.
    const tally = (side: DuelSideView): ReadonlyMap<string, TallyView> => new Map(side.state.st.flatMap((placed) => (placed && placed.pos !== 'set' ? [[placed.id, { count, limit: 5, counts: 'effects' as const }]] : [])))

    return { mine: { ...duel.mine, tallies: tally(duel.mine) }, theirs: { ...duel.theirs, tallies: tally(duel.theirs) } }
  }, [duel, count])

  return (
    <Specimen
      title="Lo que cuenta una carta"
      layout="column"
      className="col-span-full"
      note={
        <>
          Cartas como Angelechy Shatranga (efectos de monstruo del rival) o Nibiru (Invocaciones del rival, en tu mano) llevan su número arriba a la derecha, derecho y en carbón como la placa del ATK/DEF, visible para los dos. Al llegar a su umbral, ámbar con su aro: «ojo». Cada número nuevo entra con un rebote corto (quieto con movimiento reducido); lo que se lee va en el nombre de la carta. Archivo: <Tag>probability/MatFx.tsx</Tag> (<Tag>TallyChip</Tag>), <Tag>app/auto/tally.ts</Tag>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setCount((value) => value + 1)}>
          Sumar uno
        </Button>
        <Button variant="tertiary" onClick={() => setCount(0)}>
          Volver a 0
        </Button>
      </div>
      <div className="mx-auto w-full max-w-[24.375rem] [--cell:3.57rem]">
        <DuelTable mine={sides.mine} theirs={sides.theirs} turn="mine" />
      </div>
    </Specimen>
  )
}

/** Un número del duelo automático que cambió por un efecto: `by` sobre el impreso (un «?» queda «?»). */
const shifted = (value: number | '?' | null, by: number) => (typeof value === 'number' ? Math.max(0, value + by) : value)

/**
 * El ATK/DEF de cada monstruo boca arriba del campo (`StatTag`), siempre: una placa al pie de la carta, sin cambiar ninguna caja. Las cifras son las impresas (`fieldStatsOf`, como en la mesa
 * manual; en el duelo automático, las de ahora, y en «Cambiados» las tuyas suben 500 y las del rival bajan 500). Eligiendo, la de cada elegible (`pickStatsOf`) es la misma etiqueta y vuelve el
 * Nivel: su nombre suma «elegible».
 */
function StatTagSample({ duel }: { duel: { mine: DuelSideView; theirs: DuelSideView } }) {
  const [on, setOn] = useState<'on' | 'shift' | 'pick' | 'off'>('on')
  const sides = useMemo(() => {
    // La de elegir (`pickStatsOf`) no es la de siempre (`resting`): su ficha se ve.
    const picking = (side: DuelSideView) => ({
      ...side,
      pickable: new Set(side.stats?.keys()),
      pickStats: new Map([...(side.stats ?? [])].map(([id, stat]): [string, PickStat] => [id, { attack: stat.attack, defense: stat.defense, ...(stat.badge ? { badge: stat.badge } : {}) }])),
    })
    const bare = (side: DuelSideView) => ({ ...side, stats: undefined })
    const shift = (side: DuelSideView, by: number) => ({
      ...side,
      stats: new Map([...(side.stats ?? [])].map(([id, stat]): [string, PickStat] => [id, { ...stat, attack: shifted(stat.attack, by) ?? '?', defense: shifted(stat.defense, by), printed: { attack: stat.attack, defense: stat.defense } }])),
    })

    if (on === 'shift') return { mine: shift(duel.mine, 500), theirs: shift(duel.theirs, -500) }
    return on === 'pick' ? { mine: picking(duel.mine), theirs: picking(duel.theirs) } : on === 'off' ? { mine: bare(duel.mine), theirs: bare(duel.theirs) } : duel
  }, [duel, on])

  return (
    <Specimen
      title="ATK/DEF de los monstruos del campo"
      layout="column"
      className="col-span-full"
      note={
        <>
          Lo que se dice de una carta del campo va al pie o afuera, nunca sobre el arte: su ATK/DEF en una placa (10 px de letra, <Tag>text-tag</Tag>, el carbón al 92 % debajo) sobre el cuadro de texto, siempre, los dos números en un renglón, también en defensa y de los dos lados, y la espada de «puede atacar» en la esquina, medio afuera. En el duelo automático, el de ahora: en menta si subió y en rojo claro si bajó respecto del impreso («Cambiados»); en la mesa manual, el impreso y sin color. Un Link, sólo el ATK; un «?» se ve «?» y sin color; boca abajo, nada. El Nivel (★), Rango (R) o LINK no va en la mesa: está en la ficha de la carta y vuelve, arriba, sólo mientras se elige («Eligiendo»). Va en el nombre de la carta («Ponix, ATK 1900, DEF 1000»; eligiendo, «…, elegible»), llega con la carta que viene volando y no mueve nada. Archivo: <Tag>probability/MatFx.tsx</Tag> (<Tag>StatTag</Tag>), <Tag>app/field-stats.ts</Tag>
        </>
      }
    >
      <Segmented label="Etiqueta" variant="track" value={on} onChange={setOn} options={[{ value: 'on', label: 'Siempre' }, { value: 'shift', label: 'Cambiados' }, { value: 'pick', label: 'Eligiendo' }, { value: 'off', label: 'Sin etiqueta' }]} />
      <DuelTable mine={sides.mine} theirs={sides.theirs} turn="mine" />
      <div className="mx-auto w-full max-w-[24.375rem] [--cell:3.57rem]">
        <DuelTable mine={sides.mine} theirs={sides.theirs} turn="mine" />
      </div>
    </Specimen>
  )
}

type FieldMode = 'up' | 'set' | 'none'

/** Tu Zona de campo en sus tres estados, con la magia de campo del rival boca arriba en la suya: el arte de fondo va sólo en la mitad de quien la tiene boca arriba, y entra y se va con un fundido. */
function FieldArtSample({ duel }: { duel: { mine: DuelSideView; theirs: DuelSideView } }) {
  const [mode, setMode] = useState<FieldMode>('up')
  const placed = duel.mine.state.field
  const mine = useMemo<DuelSideView>(
    () => ({ ...duel.mine, state: { ...duel.mine.state, field: mode === 'none' || !placed ? null : { ...placed, pos: mode === 'set' ? 'set' : 'atk' } } }),
    [duel.mine, placed, mode],
  )

  return (
    <Specimen
      title="La magia de campo de fondo"
      layout="column"
      className="col-span-full"
      note={
        <>
          Con la magia de campo boca arriba, su arte recortado (<Tag>cards_cropped</Tag>) va de fondo de la mitad de quien la activó: bien visible (60 %), sin desenfoque, y se desvanece hacia los costados y hacia la fila del medio (las Zonas Extra no son de nadie). Boca abajo o sin carta, nada; del rival, sólo si se sabe cuál es. Va derecho para los dos. Archivos: <Tag>probability/MatArena.tsx</Tag> (<Tag>FieldArt</Tag>, <Tag>fieldArtSrc</Tag>) y <Tag>mat-field-art</Tag> en <Tag>index.css</Tag>.
        </>
      }
    >
      <Segmented
        label="Tu Zona de campo"
        variant="track"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'up', label: 'Boca arriba' },
          { value: 'set', label: 'Boca abajo' },
          { value: 'none', label: 'Vacía' },
        ]}
      />
      <DuelTable mine={mine} theirs={duel.theirs} />
    </Specimen>
  )
}

/** Cuántos materiales lleva cada muestra: sin ninguno (no se ve nada), uno, dos, tres (la pila más alta) y cinco (la pila ya no crece; el aro, sí). */
const MATERIAL_COUNTS = [0, 1, 2, 3, 5]
const MATERIAL_ROWS: Array<{ label: string; sideways: boolean; rival: boolean }> = [
  { label: 'Tuyo, en ataque', sideways: false, rival: false },
  { label: 'Tuyo, en defensa', sideways: true, rival: false },
  { label: 'Del rival, en ataque (media vuelta)', sideways: false, rival: true },
  { label: 'Del rival, en defensa', sideways: true, rival: true },
]
const UTOPIA_ART = 'https://images.ygoprodeck.com/images/cards_small/84013237.jpg'

/** Los materiales de un Xyz con las casillas del celular a tres anchos de pantalla: la casilla es la pantalla menos sus orillas (28 px) en cinco, como en «Jugar solo» (66, 72 y 80 px, medidas). */
function MaterialSamples() {
  return (
    <Specimen
      title="Materiales de un Xyz"
      layout="column"
      className="col-span-full"
      note={
        <>
          Detrás de la carta asoman sus materiales de dorso, por el costado izquierdo (<Tag>MaterialStack</Tag>: una capa por material, hasta tres, que gira con la carta), y en el medio va la cantidad en grande dentro de un aro ámbar con un tramo por material (<Tag>MaterialCount</Tag>, hija de la carta: siempre derecha). Sin materiales no hay nada. Nada de esto recibe toques ni cambia el tamaño de la casilla. Archivo: <Tag>probability/MaterialStack.tsx</Tag>
        </>
      }
    >
      {/* Cada marco mide lo que la pantalla de su nombre: en una ventana más angosta, se desliza de costado (no desborda la muestra). */}
      <div className="flex flex-wrap items-start gap-6 overflow-x-auto">
        {[360, 390, 430].map((width) => {
          const cell = (width - 28) / 5

          return (
            <figure key={width} className="m-0 grid shrink-0 gap-3" style={{ width }}>
              <figcaption>
                <Tag>{width} px</Tag>
              </figcaption>
              {MATERIAL_ROWS.map((row) => (
                <div key={row.label} className="grid gap-1">
                  <span className="text-micro text-soft">{row.label}</span>
                  <div className="grid justify-center gap-1" style={{ gridTemplateColumns: `repeat(5, ${cell}px)` }}>
                    {MATERIAL_COUNTS.map((count) => (
                      <SampleXyz key={count} count={count} sideways={row.sideways} rival={row.rival} />
                    ))}
                  </div>
                </div>
              ))}
            </figure>
          )
        })}
      </div>
    </Specimen>
  )
}

/** Una casilla de monstruo con un Xyz, armada como en la mesa (`CardOnZone`): la pila antes de la carta, y la cantidad adentro de ella. */
function SampleXyz({ count, sideways, rival }: { count: number; sideways: boolean; rival: boolean }) {
  return (
    <div role="group" aria-label={`${count} materiales`} className={CELL_MONSTER}>
      <ZoneLines kind="monster" />
      <MaterialStack count={count} sideways={sideways} rival={rival} />
      <div className={cx('absolute inset-x-0 top-0 mx-auto aspect-[421/614] w-[68.57%] overflow-hidden bg-input shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]', sideways && '[transform:rotate(90deg)]')}>
        <CardArt remoteUrl={UTOPIA_ART} name="Number 39: Utopia" className={cx('block h-full w-full object-cover', rival && 'rotate-180')} />
        <MaterialCount count={count} sideways={sideways} />
      </div>
    </div>
  )
}

/** Mantener apretado en la mesa: una carta del campo y el deck, en reposo y mientras se espera la retención (se hunden de a poco). */
function HoldSample() {
  const [holding, setHolding] = useState(false)
  const held = holding ? 'true' : undefined

  return (
    <Specimen
      title="Mantener apretado · la carta y el deck"
      layout="column"
      note={
        <>
          Mantener apretada una carta del campo de la práctica (450 ms, con el mouse, el dedo o el lápiz) la cambia de posición sin abrir el menú: de ataque a defensa y al revés, y boca abajo la Invoca por Volteo; un Link, una Mágica o una Trampa no hacen nada (al soltarlas se abre su menú). En un duelo, no. El deck se mantiene para su menú, se toca para buscar y se arrastra para robar. Mientras se espera, la carta o el deck se hunden de a poco (<Tag>data-holding</Tag>, <Tag>animate-hold-press</Tag>: arranca a los 120 ms, así un toque no los mueve; con el movimiento reducido, nada). Archivos: <Tag>app/use-mat-drag.ts</Tag> (<Tag>onHold</Tag>, <Tag>HOLD_MS</Tag>) y <Tag>probability/MatFx.tsx</Tag> (<Tag>HOLD_PRESS</Tag>).
        </>
      }
    >
      <Segmented
        label="Cómo está"
        variant="track"
        value={holding ? 'hold' : 'rest'}
        onChange={(value) => setHolding(value === 'hold')}
        options={[
          { value: 'rest', label: 'En reposo' },
          { value: 'hold', label: 'Manteniendo' },
        ]}
      />
      <div className="grid grid-cols-[5rem_3.5rem] items-start gap-4">
        <div role="group" aria-label="Carta del campo" className={CELL_MONSTER}>
          <ZoneLines kind="monster" />
          <div data-holding={held} className={cx('absolute inset-x-0 top-0 mx-auto aspect-[421/614] w-[68.57%] overflow-hidden bg-input shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]', HOLD_PRESS)}>
            <CardArt remoteUrl={UTOPIA_ART} name="Number 39: Utopia" className="block h-full w-full object-cover" />
          </div>
        </div>
        <div role="group" aria-label={PILE_TITLES.deck} data-holding={held} className={cx(CELL, HOLD_PRESS)}>
          <CardBack className="h-full" />
        </div>
      </div>
    </Specimen>
  )
}

/** Los aros de una carta de la mesa, como en el duelo: marcada como objetivo, activándose, que se puede atacar y señalada. */
const RINGS: Array<{ key: string; label: string; attrs: Record<string, string> }> = [
  { key: 'target', label: 'Objetivo', attrs: { 'data-targeted': 'true' } },
  { key: 'flash', label: 'Se activa', attrs: { 'data-flash': 'true', 'data-flash-kind': 'activate' } },
  { key: 'pick', label: 'Se puede atacar', attrs: { 'data-attack-target': 'true' } },
  { key: 'point', label: 'Señalada', attrs: {} },
]

function RingsSample() {
  const [run, setRun] = useState(0)

  return (
    <Specimen
      title="Aros de una carta · objetivo, activar, atacable y señalar"
      layout="column"
      note={
        <>
          El aro rojo de un objetivo late (con la mira encima), el de una carta que se activa se enciende y se expande una vez (950 ms), el celeste de lo que se puede atacar respira y lo que se señala se enciende un rato y se va. Lo que late va en una capa con la sombra fija y se le anima sólo la opacidad (<Tag>fx-ring</Tag>, en <Tag>FX_CARD</Tag>; <Tag>data-attack-target</Tag> y <Tag>data-pointed</Tag> en cualquier casilla): lo mueve el compositor y el campo no se repinta en cada cuadro. Con el movimiento reducido, el aro queda quieto. Archivos: <Tag>index.css</Tag> (<Tag>fx-ring-breathe</Tag>, <Tag>fx-halo-glow</Tag>, <Tag>fx-halo-wave</Tag>, <Tag>fx-point-pulse</Tag>) y <Tag>probability/MatFx.tsx</Tag>.
        </>
      }
    >
      <Button variant="secondary" icon="refresh" onClick={() => setRun((count) => count + 1)}>
        Repetir las animaciones
      </Button>
      {/* Cada aro, en bloque y no en grilla: la casilla con `aspect-ratio` en una grilla dentro de otra hacía que cada layout de la sección la rehiciera entera (dos minutos). */}
      <div className="grid grid-cols-4 gap-4">
        {RINGS.map(({ key, label, attrs }) => (
          <div key={`${key}:${run}`} className="text-center">
            <div role="group" aria-label={label} data-pointed={key === 'point' ? 'true' : undefined} className={cx(CELL_MONSTER, 'w-full')}>
              <ZoneLines kind="monster" />
              <div {...attrs} style={fxVars(key === 'flash' ? SPOTLIGHT_TONE.activate : 'red')} className={cx('absolute inset-x-0 top-0 mx-auto aspect-[421/614] w-[68.57%] overflow-hidden bg-input [--card-shadow:0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)] [box-shadow:var(--card-shadow)]', FX_CARD)}>
                <CardArt remoteUrl={UTOPIA_ART} name="Number 39: Utopia" className="block h-full w-full object-cover" />
                {key === 'flash' ? <FxFrame tone={SPOTLIGHT_TONE.activate} shine /> : null}
                {key === 'target' ? <TargetMark /> : null}
              </div>
            </div>
            <span className="mt-2 block text-micro text-muted">{label}</span>
          </div>
        ))}
      </div>
    </Specimen>
  )
}

/** Los brillos del duelo automático (`app/card-glow.ts`), quietos: lo que podés hacer, lo que puede atacar (el mismo celeste y la espada) y lo que se activa (ámbar con la luz que gira). */
const GLOWS: Array<{ key: string; label: string; kind: 'can' | 'act' | 'aim' | null; back?: true; attack?: true }> = [
  { key: 'can', label: 'Podés (seteada)', kind: 'can', back: true },
  { key: 'attack', label: 'Puede atacar', kind: 'can', attack: true },
  { key: 'aim', label: 'Ataca', kind: 'aim' },
  { key: 'act', label: 'Se activa', kind: 'act' },
  { key: 'none', label: 'Sin brillo', kind: null },
]
const CL1: ChainMedal[] = [{ number: 1, mine: false, voided: false, resolving: true }]

function GlowsSample() {
  return (
    <Specimen
      title="Brillos del duelo · podés, atacar y se activa"
      layout="column"
      note={
        <>
          Un color por pregunta y una forma por verbo, todo quieto salvo la luz que gira. Celeste: podés hacer algo con esa carta (activarla, invocarla, elegirla); con la <b>espada</b> arriba, ese monstruo puede atacar
          (sólo tus monstruos, en tu Battle Phase, los que ofrece el núcleo). <b>Rojo</b>, el del ataque: el tuyo que ataca, mientras elegís a quién. Ámbar con la luz que gira y la insignia CL: se está activando. Afuera, la línea clara de 1 px, el aro de 3 px y el halo de 24 px;
          adentro, el marco fino. Sin brillo en la mesa manual, los replays y lo oculto del rival. Archivos: <Tag>probability/MatFx.tsx</Tag> (<Tag>DUEL_GLOW</Tag>, <Tag>AttackMark</Tag>) y <Tag>app/card-glow.ts</Tag>.
        </>
      }
    >
      <div className="grid grid-cols-5 gap-3">
        {GLOWS.map(({ key, label, kind, back, attack }) => {
          const frame = glowFrame(kind)

          return (
            // En bloque, como los aros: la casilla con `aspect-ratio` en grilla dentro de grilla rehacía el layout de toda la sección.
            <div key={key} className="text-center">
              <div role="group" aria-label={label} className={cx(CELL_MONSTER, 'w-full')}>
                <ZoneLines kind="monster" />
                <div
                  data-glow={kind ? 'true' : 'false'}
                  data-glow-kind={kind ?? undefined}
                  aria-description={attack ? t('practice.card.canAttack') : kind === 'aim' ? t('practice.card.attacking') : undefined}
                  style={fxVars('red')}
                  className={cx('absolute inset-x-0 top-0 mx-auto aspect-[421/614] w-[68.57%] overflow-hidden bg-input [--card-shadow:0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)] [box-shadow:var(--card-shadow)]', FX_CARD)}
                >
                  {back ? <CardBack className="h-full" /> : <CardArt remoteUrl={UTOPIA_ART} name="Number 39: Utopia" className="block h-full w-full object-cover" />}
                  {frame ? <FxFrame {...frame} /> : null}
                </div>
                {kind === 'act' ? <ChainBadge medals={CL1} /> : null}
                {attack ? <AttackMark /> : null}
              </div>
              <span className="mt-2 block text-micro text-muted">{label}</span>
            </div>
          )
        })}
      </div>
    </Specimen>
  )
}

/** La muestra de la estela: una caja de 160 × 176 px, el atacante (48 × 70) abajo a la izquierda y el objetivo arriba a la derecha; la estela sale de su borde y entra un poco en el otro, como `trailOf`. */
const TRAIL_FROM = { x: 32, y: 141 }
const TRAIL_TO = { x: 128, y: 35 }
const TRAIL_ANG = Math.atan2(TRAIL_TO.y - TRAIL_FROM.y, TRAIL_TO.x - TRAIL_FROM.x)
const TRAIL = { x: TRAIL_FROM.x + Math.cos(TRAIL_ANG) * 29.4, y: TRAIL_FROM.y + Math.sin(TRAIL_ANG) * 29.4, len: Math.hypot(TRAIL_TO.x - TRAIL_FROM.x, TRAIL_TO.y - TRAIL_FROM.y) - 38.5, ang: TRAIL_ANG }
const TRAIL_CARD = 'absolute aspect-[421/614] w-12 overflow-hidden bg-input [--card-shadow:0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)] [box-shadow:var(--card-shadow)]'

/** La estela del ataque (`ChevronTrail`; en la mesa la mide y la sigue `AttackTrail`), en movimiento y como queda con el movimiento reducido; «Atacar» corre el ataque entero (`AttackFx`) y el objetivo sale del campo. */
function TrailSample() {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [strike, setStrike] = useState<Strike | null>(null)
  const [gone, setGone] = useState(false)
  // El objetivo se va después del impacto (como cuando la mesa lo manda al cementerio) y vuelve para otra prueba.
  const attack = () => {
    setGone(false)
    setStrike(measureStrike({ from: '[data-card-id="muestra-atacante"]', to: '[data-rival-card-id="muestra-objetivo"]', bounds: boxRef.current }))
    window.setTimeout(() => setGone(true), 420)
    window.setTimeout(() => setGone(false), 2400)
  }

  return (
    <Specimen
      title="Estela del ataque · quién ataca a quién"
      layout="column"
      note={
        <>
          Mientras elegís a quién atacar, tu monstruo lleva el aro rojo quieto y, con el mouse sobre un objetivo, la estela va hasta él (en el celular, sólo el aro). Cuando ataca el rival, la estela queda de su
          monstruo a tu carta o a tus vidas mientras le podés responder y se va con el daño. Es un solo renglón de chevrones con su halo de fondo (dos nodos) y sólo se anima <Tag>translate</Tag>
          (<Tag>animate-chevrons</Tag>); con el movimiento reducido queda quieta. Sin estela en la mesa manual, los replays ni el video. «Probar el ataque»: el atacante embiste (28 px), la espada golpea y el objetivo,
          que sale del campo, se parte en dos (<Tag>animate-card-split-a/b</Tag>, sólo el objetivo de un ataque: el núcleo no dice otras destrucciones). Archivos: <Tag>probability/AttackFx.tsx</Tag> (<Tag>ChevronTrail</Tag>,{' '}
          <Tag>AttackTrail</Tag>, <Tag>AttackFx</Tag>) y <Tag>app/attack-trail.ts</Tag>.
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {[false, true].map((still) => (
          <div key={String(still)} className="grid justify-items-center gap-2">
            <div ref={still ? undefined : boxRef} className="relative h-44 w-40">
              <div data-card-id={still ? undefined : 'muestra-atacante'} data-glow="true" data-glow-kind="aim" style={fxVars('red')} className={cx(TRAIL_CARD, 'bottom-0 left-2', FX_CARD)}>
                <CardArt remoteUrl={UTOPIA_ART} name="Number 39: Utopia" className="block h-full w-full object-cover" />
                <FxFrame {...glowFrame('aim')!} />
              </div>
              {still || !gone ? (
                <div data-rival-card-id={still ? undefined : 'muestra-objetivo'} className={cx(TRAIL_CARD, 'right-2 top-0')}>
                  <CardArt remoteUrl={UTOPIA_ART} name="Number 39: Utopia" className="block h-full w-full rotate-180 object-cover" />
                </div>
              ) : null}
              {still || !strike ? <ChevronTrail {...TRAIL} still={still} /> : null}
            </div>
            <span className="text-micro text-muted">{still ? 'Movimiento reducido: quieta' : 'En movimiento'}</span>
          </div>
        ))}
      </div>
      <Button size="sm" variant="secondary" onClick={attack}>
        Probar el ataque
      </Button>
      {strike ? <AttackFx key={strike.key} strike={strike} onDone={() => setStrike(null)} /> : null}
    </Specimen>
  )
}

type HandleLook = 'rest' | 'active' | 'focus'

/** El ancho de siempre de los paneles de la muestra (en chico: la mesa de verdad va de 16 a 36 rem). */
const DEMO_PANEL = 140

/** Cómo se ve el agarre en cada estado sin tener que tocarlo: con el mouse encima o arrastrándolo, la línea ámbar; con el foco del teclado, además el anillo de siempre. */
const HANDLE_LOOK: Record<HandleLook, string> = {
  rest: '',
  active: '[&_[data-panel-resizer]]:before:opacity-100',
  focus: '[&_[data-panel-resizer]]:before:opacity-100 [&_[data-panel-resizer]]:shadow-focus',
}

/** El borde de los paneles de la mesa, que se arrastra para cambiarles el ancho: una mesa en chico con el detalle a la izquierda y el panel a la derecha, con los agarres de verdad. */
function ResizeHandleSample() {
  const [look, setLook] = useState<HandleLook>('rest')
  const [widths, setWidths] = useState({ left: DEMO_PANEL, right: DEMO_PANEL })
  const boxRef = useRef<HTMLDivElement | null>(null)
  const preview = (name: '--demo-left' | '--demo-right', current: number) => (width: number | null) => boxRef.current?.style.setProperty(name, `${width ?? current}px`)

  return (
    <Specimen
      title="El borde de un panel · arrastrar para cambiar el ancho"
      layout="column"
      className="col-span-full"
      note={
        <>
          El detalle de la carta (desde 1440 px) y los pasos y combos o el chat (desde 1101 px) tienen el borde que da a la mesa arrastrable, como el de VS Code pero de costado. En reposo no se ve nada más que el borde de siempre; con el mouse encima, arrastrándolo o con el foco del teclado, el cursor ↔ y una línea ámbar de 2 px a todo el alto (12 px de agarre, fuera de la grilla: pasar el mouse no corre nada). Doble clic: el ancho de siempre (20 rem). Teclado: ← y → (con Shift, de a 64 px) en la dirección en que se ve, Inicio y Fin a los topes. En la mesa, de 16 a 36 rem y la mesa nunca por debajo de 33 rem; se recuerda en el navegador. Probalo acá: pasá el mouse, arrastralo o llegá con Tab. Archivos: <Tag>ui/ResizeHandle.tsx</Tag> y <Tag>app/mat-panels.ts</Tag>.
        </>
      }
    >
      <Segmented
        label="Cómo se ve"
        variant="track"
        value={look}
        onChange={setLook}
        options={[
          { value: 'rest', label: 'En reposo' },
          { value: 'active', label: 'Mouse o arrastrando' },
          { value: 'focus', label: 'Foco' },
        ]}
      />
      <div
        ref={boxRef}
        className={cx('relative grid h-40 grid-cols-[var(--demo-left)_minmax(0,1fr)_var(--demo-right)] overflow-hidden rounded-card border border-border-subtle', HANDLE_LOOK[look])}
        style={{ '--demo-left': `${widths.left}px`, '--demo-right': `${widths.right}px` } as CSSProperties}
      >
        <div className="border-r border-primary/30 bg-card-background p-3 text-micro text-soft">Detalle · {widths.left} px</div>
        <div className="grid place-items-center text-micro text-soft">La mesa</div>
        <div className="border-l border-border-subtle p-3 text-micro text-soft">Pasos · {widths.right} px</div>
        <ResizeHandle panel="left" value={widths.left} min={96} max={220} label="Cambiar el ancho del detalle" title="Arrastrá para cambiar el ancho · Doble clic: el de siempre" onPreview={preview('--demo-left', widths.left)} onCommit={(left) => setWidths((current) => ({ ...current, left }))} onReset={() => setWidths((current) => ({ ...current, left: DEMO_PANEL }))} className="left-[var(--demo-left)] -translate-x-1/2" />
        <ResizeHandle panel="right" value={widths.right} min={96} max={220} label="Cambiar el ancho del panel" title="Arrastrá para cambiar el ancho · Doble clic: el de siempre" onPreview={preview('--demo-right', widths.right)} onCommit={(right) => setWidths((current) => ({ ...current, right }))} onReset={() => setWidths((current) => ({ ...current, right: DEMO_PANEL }))} className="right-[var(--demo-right)] translate-x-1/2" />
      </div>
    </Specimen>
  )
}

/** Lo que Beto ve cuando Ana activa un efecto de una carta con varios: la carta grande, el cartel con el número del efecto y, debajo, su frase textual. */
const RIVAL_EFFECT = {
  caption: 'Ana activa el efecto 2 de Lunalight Silver Hound',
  card: { id: 'rival-effect', name: 'Lunalight Silver Hound', art: 'https://images.ygoprodeck.com/images/cards_small/33909817.jpg' },
  detail: {
    lead: 'Efecto 2 · When a Spell/Trap Card or effect is activated on the field (Quick Effect)',
    text: 'You can banish this card and 1 "Lunalight" Fusion Monster from your GY; negate the activation.',
  },
}

/** El cartel del centro con el efecto que activa el rival (se queda 7 s para leerlo y se va solo: el botón lo vuelve a mostrar). */
function RivalEffectSample() {
  const [shown, setShown] = useState(1)

  return (
    <Specimen
      title="El efecto que activa el rival"
      layout="column"
      note={
        <>
          Cuando el rival elige un efecto entre varios, el cartel del centro dice cuál (<Tag>Ana activa el efecto 2 de …</Tag>) y, al lado o debajo de la carta, lleva la frase del efecto tal cual el texto, con su número y cuándo se activa; se queda 7 s. Sin efecto elegido, la carta grande (la mitad del recuadro, como la de adelante de la cadena; en el celular, nunca menos del 38 %) y, arriba y recto, sólo quién hizo qué, sin repetir el nombre que la carta ya trae impreso: no lleva placa con el nombre (ésa queda para la carta sin imagen o de dorso). Donde el texto del paso ya está a la vista (el Replay, el combo) no lleva cartel. «Volver a mostrar» con la carta a la vista: la anterior se funde antes de que entre la nueva (<Tag>SpotlightSwap</Tag>), nunca se reemplaza en seco. Archivo: <Tag>probability/MatFx.tsx</Tag> (<Tag>Spotlight detail</Tag>)
        </>
      }
    >
      <div className="relative isolate min-h-[30rem] overflow-hidden rounded-card border border-border-subtle">
        <MatScene className="absolute inset-0 -z-10" />
        <SpotlightSwap>
          <Spotlight key={shown} kind="activate" cards={[RIVAL_EFFECT.card]} caption={RIVAL_EFFECT.caption} detail={RIVAL_EFFECT.detail} className="absolute inset-0" />
        </SpotlightSwap>
      </div>
      <div data-testid="spotlight-alone" className="relative isolate min-h-[30rem] overflow-hidden rounded-card border border-border-subtle">
        <MatScene className="absolute inset-0 -z-10" />
        <Spotlight key={shown} kind="activate" cards={[RIVAL_EFFECT.card]} caption="Ana activa una carta" className="absolute inset-0" />
      </div>
      <Button variant="secondary" size="sm" icon="refresh" onClick={() => setShown((count) => count + 1)}>
        Volver a mostrar
      </Button>
    </Specimen>
  )
}

/** La mano del rival del simulador de handtraps, llena (5): tres sin usar y dos usadas (con el paso en que se usaron); la segunda, con el menú abierto (el marco celeste). */
const RIVAL_HAND: RivalHandCard[] = [
  { id: 'rival.card-14558127-1', name: 'Ash Blossom & Joyous Spring', art: 'https://images.ygoprodeck.com/images/cards_small/14558127.jpg', usedAt: null },
  { id: 'rival.card-97268402-1', name: 'Effect Veiler', art: 'https://images.ygoprodeck.com/images/cards_small/97268402.jpg', usedAt: null },
  { id: 'rival.card-10045474-2', name: 'Infinite Impermanence', art: 'https://images.ygoprodeck.com/images/cards_small/10045474.jpg', usedAt: 3 },
  { id: 'rival.card-42141493-1', name: 'Mulcharmy Fuwalos', art: 'https://images.ygoprodeck.com/images/cards_small/42141493.jpg', usedAt: 12 },
  { id: 'rival.card-27204311-1', name: 'Nibiru, the Primal Being', art: 'https://images.ygoprodeck.com/images/cards_small/27204311.jpg', usedAt: null },
]

/** Las handtraps de muestra de las hojas: 3 copias de Ash, Effect Veiler e Infinite Impermanence y 5 en la mano («entre 9 cartas»). Lo que se guarda no se toca (las hojas de acá no guardan nada). */
const SAMPLE_HAND: HandtrapConfig = {
  enabled: true,
  picks: [
    { ...HANDTRAP_CATALOG[0]!, copies: 3 },
    { ...HANDTRAP_CATALOG[2]!, copies: 3 },
    { ...HANDTRAP_CATALOG[3]!, copies: 3 },
  ],
  hand: 5,
}

/** Con Dominus Purge (prohíbe OSCURIDAD, AGUA y FUEGO): Ash (FUEGO) y D.D. Crow (OSCURIDAD) quedan sin usar; Veiler (LUZ), no. */
const DOMINUS_HAND: HandtrapConfig = { enabled: true, picks: [14558127, 97268402, 97045737, 24508238].map((id) => ({ ...HANDTRAP_CATALOG.find((card) => card.id === id)!, copies: 1 })), hand: 3 }

/** «El rival juega su turno» encendido, con las tres que Tributan tus monstruos (agregadas con el buscador) y Ra, que Sphere Mode trae a su vuelta. */
const TURN_HAND: HandtrapConfig = {
  enabled: true,
  picks: [
    { ...HANDTRAP_CATALOG[0]!, copies: 1 },
    { id: 102380, name: 'Lava Golem', copies: 1 },
    { id: 10000080, name: 'The Winged Dragon of Ra - Sphere Mode', copies: 1 },
    { id: 10000010, name: 'The Winged Dragon of Ra', copies: 1 },
    { id: 24203749, name: 'The Great Gallant Bandit', copies: 1 },
    { id: 15693423, name: 'Evenly Matched', copies: 1 },
    { id: 14532163, name: 'Lightning Storm', copies: 1 },
    { id: 14087893, name: 'Book of Moon', copies: 1 },
    { id: 24224830, name: 'Called by the Grave', copies: 1 },
  ],
  hand: 5,
  ownTurn: true,
}

/** El simulador de handtraps de «Jugar solo»: la franja de la mano del rival en la mesa, las cartas de la hoja con su contador (en 0, 1 y 3) y las dos hojas. */
function HandtrapSamples() {
  const [open, setOpen] = useState(false)
  const [openFromMat, setOpenFromMat] = useState(false)
  const [openDominus, setOpenDominus] = useState(false)
  const [openTurn, setOpenTurn] = useState(false)
  const [copies, setCopies] = useState([0, 1, 3])
  const [extra, setExtra] = useState<ExtraPick[]>(() => DEFAULT_RIVAL_EXTRA.slice(5, 8).map((card) => ({ ...card })))

  return (
    <>
      <Specimen
        title="Handtraps del rival · la franja de la mesa"
        layout="column"
        note={
          <>
            Arriba del campo, sólo en «Jugar solo» con el simulador encendido y sin rótulo: hasta 5 cartas boca arriba (en el celular, de unos 46 px; en una tableta crecen con el campo, de 46 a 82 px, y la franja con ellas; en escritorio, una mano de verdad que se lleva el alto que el campo no usa, hasta el ancho de las cartas de tu mano: <Tag>--rival-card</Tag>, que acá se achica para entrar en la muestra); tocar una abre el menú de la mesa (<Tag>Usar ahora</Tag>, <Tag>Ver carta</Tag>). La usada se queda en su lugar, apagada y con la tilde y el paso en que se usó (en escritorio, también «Usada»). Archivo: <Tag>probability/RivalHandStrip.tsx</Tag>
          </>
        }
      >
        <div className="@container relative isolate overflow-hidden rounded-card border border-border-subtle px-2">
          <MatScene className="absolute inset-0 -z-10" />
          <RivalHandStrip cards={RIVAL_HAND} selectedId={RIVAL_HAND[1]!.id} onOpen={() => undefined} className="[--rival-card:min(4.5rem,calc((100cqw-4rem)/5))]" />
        </div>
      </Specimen>

      <Specimen
        title="Handtraps del rival · la hoja de la mano"
        layout="column"
        note={
          <>
            Cada carta lleva su contador de copias en el deck del rival (de 0 a 3, <Tag>Stepper lg</Tag>): con una o más va con el aro ámbar de lo elegido; con 0, apagada; el «+» se apaga en 3. Abajo de la hoja, cuántas cartas tiene en la mano (de 1 a 5) y entre cuántas se reparten al azar, o que con esas cartas la mano sale más corta. Archivo: <Tag>duel/HandtrapPool.tsx</Tag>
          </>
        }
      >
        {/* En una columna: la muestra es angosta (en la hoja, desde 640 px, van de a dos: `POOL_LIST`). */}
        <ul className="m-0 grid list-none gap-1 p-0">
          {HANDTRAP_CATALOG.slice(0, 3).map((card, index) => (
            <HandtrapPoolCard key={card.id} card={card} copies={copies[index]!} onChange={(value) => setCopies((current) => current.map((count, at) => (at === index ? value : count)))} />
          ))}
        </ul>
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => setOpen(true)}>
          Abrir la hoja (desde las reglas de Solo)
        </Button>
        <HandtrapPicker isOpen={open} config={SAMPLE_HAND} onClose={() => setOpen(false)} onSave={() => setOpen(false)} />
        {/* La mesa manual de Solo: «Handtraps del rival» del ⋯ de la mesa (`useHandtrapsSheet`) abre esta misma hoja, que avisa que aplicar reparte una mano nueva y, con el simulador encendido, ofrece apagarlo. */}
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => setOpenFromMat(true)}>
          Abrir la hoja como se ve desde la mesa
        </Button>
        <HandtrapPicker isOpen={openFromMat} config={SAMPLE_HAND} dealsNew onClose={() => setOpenFromMat(false)} onSave={() => setOpenFromMat(false)} onTurnOff={() => setOpenFromMat(false)} />
        {/* En el duelo automático, con una Dominus: abajo, en ámbar, qué otras elegidas deja sin usar por su Atributo (los datos de cada carta, de YGOPRODeck). */}
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => setOpenDominus(true)}>
          Abrir la hoja del duelo automático con Dominus Purge
        </Button>
        <HandtrapPicker isOpen={openDominus} config={DOMINUS_HAND} auto onClose={() => setOpenDominus(false)} onSave={() => setOpenDominus(false)} />
        {/* «El rival juega su turno», arriba de la hoja del duelo automático (`ListRow` con `toggle`: la fila entera es el interruptor). Las cartas de su turno dicen «La juega en su turno»; apagado, «La usa sólo si juega su turno». */}
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => setOpenTurn(true)}>
          Abrir la hoja del duelo automático con «El rival juega su turno»
        </Button>
        <HandtrapPicker isOpen={openTurn} config={TURN_HAND} auto onClose={() => setOpenTurn(false)} onSave={() => setOpenTurn(false)} />
      </Specimen>

      <Specimen
        title="Handtraps del rival · el Extra Deck del duelo automático"
        layout="column"
        note={
          <>
            En la hoja del duelo automático (no en la práctica manual): el Extra Deck del rival en orden de preferencia (el primero que cumpla es el que usa como costo), con subir, bajar y sacar (<Tag>IconButton lg</Tag>, 44 px), «N de 15», <Tag>Restablecer el Extra Deck</Tag> y un buscador que sólo ofrece monstruos del Extra (hasta 3 copias de cada uno). Con Fydraulis Harmonia elegida y sin Sincros, el aviso en ámbar; vacío, «el rival juega sin él». Archivo: <Tag>duel/RivalExtraDeck.tsx</Tag>
          </>
        }
      >
        <RivalExtraDeck extra={extra} onChange={setExtra} picks={[{ id: 70088809, name: 'Fydraulis Harmonia' }]} active={false} />
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => setExtra([])}>
          Vaciar el Extra Deck
        </Button>
      </Specimen>
    </>
  )
}

/** Dos relays de mentira para la muestra: el que nunca contesta (la arena se queda cargando) y el que contesta enseguida con la arena vacía (tocar «Actualizar» muestra el ícono girando). */
const NO_ANSWER: RoomsApi = { list: () => new Promise(() => undefined), overview: () => new Promise(() => undefined), live: async () => false, register: async () => false, unlist: () => undefined }
const EMPTY_ARENA: RoomsApi = { ...NO_ANSWER, list: async () => [], overview: async () => ({ rooms: [], live: [] }) }

/** La arena del inicio de Jugar esperando al relay (lugares vacíos con la forma de las tarjetas) y ya vacía, con «Actualizar» girando al tocarlo. */
function LobbyArenaSamples() {
  return (
    <Specimen
      title="La arena del lobby cargando"
      layout="column"
      note={
        <>
          Mientras llega la primera respuesta del relay: la línea de estado con el punto que late (<Tag>Mirando quién está…</Tag>) y tres filas vacías de la misma lista (<Tag>ListGroup loading</Tag>), así no se corre nada al llegar. Al tocar <Tag>Actualizar</Tag> (el enlace del encabezado) su ícono gira al menos una vuelta y la lista se atenúa (<Tag>aria-busy</Tag>); el pedido automático de cada 15 s es silencioso. Archivo: <Tag>duel/ArenaPanel.tsx</Tag>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ArenaPanel rooms={NO_ANSWER} busy={false} deckReady onJoin={() => undefined} />
        <ArenaPanel rooms={EMPTY_ARENA} busy={false} deckReady onJoin={() => undefined} />
      </div>
    </Specimen>
  )
}

/** Online sin red: el lobby entero cambia por esto (no hay salas que listar ni que abrir) y vuelve solo con la señal. */
function LobbyOfflineSample() {
  return (
    <Specimen title="Online sin conexión" note={<>Lo que muestra Online sin red, en vez de la arena vacía (<Tag>EmptyState</Tag> con la puerta a Solo). Sin red, el modo automático de Solo y sus bots se apagan con su porqué y, si la pantalla del duelo automático no baja, la sala lo dice en vez de romper la app. Archivo: <Tag>duel/DuelOffline.tsx</Tag></>}>
      <DuelOffline />
    </Specimen>
  )
}

/** Las casillas de la arena en sus estados: vacía, que se puede elegir (con rombo), una carta que se elige (un Sacrificio: sin rombo) y con una carta arrastrada encima. */
const ARENA_CELLS: Array<{ label: string; pick?: boolean; diamond?: boolean; over?: boolean }> = [
  { label: 'Vacía' },
  { label: 'Se puede elegir', pick: true, diamond: true },
  { label: 'Un Sacrificio', pick: true },
  { label: 'Carta encima', over: true },
  { label: 'Vacía' },
]

/** La arena de la mesa: el fondo con luz y viñeta y las casillas transparentes con sus líneas blancas; todo es decoración y no cambia el tamaño de nada. Mismos componentes y estilos que la mesa de verdad. */
function ArenaSamples() {
  return (
    <Specimen
      title="La arena de la mesa"
      layout="column"
      className="col-span-full"
      note={
        <>
          El fondo (<Tag>MatScene</Tag>) se ve a través de las casillas, transparentes y con las líneas blancas de la carta (<Tag>CELL_MONSTER</Tag>, <Tag>CELL_SPELL</Tag> y <Tag>ZoneLines</Tag>); las marcas de una casilla que se puede elegir (<Tag>PickMarks</Tag>) y el conteo de una pila, sólo el número en blanco con sombra y sin cuadro ni color de dueño (<Tag>PileBadge</Tag>). La mesa y sus hojas van con esquinas rectas (<Tag>mat-square</Tag>). Archivos: <Tag>probability/MatArena.tsx</Tag>, <Tag>probability/PracticeMat.tsx</Tag> y <Tag>mat-*</Tag> en <Tag>index.css</Tag>.
        </>
      }
    >
      <div className="mat-square relative isolate grid min-h-[18rem] place-items-center overflow-hidden border border-border-subtle px-4 py-10 min-[1101px]:px-8">
        <MatScene className="absolute inset-0 -z-10" />
        <div className="relative isolate grid w-full max-w-2xl grid-cols-5 gap-2 [transform:perspective(900px)_rotateX(28deg)]">
          {ARENA_CELLS.map(({ label, pick, diamond, over }, index) => (
            <div key={index} role="group" aria-label={label} data-over={over ? 'true' : 'false'} data-pick={pick ? 'true' : 'false'} data-chosen="false" className={CELL_MONSTER}>
              <ZoneLines kind="monster" />
              {pick ? <PickMarks diamond={Boolean(diamond)} /> : null}
            </div>
          ))}
          <div role="group" aria-label="Tu cementerio: 7" className={CELL}>
            <PileBadge count={7} />
          </div>
          <div role="group" aria-label="Mágica o Trampa" className={CELL_SPELL}>
            <ZoneLines kind="spell" />
          </div>
          <div role="group" aria-label="Mágica o Trampa" className={CELL_SPELL}>
            <ZoneLines kind="spell" />
          </div>
          <div role="group" aria-label="Mágica o Trampa" className={CELL_SPELL}>
            <ZoneLines kind="spell" />
          </div>
          <div role="group" aria-label="Cementerio del rival: 3" data-rival-drop="gy" className={CELL}>
            <PileBadge count={3} />
          </div>
        </div>
      </div>
      <ul className="m-0 grid list-none grid-cols-5 gap-2 p-0 text-center text-micro text-soft">
        {ARENA_CELLS.map(({ label }, index) => (
          <li key={index}>{label}</li>
        ))}
      </ul>
    </Specimen>
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
          7 minutos por jugador, y 3 más cada vez que el rival pasa el turno; quien llega a cero pierde el duelo. Va en el centro del campo, entre las dos Zonas Extra (<Tag>duel.clock</Tag> de <Tag>PracticeMat</Tag>). Archivo: <Tag>duel/TurnDial.tsx</Tag>; la cuenta, <Tag>app/duel-clock.ts</Tag>.
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

const MEDALS: Array<{ tone: MedalTone; label: string; numeral?: string }> = [
  { tone: 'first', label: 'first · vas primero', numeral: '1' },
  { tone: 'second', label: 'second · vas segundo', numeral: '2' },
]

/** Los finales, con las acciones de cada pantalla: el automático solo (`solo`), un duelo con otro (`room`, con lo que dice el botón de seguir) y quien mira (`watch`). */
const RESULTS: Array<{ label: string; tone: 'win' | 'lose' | 'draw'; title: string; reason: string; note?: string; kind: 'solo' | 'room' | 'watch'; next?: string }> = [
  { label: 'ganar por vidas', tone: 'win', title: '¡Ganaste!', reason: 'Rival se quedó sin puntos de vida.', kind: 'solo' },
  { label: 'perder por vidas', tone: 'lose', title: 'Perdiste', reason: 'Te quedaste sin puntos de vida.', kind: 'solo' },
  { label: 'empate', tone: 'draw', title: 'Empate', reason: 'Los dos se quedaron sin puntos de vida a la vez.', kind: 'solo' },
  { label: 'te rendiste', tone: 'lose', title: 'Perdiste', reason: 'Te rendiste.', kind: 'solo' },
  { label: 'sin cartas', tone: 'win', title: '¡Ganaste!', reason: 'El rival no pudo robar.', kind: 'solo' },
  { label: 'se rindió el rival', tone: 'win', title: '¡Ganaste!', reason: 'Beto se rindió.', kind: 'room', next: 'Revancha' },
  { label: 'por tiempo', tone: 'lose', title: 'Perdiste', reason: 'Se te acabó el tiempo.', kind: 'room', next: 'Revancha' },
  { label: 'serie: partida 1 de 3', tone: 'lose', title: 'Perdiste', reason: 'Te quedaste sin puntos de vida. Match 0–1.', note: 'Beto quiere la revancha.', kind: 'room', next: 'Siguiente duelo' },
  { label: 'espectador', tone: 'win', title: 'Ganó Ana', reason: 'Ganó Ana. Beto se quedó sin puntos de vida.', note: 'Volvés al inicio en unos segundos.', kind: 'watch' },
]

function ResultSample({ sample }: { sample: (typeof RESULTS)[number] }) {
  const { kind } = sample
  const duel = useMemo(sampleDuel, [])
  const actions =
    kind === 'solo' ? (
      <>
        <Button variant="secondary" size="sm" icon="save" fullWidth>
          Guardar
        </Button>
        <Button variant="secondary" size="sm" icon="hand" fullWidth>
          Modo manual
        </Button>
        <Button variant="secondary" size="sm" icon="play" fullWidth>
          Ver el replay
        </Button>
      </>
    ) : kind === 'room' ? (
      <>
        <Button variant="secondary" size="sm" icon="eye" fullWidth>
          Ver la mesa
        </Button>
        <Button variant="secondary" size="sm" icon="save" fullWidth>
          Guardar
        </Button>
        <Button variant="secondary" size="sm" icon="play" fullWidth>
          Ver el replay
        </Button>
      </>
    ) : undefined
  const primary =
    kind === 'watch' ? (
      <Button variant="secondary" size="sm" icon="home" fullWidth>
        Volver al inicio
      </Button>
    ) : (
      <Button variant="primary" size="sm" icon="refresh" fullWidth>
        {kind === 'solo' ? 'Jugar otra vez' : sample.next}
      </Button>
    )

  // Sobre la mesa de muestra: el campo se ve alrededor del bloque.
  return (
    <div className="grid w-full max-w-[24.375rem] gap-2">
      <Tag>{sample.label}</Tag>
      <div className="relative overflow-hidden border border-border-subtle bg-background [--cell:3.57rem]">
        <DuelTable mine={duel.mine} theirs={duel.theirs} turn="mine" />
        <ResultHero
          tone={sample.tone}
          title={sample.title}
          reason={sample.reason}
          {...(sample.note ? { note: sample.note } : {})}
          {...(kind === 'watch' ? {} : kind === 'solo' ? { onHide: () => {} } : { onLeave: () => {} })}
          {...(actions ? { actions } : {})}
          primary={primary}
        />
      </div>
    </div>
  )
}

/** Los carteles del duelo: la placa en sus cinco colores, el final (con las vidas en grande) y el cartel del comienzo, que se ve dos segundos y se va. */
function BannerSamples() {
  const [run, setRun] = useState(0)
  const [first, setFirst] = useState<boolean | null>(null)
  const [lethal, setLethal] = useState<{ n: number; mine: boolean } | null>(null)

  return (
    <Specimen
      title="D · Carteles del duelo"
      layout="column"
      className="col-span-full"
      note={
        <>
          La placa (<Tag>DuelMedal</Tag>: un cuadrado plano con su aro, sin degradados ni brillos) del cartel del comienzo (<Tag>TurnOrderBanner</Tag>, para los dos). El final (<Tag>ResultHero</Tag>) es un solo bloque al medio del campo, que se ve entero alrededor (sin velo ni hoja; sólo una franja oscura detrás del bloque): la palabra enorme («Victoria», «Derrota», «Empate»: itálica, en el color del resultado, con contorno y resplandor blancos; entra creciendo), el porqué en una línea (el nombre del cartel, «¡Ganaste!», queda para el lector de pantalla) y las acciones en botones chicos iguales, dos por fila en el celular y en una sola en escritorio. Sin vidas: las dicen las chapas. En Solo la ✕ lo esconde (y «Ver el resultado» lo vuelve a abrir); «Ver el replay» abre el duelo recién jugado en el visor de replays. Antes, el golpe letal en cámara lenta (<Tag>LethalBlow</Tag>: destello, rayos y el daño en grande, 1,5 s); después la chapa del que perdió cuenta hasta 0, una pausa y recién ahí el final (<Tag>app/end-reveal.ts</Tag>). Con <Tag>prefers-reduced-motion</Tag> aparece quieto. Archivos: <Tag>duel/DuelMedal.tsx</Tag>, <Tag>duel/DuelBanner.tsx</Tag>.
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
        <Button variant="secondary" onClick={() => setLethal((hit) => ({ n: (hit?.n ?? 0) + 1, mine: false }))}>
          Golpe letal: ganás
        </Button>
        <Button variant="secondary" onClick={() => setLethal((hit) => ({ n: (hit?.n ?? 0) + 1, mine: true }))}>
          Golpe letal: perdés
        </Button>
      </div>
      {/* El golpe letal (`LethalBlow`, 1,5 s en cámara lenta) en un marco de 390 px: arriba cae el rival, abajo vos. */}
      <div className="relative h-80 w-full max-w-[24.375rem] overflow-hidden border border-border-subtle bg-background">
        {lethal ? <LethalBlow key={lethal.n} inline damage={lethal.mine ? 2400 : 3100} mine={lethal.mine} /> : null}
      </div>
      <div key={run} className="grid gap-8 py-4">
        <div className="flex flex-wrap items-start justify-center gap-10">
          {MEDALS.map((medal) => (
            <div key={medal.tone} className="grid justify-items-center gap-4">
              <DuelMedal tone={medal.tone} numeral={medal.numeral} />
              <Tag>{medal.label}</Tag>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] justify-items-center gap-6">
          {RESULTS.map((sample) => (
            <ResultSample key={sample.label} sample={sample} />
          ))}
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

