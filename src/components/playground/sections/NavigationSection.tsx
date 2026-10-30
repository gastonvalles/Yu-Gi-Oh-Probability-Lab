import { useEffect, useMemo, useState } from 'react'

import { buildDuelReplay, type DuelReplay } from '../../../app/duel-replay'
import type { SavedReplay } from '../../../app/duel-replay-share'
import type { WireAct } from '../../../app/mat-public'
import { createMatState, describeMatSteps } from '../../../app/practice-mat'
import { DuelReplayScreen } from '../../replays/DuelReplayScreen'
import { videoStage } from '../../replays/ReplayVideo'
import { YourDuels } from '../../replays/YourDuels'
import { createSavedCombo, type SavedCombo } from '../../../app/saved-combos'
import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../../deck-mode/deck-workflow-navigation'
import { MatSnapshot } from '../../probability/MatSnapshot'
import { panelStepsOf } from '../../probability/panel-steps'
import type { FxTone } from '../../probability/practice-styles'
import { PracticeMatPanel, SavedCombosList, SharedComboBar } from '../../probability/PracticeMatPanel'
import { ReplayBar, ReplayTimeline, ReplayTransport, type ReplayMark, type ReplaySpeed } from '../../probability/ReplayBar'
import { AppNavbar } from '../../shell/AppNavbar'
import { AppShell } from '../../shell/AppShell'
import { AppSidebar } from '../../shell/AppSidebar'
import { FeatureSearch } from '../../shell/FeatureSearch'
import { GroupSheet } from '../../shell/GroupSheet'
import { MobileTabBar } from '../../shell/MobileTabBar'
import { MobileTopBar } from '../../shell/MobileTopBar'
import { DrawerPanel, NavDrawer } from '../../shell/NavDrawer'
import { SidebarLegal } from '../../shell/SidebarLegal'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { cx } from '../../ui/cx'
import { Segmented } from '../../ui/Segmented'
import { StepHero } from '../../StepHero'
import { StepPage } from '../../ui/StepPage'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'
import { sampleArrowCombo, sampleCombo } from './duel-sample'

/** Los colores de un replay, uno por cada cosa que puede hacer un paso (el del destello que hace en la mesa). */
const DEMO_TONES: Array<FxTone | null> = ['cyan', 'gold', 'gold', 'violet', null, 'amber', 'red', 'indigo', 'teal', 'white', 'cyan', null]

/** Un replay de mentira: 36 pasos de todos los colores, con un cambio de fase cada seis y un turno nuevo en la mitad. */
const DEMO_MARKS: ReplayMark[] = Array.from({ length: 36 }, (_, index) => ({ phase: index % 6 === 5, turnStart: index === 18, tone: index % 6 === 5 ? null : DEMO_TONES[index % DEMO_TONES.length] }))
const DEMO_AUTOPLAY_MS = 1400

/** Los controles del replay con un replay de mentira que avanza solo (a la velocidad elegida), para tocarlos como en la mesa. */
function ReplayDemo({ className, split = false }: { className?: string; /** Partido, como en «Jugar solo automático» en el celular: la línea de tiempo arriba y los botones abajo. */ split?: boolean }) {
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)

  useEffect(() => {
    if (!playing) return
    if (cursor >= DEMO_MARKS.length) {
      setPlaying(false)
      return
    }

    const timer = window.setTimeout(() => setCursor(cursor + 1), DEMO_AUTOPLAY_MS / speed)
    return () => window.clearTimeout(timer)
  }, [playing, cursor, speed])

  const timeline = {
    marks: DEMO_MARKS,
    cursor,
    describe: (step: number) => (step === 0 ? 'Mano inicial' : `Paso ${step} de ${DEMO_MARKS.length}`),
    onSeek: setCursor,
    onOpenSteps: () => {},
  }
  const transport = {
    cursor,
    playing,
    playLabel: playing ? 'Pausar' : cursor >= DEMO_MARKS.length ? 'Ver de nuevo' : 'Reproducir',
    speed,
    onTogglePlay: () => {
      if (playing) {
        setPlaying(false)
      } else {
        if (cursor >= DEMO_MARKS.length) setCursor(0)
        setPlaying(true)
      }
    },
    onRestart: () => setCursor(0),
    onPrevious: () => {
      setPlaying(false)
      setCursor((current) => Math.max(0, current - 1))
    },
    onNext: () => {
      setPlaying(false)
      setCursor((current) => Math.min(DEMO_MARKS.length, current + 1))
    },
    onSpeed: setSpeed,
  }

  return split ? (
    <div className={cx('grid', className)}>
      <ReplayTransport total={DEMO_MARKS.length} {...transport} />
      <ReplayTimeline {...timeline} />
    </div>
  ) : (
    <ReplayBar className={className} {...timeline} {...transport} />
  )
}

