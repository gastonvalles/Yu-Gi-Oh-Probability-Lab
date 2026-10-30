import { useMemo, useRef, useState, type CSSProperties } from 'react'

import { PILE_TITLES, CardBack } from '../../probability/MatDialogs'
import { MatPlate, MatScene, PickMarks } from '../../probability/MatArena'
import { FX_CARD, FxFrame, HOLD_PRESS, SPOTLIGHT_TONE, Spotlight, TargetMark, fxVars } from '../../probability/MatFx'
import { MaterialCount, MaterialStack } from '../../probability/MaterialStack'
import { CELL, CELL_MONSTER, ZoneLines } from '../../probability/PracticeMat'
import { RivalHandStrip, type RivalHandCard } from '../../probability/RivalHandStrip'
import { HandtrapPicker, HandtrapPoolCard } from '../../duel/HandtrapPool'
import { RivalExtraDeck } from '../../duel/RivalExtraDeck'
import { DEFAULT_RIVAL_EXTRA, HANDTRAP_CATALOG, type ExtraPick, type HandtrapConfig } from '../../../app/handtraps'
import type { PickStat } from '../../../app/auto/ask-ui'
import type { ChainBadgeData } from '../../../app/card-glow'
import { ArenaPanel } from '../../duel/ArenaPanel'
import { ResultHero, TurnOrderBanner } from '../../duel/DuelBanner'
import { DuelMedal, type MedalTone } from '../../duel/DuelMedal'
import { Button } from '../../ui/Button'
import { DuelLogTicker } from '../../duel/DuelBar'
import { DuelTable, type DuelSideView } from '../../duel/DuelTable'
import type { FeedEntry } from '../../duel/use-duel-feed'
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

      <FieldArtSample duel={duel} />
      <ChainBadgeSample duel={duel} />
      <StatTagSample duel={duel} />
      <MaterialSamples />
      <HoldSample />
      <ShuffleSamples />
      <RingsSample />
      <ResizeHandleSample />

      <ArenaSamples />

      <RivalEffectSample />

      <HandtrapSamples />

      <LobbyArenaSamples />

      <LogTickerSpecimen />
      <TurnDialSamples />

      <BannerSamples />
    </SpecimenGrid>
  )
}

/**
 * La insignia del eslabón: una cadena de cuatro sobre la mesa de muestra (CL1 un monstruo del rival en ataque, CL2 uno tuyo en defensa, CL3 tu Cementerio y CL4 tu Zona de campo). Las
 * pide `links` de cada lado (`linksOf` de `app/card-glow.ts`, por id).
 */
function ChainBadgeSample({ duel }: { duel: { mine: DuelSideView; theirs: DuelSideView } }) {
  const [mode, setMode] = useState<'on' | 'void' | 'off'>('on')
  const on = mode !== 'off'
  const sides = useMemo(() => {
    // «Negada»: CL2 (tuyo) queda sin efecto por el CL1 del rival.
    const voided = (n: number) => (mode === 'void' && n === 2 ? { voided: { state: 'disabled' as const, by: 1 } } : {})
    const links = (ids: ReadonlyArray<string | undefined>, first: number, owner: boolean) =>
      new Map<string, ChainBadgeData>(ids.flatMap((id, i) => (id ? [[id, { numbers: [first + i], mine: owner, fromHand: false, ...voided(first + i) }] as const] : [])))
    const mine = links(['card-59438930-1', duel.mine.state.gy.at(-1), duel.mine.state.field?.id], 2, true)
    const theirs = links([duel.theirs.state.mz[0]?.id], 1, false)

    return { mine: { ...duel.mine, ...(on ? { links: mine } : {}) }, theirs: { ...duel.theirs, ...(on ? { links: theirs } : {}) } }
  }, [duel, on, mode])

  return (
    <Specimen
      title="La insignia del eslabón (CL1, CL2…)"
      layout="column"
      className="col-span-full"
      note={
        <>
          Mientras se ve el aviso de la cadena, cada carta que está en ella lleva su número arriba a la izquierda, montado sobre el borde (no tapa el nombre), en la carta o en la pila donde esté ahora, con el
          color de sus vidas: violeta claro lo tuyo, ámbar lo del rival (una etiqueta llena; el ámbar de lo que se activa es un aro). No se toca ni mueve nada: el eslabón también va en el nombre de la carta. Negada o sin efecto, la insignia va tachada y la carta se ve gris y latiendo (un pulso por segundo; con movimiento reducido, gris y quieta), sin moverse ni tapar el arte; su nombre suma «Sin efecto · por CL1» si se sabe quién fue. Archivo: <Tag>probability/MatFx.tsx</Tag> (<Tag>VOIDED_ART</Tag>)
        </>
      }
    >
      <Segmented label="Cadena" variant="track" value={mode} onChange={setMode} options={[{ value: 'on', label: 'Con cadena' }, { value: 'void', label: 'Negada' }, { value: 'off', label: 'Sin cadena' }]} />
      <DuelTable mine={sides.mine} theirs={sides.theirs} turn="mine" />
    </Specimen>
  )
}