/** Cada ancho de la muestra: la columna lateral de la mesa (20 rem menos su margen), el diálogo del celular a 390 px y el ancho libre (el diálogo en una tableta: el tablero pasa a la derecha). */
const STEP_LIST_WIDTHS = {
  column: { label: 'Columna de la mesa · 296 px', className: 'w-[18.5rem]' },
  dialog: { label: 'Diálogo del celular · 342 px', className: 'w-[21.375rem]' },
  free: { label: 'Ancho libre', className: 'w-full' },
} as const

type StepListWidth = keyof typeof STEP_LIST_WIDTHS

const NO_COMBOS: SavedCombo[] = []
const noop = () => {}

/** Un duelo de muestra: tu lado es el combo de muestra y el rival invoca Ash Blossom (que se ve) y coloca una carta (que no). */
function sampleReplay(view: 'public' | 'mine'): DuelReplay {
  const combo = sampleCombo()
  const rival = createMatState(Array.from({ length: 40 }, (_, i) => `c${i + 1}`), [], 5)
  const acts: WireAct[] = [
    { action: { type: 'phase', phase: 'main1' }, reveal: {} },
    { action: { type: 'place', id: 'c1', zone: 'mz', index: 2, pos: 'atk', how: 'normal' }, reveal: { c1: 'card-14558127-1' } },
    { action: { type: 'place', id: 'c2', zone: 'st', index: 2, pos: 'set' }, reveal: {} },
  ]
  const mine = combo.actions.slice(0, 17)

  return buildDuelReplay({
    mode: 'link-auto',
    view,
    players: ['Ana', 'Beto con un apodo largo'],
    starter: 0,
    mine: { initial: combo.initial, actions: mine },
    theirs: { initial: rival, acts },
    order: [...mine.map(() => 'mine' as const), 'theirs', 'theirs', 'theirs'],
    life: [{ at: 0, lp: [8000, 8000] }, { at: 16, lp: [8000, 6200] }],
    nameOf: (code) => combo.nameOf(`card-${code}-1`),
    result: { winner: 0, reason: 'lp' },
    now: new Date('2026-10-29T12:00:00Z'),
  })
}

/** «Tus duelos» (con replays y vacía) y la pantalla del replay con el aviso «Replay compartido». */
function DuelReplaySamples() {
  const [view, setView] = useState<'public' | 'mine'>('public')
  const replay = useMemo(() => sampleReplay(view), [view])
  const items = useMemo<SavedReplay[]>(
    () => [
      { id: 'a', savedAt: '2026-10-29T12:00:00Z', players: ['Ana', 'Beto con un apodo largo'], steps: 412, result: { winner: 0, reason: 'lp' }, payload: 'zMUESTRA' },
      { id: 'b', savedAt: '2026-10-28T21:30:00Z', players: ['', ''], steps: 96, view: 'mine', payload: 'zMUESTRA' },
      { id: 'c', savedAt: '2026-10-27T18:05:00Z', players: ['Ana', 'Caro'], steps: 1006, result: { winner: 1, reason: 'concede' }, payload: `z${'A'.repeat(8000)}` },
    ],
    [],
  )

  // Los tres estados del video, con un archivo de 3,4 MB de mentira.
  const videoSamples = useMemo(() => {
    const file = new File([new Uint8Array(3_400_000)], 'Ana-vs-Beto-2026-10-29.mp4', { type: 'video/mp4' })
    return [
      videoStage({ stage: 'working', progress: 0.42 }, { cancel: noop, retry: noop }),
      videoStage({ stage: 'ready', file, durationMs: 414_000 }, { cancel: noop, retry: noop, back: noop }),
      videoStage({ stage: 'failed' }, { cancel: noop, retry: noop, back: noop }),
    ]
  }, [])

  return (
    <>
      <Specimen title="Tus duelos" layout="column" note={<>En Replays, junto a los videos: los duelos guardados en este navegador (hasta 20), una fila por duelo (la fila lo abre; el ⋯ copia el enlace si entra en uno, baja el video —<Tag>ReplayVideo.tsx</Tag>, con su progreso y «Video listo»— o lo borra, con confirmación). Arriba, pegar un enlace: un solo lector que elige por el tipo (un combo va a la mesa). «Jugar solo» no tiene nombres: «Duelista vs Rival». Vacía, cómo se guarda uno. Archivos: <Tag>replays/YourDuels.tsx</Tag> y <Tag>app/duel-replay-share.ts</Tag></>}>
        <div className="grid gap-6 rounded-card border border-border-subtle bg-background p-3">
          <YourDuels items={items} onOpen={noop} onCopyLink={noop} onVideo={noop} onDelete={noop} onImport={noop} />
          <YourDuels items={[]} onOpen={noop} onCopyLink={noop} onVideo={noop} onDelete={noop} onImport={noop} />
        </div>
      </Specimen>
      <Specimen title="Video de un duelo o un combo · estados" layout="column" note={<>«Descargar video» de un duelo (en «Guardar replay» y en el ⋯) o de un combo (el ⋯ de su ficha y la barra del combo compartido, más abajo; el video del combo es tu campo grande con su nombre y el del deck arriba, <Tag>replays/video/video-combo.ts</Tag>): el mismo diálogo. Se arma en el navegador con un anillo de progreso y «Cancelar»; listo, dice cuánto pesa y ofrece <Tag>Guardar video</Tag> y, si el sistema puede, <Tag>Compartir video</Tag> (compartir pide un toque reciente: por eso es un paso aparte). Sin WebCodecs, el botón apagado con el motivo. Archivos: <Tag>replays/ReplayVideo.tsx</Tag> y <Tag>replays/video/</Tag></>}>
        <SpecimenGrid>
          {videoSamples.map((sample) => (
            <Card key={sample.title} className="grid gap-4">
              <strong className="text-lead font-bold text-foreground">{sample.title}</strong>
              {sample.body}
              <div className="flex flex-wrap justify-end gap-2">{sample.footer}</div>
            </Card>
          ))}
        </SpecimenGrid>
      </Specimen>
      <Specimen title="Replay de un duelo · compartido" layout="column" note={<>Lo que vería un espectador (lo que nadie mostró, de dorso; con «Incluir mi mano», la de quien grabó boca arriba), las vidas, el turno y la jugada, con la línea de tiempo y los botones del replay de la práctica (los turnos marcados con una línea). Abierto de un enlace, el aviso <Tag>Replay compartido</Tag> con <Tag>Guardar en mis replays</Tag>. Archivos: <Tag>replays/DuelReplayScreen.tsx</Tag> y <Tag>app/duel-replay.ts</Tag></>}>
        <Segmented label="Qué se ve" variant="chips" size="sm" value={view} onChange={setView} options={[{ value: 'public', label: 'De espectador' }, { value: 'mine', label: 'Con mi mano' }]} />
        <div className="h-[52rem] max-w-full overflow-hidden rounded-card border border-border-subtle bg-background">
          <DuelReplayScreen replay={replay} onClose={noop} shared={{ onSave: noop }} actions={[{ label: 'Descargar video', icon: 'download', onSelect: noop }]} />
        </div>
      </Specimen>
    </>
  )
}

/**
 * La lista de pasos de la mesa con un combo de muestra (`sampleCombo`): la línea de tiempo con los círculos, las cabeceras de fase, las fichas con su chip, su tablero y,
 * la del paso actual, abierta con «Qué se mueve». Se avanza con los botones (como el reproductor) y el interruptor «Detalles» de cada una la vuelve la lista compacta.
 */