/**
 * El ATK/DEF de cada monstruo boca arriba del campo (`StatTag`), siempre: sobre el pie de la carta, sin cambiar ninguna caja. Las cifras son las impresas (`fieldStatsOf`, como en la mesa
 * manual; en el duelo automático, las de ahora). Eligiendo, la de cada elegible (`pickStatsOf`) es la misma etiqueta, no otra: su nombre suma «elegible».
 */
function StatTagSample({ duel }: { duel: { mine: DuelSideView; theirs: DuelSideView } }) {
  const [on, setOn] = useState<'on' | 'pick' | 'off'>('on')
  const sides = useMemo(() => {
    const picking = (side: DuelSideView) => ({ ...side, pickable: new Set(side.stats?.keys()), pickStats: new Map<string, PickStat>(side.stats) })
    const bare = (side: DuelSideView) => ({ ...side, stats: undefined })

    return on === 'pick' ? { mine: picking(duel.mine), theirs: picking(duel.theirs) } : on === 'off' ? { mine: bare(duel.mine), theirs: bare(duel.theirs) } : duel
  }, [duel, on])

  return (
    <Specimen
      title="ATK/DEF de los monstruos del campo"
      layout="column"
      className="col-span-full"
      note={
        <>
          Cada monstruo boca arriba lleva su ATK/DEF abajo de su casilla, siempre y de los dos lados: en el duelo automático el de ahora (con lo que le cambiaron los efectos), en la mesa manual el impreso. El ATK en blanco y la DEF apagada; un Link, sólo el ATK; un valor «?» se ve «?»; boca abajo, nada. En una casilla angosta va sólo el de su posición (ATK parada, DEF acostada). Va en el nombre de la carta («Ponix, ATK 1900, DEF 1000»; eligiendo, «…, elegible»), llega con la carta que viene volando y no mueve nada. Archivo: <Tag>probability/MatFx.tsx</Tag> (<Tag>StatTag</Tag>), <Tag>app/field-stats.ts</Tag>
        </>
      }
    >
      <Segmented label="Etiqueta" variant="track" value={on} onChange={setOn} options={[{ value: 'on', label: 'Siempre' }, { value: 'pick', label: 'Eligiendo' }, { value: 'off', label: 'Sin etiqueta' }]} />
      <DuelTable mine={sides.mine} theirs={sides.theirs} turn="mine" />
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
      <div className="grid grid-cols-4 gap-4">
        {RINGS.map(({ key, label, attrs }) => (
          <div key={`${key}:${run}`} className="grid justify-items-center gap-2">
            <div role="group" aria-label={label} data-pointed={key === 'point' ? 'true' : undefined} className={cx(CELL_MONSTER, 'w-full')}>
              <ZoneLines kind="monster" />
              <div {...attrs} style={fxVars(key === 'flash' ? SPOTLIGHT_TONE.activate : 'red')} className={cx('absolute inset-x-0 top-0 mx-auto aspect-[421/614] w-[68.57%] overflow-hidden bg-input [--card-shadow:0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)] [box-shadow:var(--card-shadow)]', FX_CARD)}>
                <CardArt remoteUrl={UTOPIA_ART} name="Number 39: Utopia" className="block h-full w-full object-cover" />
                {key === 'flash' ? <FxFrame tone={SPOTLIGHT_TONE.activate} shine /> : null}
                {key === 'target' ? <TargetMark /> : null}
              </div>
            </div>
            <span className="text-micro text-muted">{label}</span>
          </div>
        ))}
      </div>
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
          Cuando el rival elige un efecto entre varios, el cartel del centro dice cuál (<Tag>Ana activa el efecto 2 de …</Tag>) y, debajo de la carta, lleva la frase del efecto tal cual el texto, con su número y cuándo se activa; se queda 7 s. Sin efecto elegido, sólo la carta y el cartel de siempre. Archivo: <Tag>probability/MatFx.tsx</Tag> (<Tag>Spotlight detail</Tag>)
        </>
      }
    >
      <div className="relative isolate min-h-[30rem] overflow-hidden rounded-card border border-border-subtle">
        <MatScene className="absolute inset-0 -z-10" />
        <Spotlight key={shown} kind="activate" cards={[RIVAL_EFFECT.card]} caption={RIVAL_EFFECT.caption} detail={RIVAL_EFFECT.detail} className="absolute inset-0" />
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

/** El simulador de handtraps de «Jugar solo»: la franja de la mano del rival en la mesa, las cartas de la hoja con su contador (en 0, 1 y 3) y las dos hojas. */
function HandtrapSamples() {
  const [open, setOpen] = useState(false)
  const [openFromMat, setOpenFromMat] = useState(false)
  const [copies, setCopies] = useState([0, 1, 3])
  const [extra, setExtra] = useState<ExtraPick[]>(() => DEFAULT_RIVAL_EXTRA.slice(5, 8).map((card) => ({ ...card })))

  return (
    <>
      <Specimen
        title="Handtraps del rival · la franja de la mesa"
        layout="column"
        note={
          <>
            Arriba del campo, sólo en «Jugar solo» con el simulador encendido y sin rótulo: hasta 5 cartas boca arriba (en el celular, de unos 46 px; en escritorio, una mano de verdad que se lleva el alto que el campo no usa, hasta el ancho de las cartas de tu mano: <Tag>--rival-card</Tag>, que acá se achica para entrar en la muestra); tocar una abre el menú de la mesa (<Tag>Usar ahora</Tag>, <Tag>Ver carta</Tag>). La usada se queda en su lugar, apagada y con la tilde y el paso en que se usó (en escritorio, también «Usada»). Archivo: <Tag>probability/RivalHandStrip.tsx</Tag>
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
        {/* «Entrenar solo» entra directo a la mesa: «Handtraps del rival» del ⋯ de la mesa (`useHandtrapsSheet`) abre esta misma hoja, que avisa que aplicar reparte una mano nueva y, con el simulador encendido, ofrece apagarlo. */}
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => setOpenFromMat(true)}>
          Abrir la hoja como se ve desde la mesa
        </Button>
        <HandtrapPicker isOpen={openFromMat} config={SAMPLE_HAND} dealsNew onClose={() => setOpenFromMat(false)} onSave={() => setOpenFromMat(false)} onTurnOff={() => setOpenFromMat(false)} />
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

/** Las casillas de la arena en sus estados: vacía, que se puede elegir (con rombo), una carta que se elige (un Sacrificio: sin rombo) y con una carta arrastrada encima. */
const ARENA_CELLS: Array<{ label: string; pick?: boolean; diamond?: boolean; over?: boolean }> = [
  { label: 'Vacía' },
  { label: 'Se puede elegir', pick: true, diamond: true },
  { label: 'Un Sacrificio', pick: true },
  { label: 'Carta encima', over: true },
  { label: 'Vacía' },
]

/** La arena de la mesa: el fondo con luz y viñeta, la placa del campo con su marco y las casillas hundidas; todo es decoración y no cambia el tamaño de nada. Mismos componentes y estilos que la mesa de verdad. */
function ArenaSamples() {
  return (
    <Specimen
      title="La arena de la mesa"
      layout="column"
      className="col-span-full"
      note={
        <>
          El fondo (<Tag>MatScene</Tag>), la placa que va debajo del campo (<Tag>MatPlate</Tag>: sombra con desplazamiento, enrejado, anillos y un marco con esquinas y rombos), las casillas hundidas (<Tag>CELL_MONSTER</Tag>) y las marcas de una casilla que se puede elegir (<Tag>PickMarks</Tag>). Archivos: <Tag>probability/MatArena.tsx</Tag> y <Tag>mat-*</Tag> en <Tag>index.css</Tag>.
        </>
      }
    >
      <div className="relative isolate grid min-h-[18rem] place-items-center overflow-hidden rounded-card border border-border-subtle px-8 py-10">
        <MatScene className="absolute inset-0 -z-10" />
        <div className="relative isolate grid w-full max-w-2xl grid-cols-5 gap-2 [transform:perspective(900px)_rotateX(28deg)]">
          <MatPlate />
          {ARENA_CELLS.map(({ label, pick, diamond, over }, index) => (
            <div key={index} role="group" aria-label={label} data-over={over ? 'true' : 'false'} data-pick={pick ? 'true' : 'false'} data-chosen="false" className={CELL_MONSTER}>
              <ZoneLines kind="monster" />
              {pick ? <PickMarks diamond={Boolean(diamond)} /> : null}
            </div>
          ))}
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

const TICKER_PLAYS = ['Barajás el deck', 'Invocación Normal de Medius the Pure', 'Atacás a Mulcharmy Purulia con Ash Blossom & Joyous Spring', 'Activás Called by the Grave', 'Robás una carta']

/** El cartel del registro con jugadas de muestra: «Agregar una jugada» suma una (alternando entre las tuyas y las del rival) y se ve cómo vuelve el cartel que se sacó. */
function LogTickerSpecimen() {
  const [feed, setFeed] = useState<readonly FeedEntry[]>([
    { id: 'e1', kind: 'event', side: 'theirs', text: 'Ana hace una Invocación Normal' },
    { id: 'e2', kind: 'event', side: 'mine', text: TICKER_PLAYS[0]! },
  ])
  const [opened, setOpened] = useState(0)

  return (
    <Specimen
      title="Registro sobre el campo"
      layout="column"
      note={
        <>
          Las dos últimas jugadas, con el punto del color de quien las hizo, sobre el campo en el celular. <strong>Se sacan con el dedo</strong>: arrastralas de costado (o con Supr desde el teclado) y se van; el lugar queda reservado y la próxima jugada las vuelve a mostrar, con lo nuevo solo. Un toque abre el registro entero. Archivos: <Tag>duel/DuelBar.tsx</Tag> <Tag>app/use-swipe-away.ts</Tag>
        </>
      }
    >
      <div className="grid w-full max-w-sm gap-3">
        <div className="rounded-card border border-border-subtle bg-card-background p-2">
          <DuelLogTicker feed={feed} onOpen={() => setOpened((count) => count + 1)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setFeed((current) => {
                const n = current.length + 1

                return [...current, { id: `e${n}`, kind: 'event', side: n % 2 === 0 ? 'mine' : 'theirs', text: TICKER_PLAYS[n % TICKER_PLAYS.length]! }]
              })
            }
          >
            Agregar una jugada
          </Button>
          <Tag>{`Se abrió el registro: ${opened}`}</Tag>
        </div>
      </div>
    </Specimen>
  )
}