function StepListSamples() {
  const combo = useMemo(sampleCombo, [])
  const sharedSamples = useMemo(
    () => [createSavedCombo({ name: 'Snake-Eye de una carta, con Fire King y un nombre bien largo', deckName: 'Snake-Eye Fire King', initial: combo.initial, actions: combo.actions, nameOf: combo.nameOf }, [], new Date('2026-10-29T12:00:00Z'))],
    [combo],
  )
  const steps = useMemo(() => panelStepsOf(combo.initial, combo.actions, describeMatSteps(combo.initial, combo.actions, combo.nameOf), combo.nameOf, combo.artOf), [combo])
  const [cursor, setCursor] = useState(9)
  const [width, setWidth] = useState<StepListWidth>('column')
  const snapshot = steps[cursor - 1]

  return (
    <>
      <Specimen
        title="Lista de pasos"
        layout="column"
        note={
          <>
            Una línea de tiempo, con la última jugada arriba: un círculo por paso (el actual en ámbar, como su pastilla del reproductor), los cambios de fase y de turno como cabeceras y, por paso, una ficha con un solo borde: las miniaturas, el chip de la jugada con el color de su destello y el de dónde sale la carta, la frase y el tablero chico. El paso actual se abre con el turno, la fase y <Tag>Qué se mueve</Tag>. El interruptor <Tag>Detalles</Tag> (se recuerda en el navegador) la vuelve la lista compacta. Archivos: <Tag>probability/PracticeMatPanel.tsx</Tag>, <Tag>probability/panel-steps.ts</Tag> y <Tag>app/mat-step-info.ts</Tag>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon="chevron-left" disabled={cursor === 0} onClick={() => setCursor((current) => Math.max(0, current - 1))}>
            Paso anterior
          </Button>
          <Button variant="secondary" size="sm" iconEnd="chevron-right" disabled={cursor >= steps.length} onClick={() => setCursor((current) => Math.min(steps.length, current + 1))}>
            Paso siguiente
          </Button>
          <Tag>
            Paso {cursor} de {steps.length}
          </Tag>
        </div>
        {/* Una sola lista (un combo largo dibuja muchas fichas): el ancho se elige. */}
        <Segmented label="Ancho de la muestra" variant="chips" size="sm" value={width} onChange={setWidth} options={(Object.keys(STEP_LIST_WIDTHS) as StepListWidth[]).map((key) => ({ value: key, label: STEP_LIST_WIDTHS[key].label }))} />
        <div className={cx('h-[44rem] max-w-full overflow-y-auto overflow-x-hidden rounded-card border border-border-subtle bg-background p-3', STEP_LIST_WIDTHS[width].className)}>
          <PracticeMatPanel steps={steps} initial={combo.initial} cursor={cursor} onSeek={setCursor} nameOf={combo.nameOf} artOf={combo.artOf} combos={NO_COMBOS} deckName="" onLoad={noop} onRename={noop} onDelete={noop} showCombos={false} className="h-full" />
        </div>
      </Specimen>

      <Specimen
        title="Combos guardados y compartidos"
        layout="column"
        note={
          <>
            Cada ficha: el nombre y sus datos con todo el ancho y, abajo, <Tag>Cargar</Tag> (la de siempre), renombrar, borrar y el ⋯ con <Tag>Compartir enlace</Tag> (la hoja del sistema en el celular; si no, copiado) y <Tag>Descargar archivo</Tag>: con el panel al mínimo (16 rem) y 44 px por botón, dos íconos más no entran. Arriba, <Tag>Pegar enlace</Tag> e <Tag>Importar combo</Tag> (sin campo de texto: no abre el teclado). Un enlace de combo abre la práctica con el aviso de abajo. Archivos: <Tag>probability/PracticeMatPanel.tsx</Tag> y <Tag>app/combo-share.ts</Tag>
          </>
        }
      >
        <div className="flex flex-wrap items-start gap-4">
          {[
            { label: 'Panel al mínimo · 16 rem', className: 'w-[16rem]' },
            { label: 'Panel al máximo · 36 rem', className: 'w-[36rem] max-w-full' },
          ].map((sample) => (
            <div key={sample.label} className={cx('grid gap-2', sample.className)}>
              <Tag>{sample.label}</Tag>
              <div className="grid gap-3 rounded-card border border-border-subtle bg-background p-3">
                <SavedCombosList combos={sharedSamples} deckName="Snake-Eye" onLoad={noop} onRename={noop} onDelete={noop} onShare={noop} onVideo={noop} onImport={noop} />
              </div>
            </div>
          ))}
        </div>
        <div className="max-w-full overflow-hidden rounded-card border border-border-subtle">
          <SharedComboBar combo={sharedSamples[0]!} onSave={noop} onClose={noop} onVideo={noop} />
        </div>
      </Specimen>

      <Specimen
        title="Tablero chico de un paso"
        layout="column"
        note={
          <>
            La mesa como quedó después del paso, con las áreas de la de verdad: lo que cambió va enmarcado en ámbar (la casilla, la pila o la carta que llegó a la mano), lo boca abajo atenuado, el deck y el Extra de dorso, las pilas con su cantidad y los materiales Xyz con la suya. Es un dibujo (<Tag>aria-hidden</Tag>) y con <Tag>content-visibility: auto</Tag> no se dibuja fuera de la pantalla. Archivo: <Tag>probability/MatSnapshot.tsx</Tag>
          </>
        }
      >
        <div className="flex flex-wrap items-start gap-4">
          {[
            { label: 'En la columna · 232 px', className: 'w-[14.5rem]' },
            { label: 'En el diálogo · 278 px', className: 'w-[17.375rem]' },
            { label: 'Ancho libre', className: 'min-w-0 flex-1 basis-80' },
          ].map((width) => (
            <div key={width.label} className={cx('grid gap-2', width.className)}>
              <Tag>{width.label}</Tag>
              <Card padding="sm">{snapshot ? <MatSnapshot state={snapshot.after} change={snapshot.info.change} arrows={snapshot.arrows} artOf={combo.artOf} /> : <MatSnapshot state={combo.initial} artOf={combo.artOf} />}</Card>
            </div>
          ))}
        </div>
      </Specimen>

      <ArrowSamples />
    </>
  )
}

/** Los anchos del tablero en la muestra de las flechas (la frase del paso se parte a ese ancho): el de la columna de la mesa, el del diálogo del celular y uno libre (las flechas se ubican con el ancho medido). */
const ARROW_WIDTHS = {
  column: { label: 'Columna de la mesa · 232 px', box: 'w-[calc(14.5rem+1.625rem)]' },
  dialog: { label: 'Diálogo del celular · 278 px', box: 'w-[calc(17.375rem+1.625rem)]' },
  free: { label: 'Ancho libre', box: 'min-w-0 flex-1 basis-96' },
} as const

type ArrowWidth = keyof typeof ARROW_WIDTHS

/** Un tablero chico por cada camino que dibujan las flechas (`sampleArrowCombo`), con la frase de su paso, a tres anchos. */
function ArrowSamples() {
  const combo = useMemo(sampleArrowCombo, [])
  const steps = useMemo(() => panelStepsOf(combo.initial, combo.actions, describeMatSteps(combo.initial, combo.actions, combo.nameOf), combo.nameOf, combo.artOf), [combo])
  const [width, setWidth] = useState<ArrowWidth>('column')

  return (
    <Specimen
      title="Flechas de movimiento"
      layout="column"
      note={
        <>
          Sobre el tablero chico de cada paso, una flecha blanca por camino: de la casilla o la pila de donde salió la carta a donde llegó (la mano es «Mano N»; debajo de un Xyz, su casilla). Finas, con la cabeza abierta y un halo tenue del fondo para leerse sobre el arte; se curvan hacia arriba (hacia el medio si son verticales) y salen y entran por el borde, sin tapar el marco ámbar. Lo que hizo el mismo camino va en una sola, con la cantidad (<Tag>×5</Tag>); una ficha que aparece no lleva. Hasta seis por paso (las primeras, empezando por la carta de la jugada). Son un dibujo: la frase y «Qué se mueve» ya lo dicen. Archivos: <Tag>app/mat-arrows.ts</Tag> (qué flechas) y <Tag>probability/MatSnapshot.tsx</Tag> (cómo se dibujan)
        </>
      }
    >
      <Segmented label="Ancho de los tableros" variant="chips" size="sm" value={width} onChange={setWidth} options={(Object.keys(ARROW_WIDTHS) as ArrowWidth[]).map((key) => ({ value: key, label: ARROW_WIDTHS[key].label }))} />
      <div className="flex flex-wrap items-start gap-4">
        {combo.cases.map(({ name, step }) => {
          const shown = steps[step]!

          return (
            <div key={name} className={cx('grid gap-2', ARROW_WIDTHS[width].box)}>
              <Tag>{name}</Tag>
              <Card padding="sm" className="grid gap-2">
                <p className="m-0 text-micro text-muted">{shown.label}</p>
                <MatSnapshot state={shown.after} change={shown.info.change} arrows={shown.arrows} artOf={combo.artOf} />
              </Card>
            </div>
          )
        })}
      </div>
    </Specimen>
  )
}

/** Una pantalla de relleno para probar el armazón. */
function DemoPage({ onExit }: { onExit: () => void }) {
  return (
    <StepPage>
      <StepHero
        title="Pantalla de prueba"
        icon="flask"
        subtitle="Así se ve el armazón con una pantalla adentro. Achicá la ventana para ver el celular."
        side={
          <Button variant="primary" onClick={onExit}>
            Salir de la prueba
          </Button>
        }
      />
      {[1, 2, 3].map((index) => (
        <Card key={index} className="grid gap-2">
          <strong className="text-body font-semibold text-foreground">Tarjeta {index}</strong>
          <p className="m-0 max-w-prose text-body text-muted">Texto de relleno para que la pantalla tenga alto y se pueda ver el scroll, el pie y el menú.</p>
        </Card>
      ))}
    </StepPage>
  )
}

/** El menú (lateral en escritorio; en el celular, la barra de abajo con sus hojas y el cajón de ajustes), la barra de arriba y el pie: lo que arma `AppShell`. Todo sale de `src/components/shell/`. */
export function NavigationSection() {
  const groups = useMemo(
    () =>
      buildAppNavGroups(
        buildDeckWorkflowNavigationItems({ mainDeckCount: 42, roleCardCount: 40, unclassifiedCardCount: 3, hasCompletedRoleStep: false, patternCount: 0, savedBuildCount: 2 }),
        // El duelo con una sala en pausa: la hoja de Duelo muestra el aviso para volver a ella.
        { practice: true, duel: true, paused: { room: 'K7QF2M9X', rival: 'Ana' } },
      ),
    [],
  )
  const [active, setActive] = useState<string | null>('categorization')
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [sheetKey, setSheetKey] = useState<string | null>(null)
  const [shell, setShell] = useState(false)
  const [finding, setFinding] = useState(false)

  return (
    <div className="grid gap-4">
      <Specimen title="Armazón completo" note={<>Prueba el <Tag>AppShell</Tag> a pantalla completa: menú lateral en escritorio; en el celular, barra de arriba con hamburguesa (cajón de ajustes) y barra de abajo con los cuatro grupos (cambia con el ancho de la ventana, 1101 px). Archivo: <Tag>shell/AppShell.tsx</Tag></>}>
        <Button variant="primary" icon="play" onClick={() => setShell(true)}>
          Probar el armazón
        </Button>
      </Specimen>
      {shell ? (
        <div className="fixed inset-0 z-[300] overflow-auto bg-background">
          <AppShell groups={groups} activeKey={active} onSelect={(key) => setActive(key)} contentScrollable>
            <DemoPage onExit={() => setShell(false)} />
          </AppShell>
        </div>
      ) : null}

      <Specimen
        title="Barra de arriba y buscador de la app (escritorio)"
        layout="free"
        note={<>Como la de YouTube: a la izquierda la hamburguesa (contrae el menú lateral; se ilumina en ámbar) con la marca; en el centro el buscador de la app (<Tag>FeatureSearch</Tag>: escribís «vidas», «pdf», «banlist»… y lleva a la pantalla o abre la herramienta; entre los resultados están las cartas) y a la derecha las mascotas y el idioma, que ya no están en el menú lateral. También se abre con <Tag>/</Tag> y <Tag>Ctrl+K</Tag>; en el celular, con «Buscar» de la barra de abajo. No está en la práctica ni en la mesa de un duelo. Archivos: <Tag>shell/AppNavbar.tsx</Tag> <Tag>shell/FeatureSearch.tsx</Tag> <Tag>shell/feature-search.ts</Tag></>}
      >
        <div className="grid gap-3">
          <div className="overflow-x-auto rounded-card border border-border-subtle">
            {/* Es de escritorio: en un celular se desliza en vez de apretarse (la marca y el idioma se pisaban). */}
            <AppNavbar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((current) => !current)} onSearch={() => setFinding(true)} onMascots={() => {}} className="min-w-[63.5rem]" />
          </div>
          <Button variant="secondary" size="sm" icon="search" className="w-fit" onClick={() => setFinding(true)}>
            Abrir el buscador
          </Button>
          <FeatureSearch isOpen={finding} onClose={() => setFinding(false)} groups={groups} activeKey={active} cardsAvailable onSelect={(key) => setActive(key)} />
        </div>
      </Specimen>

      <SpecimenGrid min="24rem">
        <Specimen title="Menú lateral (escritorio)" layout="free" note={<>Reemplaza la barra de arriba, armado como el de YouTube: arriba, fija, la hamburguesa (siempre a la vista; contrae y abre el menú) con la marca; lo demás scrollea con la barra fina de <Tag>scroll-yt</Tag> (aparece sólo con el mouse encima) y termina en las redes y la privacidad. Contraído, el ícono de cada fila no se mueve y los rótulos se desvanecen (probalo con la hamburguesa). Archivos: <Tag>shell/AppSidebar.tsx</Tag> <Tag>shell/SidebarNav.tsx</Tag> <Tag>shell/SidebarLegal.tsx</Tag></>}>
          <div className="flex flex-wrap items-start gap-4">
            <div className="h-[38rem] overflow-hidden rounded-card border border-border-subtle">
              <AppSidebar groups={groups} activeKey={active} onSelect={setActive} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((current) => !current)} />
            </div>
            <div className="h-[38rem] overflow-hidden rounded-card border border-border-subtle">
              <AppSidebar groups={groups} activeKey={active} onSelect={setActive} collapsed onToggleCollapsed={() => setCollapsed((current) => !current)} />
            </div>
          </div>
        </Specimen>

        <Specimen title="Barra de abajo y hoja (celular)" layout="free" note={<>Cinco lugares: Tu deck · Descubrir · <b>Jugar</b> (el círculo violeta del centro, que asoma 12 px por arriba, separado por un aro del color del lienzo, sin sombra) · Cartas · Buscar (el buscador de la app, que bajó de la barra de arriba). Cada grupo abre una hoja que prolonga la barra (el mismo índigo, sin velo ni sombra): «Tu deck» con el estado de cada paso, «Jugar» con el aviso de la sala en pausa y las demás con una línea que explica cada destino. Lo abierto va en ámbar con una rayita arriba (el círculo, con un aro ámbar); con una hoja abierta, sólo su grupo. Arriba, la de verdad; abajo, Jugar abierto y la hoja de Cartas abierta. Archivos: <Tag>shell/MobileTabBar.tsx</Tag> <Tag>shell/GroupSheet.tsx</Tag></>}>
          <div className="grid gap-4">
            {/* El `pt-4` deja ver lo que asoma el círculo, como el contenido de la pantalla que la barra deja libre. */}
            <div className="w-full max-w-[23.4rem] overflow-hidden rounded-card border border-border-subtle bg-background pt-4">
              <MobileTabBar groups={groups} activeKey={active} openKey={sheetKey} onOpen={(key) => setSheetKey((current) => (current === key ? null : key))} onSearch={() => setFinding(true)} searchOpen={finding} placement="inline" />
            </div>
            <div className="w-full max-w-[23.4rem] overflow-hidden rounded-card border border-border-subtle bg-background pt-4">
              <MobileTabBar groups={groups} activeKey="life" openKey={null} onOpen={() => {}} onSearch={() => {}} placement="inline" />
            </div>
            <div className="w-full max-w-[23.4rem] overflow-hidden rounded-card border border-border-subtle bg-background pt-4">
              <MobileTabBar groups={groups} activeKey={active} openKey="cards" onOpen={() => {}} onSearch={() => {}} placement="inline" />
            </div>
            <GroupSheet
              group={groups.find((group) => group.key === sheetKey) ?? null}
              activeKey={active}
              onClose={() => setSheetKey(null)}
              onSelect={(key) => {
                setActive(key)
                setSheetKey(null)
              }}
            />
          </div>
        </Specimen>

        <Specimen title="Barra de arriba y cajón de ajustes (celular)" layout="free" note={<>La barra de arriba dice la pantalla; la hamburguesa abre el cajón: idioma (Español | English), «Tus datos» (guardar y restaurar la copia de seguridad) y, abajo, redes, privacidad y autoría. Archivos: <Tag>shell/MobileTopBar.tsx</Tag> <Tag>shell/NavDrawer.tsx</Tag></>}>
          <div className="grid gap-4">
            <div className="w-full max-w-[23.4rem] overflow-hidden rounded-card border border-border-subtle">
              <MobileTopBar menuOpen={drawer} onMenu={() => setDrawer(true)} title="Lab" />
            </div>
            <div className="h-[34rem] w-full max-w-[20rem] overflow-hidden rounded-card border border-border-subtle">
              <DrawerPanel onClose={() => {}} />
            </div>
            <Button size="sm" onClick={() => setDrawer(true)}>
              Abrir el cajón de verdad
            </Button>
            <NavDrawer isOpen={drawer} onClose={() => setDrawer(false)} />
          </div>
        </Specimen>
      </SpecimenGrid>

      <Specimen title="Controles del replay" layout="free" note={<>Como los de YGOPocket: volver al principio, anterior, reproducir, siguiente, la línea de tiempo (se toca, se arrastra o se maneja con el teclado), la lista de pasos y la velocidad. Cada paso lleva el color de lo que hace (el de su destello en la mesa: dorado activar y la Invocación Normal, celeste la Especial y lo que va a la mano, rojo atacar o marcar un objetivo, violeta declarar y el cementerio, blanco la Sincronía, índigo Xyz, verde agua el Enlace, ámbar el destierro; sin color, gris), vivo lo ya visto y apagado lo que falta. La mano inicial es verde y el paso actual, ámbar y más alto, como el botón de reproducir. Una rayita naranja marca los cambios de fase y una línea, los turnos. Archivo: <Tag>probability/ReplayBar.tsx</Tag></>}>
        <div className="grid gap-4">
          <div className="rounded-card border border-border-subtle p-3">
            <ReplayDemo />
          </div>
          <div className="w-full max-w-[23.4rem] rounded-card border border-border-subtle p-3">
            <ReplayDemo />
          </div>
        </div>
      </Specimen>

      <Specimen title="Controles del replay · partidos" layout="free" note={<>«Jugar solo automático» en el celular, repasando un combo: el aviso «Repasás “…”» dice arriba qué paso se mira y abajo, al alcance del pulgar, van los botones en un renglón de 48 px (volver al principio a la izquierda, anterior, reproducir y siguiente al medio y la velocidad a la derecha, todos de 44 px con el dedo) y, debajo, la línea de tiempo con la lista de pasos. Tu mano se achica y el campo y ella suben lo que mide la línea de tiempo, para quedar enteros arriba de los dos renglones. El replay de un duelo los usa en el mismo orden. Archivo: <Tag>probability/ReplayBar.tsx</Tag> (<Tag>ReplayTimeline</Tag> y <Tag>ReplayTransport</Tag>)</>}>
        <div className="w-full max-w-[23.4rem] rounded-card border border-border-subtle p-3">
          <ReplayDemo split />
        </div>
      </Specimen>

      <StepListSamples />

      <DuelReplaySamples />

      <Specimen title="Final del menú" layout="free" note={<>Las tres redes del autor arriba y, debajo, la privacidad y el aviso legal, con la autoría y el aviso de sitio no oficial; va al final de lo que scrollea del menú lateral (no hay pie en ninguna pantalla). Con el menú contraído se desvanece. Archivo: <Tag>shell/SidebarLegal.tsx</Tag></>}>
        <div className="w-60 overflow-hidden rounded-card border border-border-subtle bg-nav">
          <SidebarLegal className="border-t-0" />
        </div>
      </Specimen>
    </div>
  )
}
