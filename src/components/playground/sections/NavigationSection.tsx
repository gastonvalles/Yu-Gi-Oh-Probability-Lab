import { useEffect, useMemo, useState } from 'react'

import { describeMatSteps } from '../../../app/practice-mat'
import type { SavedCombo } from '../../../app/saved-combos'
import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../../deck-mode/deck-workflow-navigation'
import { MatSnapshot } from '../../probability/MatSnapshot'
import { panelStepsOf, type PanelChains } from '../../probability/panel-steps'
import type { FxTone } from '../../probability/practice-styles'
import { PracticeMatPanel } from '../../probability/PracticeMatPanel'
import { ReplayBar, type ReplayMark, type ReplaySpeed } from '../../probability/ReplayBar'
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
function ReplayDemo({ className }: { className?: string }) {
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

  return (
    <ReplayBar
      className={className}
      marks={DEMO_MARKS}
      cursor={cursor}
      playing={playing}
      playLabel={playing ? 'Pausar' : cursor >= DEMO_MARKS.length ? 'Ver de nuevo' : 'Reproducir'}
      speed={speed}
      describe={(step) => (step === 0 ? 'Mano inicial' : `Paso ${step} de ${DEMO_MARKS.length}`)}
      onSeek={setCursor}
      onTogglePlay={() => {
        if (playing) {
          setPlaying(false)
        } else {
          if (cursor >= DEMO_MARKS.length) setCursor(0)
          setPlaying(true)
        }
      }}
      onRestart={() => setCursor(0)}
      onPrevious={() => {
        setPlaying(false)
        setCursor((current) => Math.max(0, current - 1))
      }}
      onNext={() => {
        setPlaying(false)
        setCursor((current) => Math.min(DEMO_MARKS.length, current + 1))
      }}
      onOpenSteps={() => {}}
      onSpeed={setSpeed}
    />
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

/** Las cadenas de la muestra, sobre los pasos de `sampleCombo`: la Mágica del paso 3 resuelve en el 4; en la segunda, tu CL1 (paso 5) resuelve en el 7, tu CL2 (paso 6) queda sin efecto y el rival encadenó CL3. */
const SAMPLE_CHAINS: PanelChains = {
  marks: new Map([
    [3, { chain: 1, link: 1, result: { negated: false, from: 4, to: 4 } }],
    [5, { chain: 2, link: 1, result: { negated: false, from: 7, to: 7 } }],
    [6, { chain: 2, link: 2, result: { negated: true } }],
  ]),
  ends: new Map([
    [
      8,
      [
        {
          chain: 2,
          links: [
            { number: 1, name: 'Ghost Ogre & Snow Rabbit', state: 'solved' },
            { number: 2, name: 'Monster Reborn', state: 'disabled' },
            { number: 3, name: 'Ash Blossom & Joyous Spring (Rival)', state: 'solved' },
          ],
        },
      ],
    ],
  ]),
}

/**
 * La lista de pasos de la mesa con un combo de muestra (`sampleCombo`): la línea de tiempo con los círculos, las cabeceras de fase, las fichas con su chip, su tablero y,
 * la del paso actual, abierta con «Qué se mueve». Se avanza con los botones (como el reproductor) y el interruptor «Detalles» de cada una la vuelve la lista compacta.
 */
function StepListSamples() {
  const combo = useMemo(sampleCombo, [])
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
        <div className={cx('h-[44rem] max-w-full overflow-hidden rounded-card border border-border-subtle bg-background p-3', STEP_LIST_WIDTHS[width].className)}>
          <PracticeMatPanel steps={steps} initial={combo.initial} cursor={cursor} onSeek={setCursor} nameOf={combo.nameOf} artOf={combo.artOf} combos={NO_COMBOS} deckName="" onLoad={noop} onRename={noop} onDelete={noop} showCombos={false} className="h-full" />
        </div>
      </Specimen>

      <Specimen
        title="Lista de pasos con cadenas"
        layout="column"
        note={
          <>
            «Jugar solo automático» (<Tag>panelChainsOf</Tag>, de los pasos de la cadena del adaptador): la ficha de tu activación suma <Tag>Cadena 1 · CL1</Tag> a sus chips (lila: es lo tuyo, no el ámbar de lo que se activa) y, ya resuelto, al pie cómo resolvió: en verde los pasos que hizo, en rojo <Tag>Resuelve: sin efecto</Tag>. Las cartas que pagan su costo (las que se mueven entre el eslabón y el paso siguiente de la cadena) llevan <Tag>Cadena 1 · CL1 · costo</Tag>. Después del último paso de una cadena de dos o más eslabones (o con alguno del rival), un renglón de cierre punteado, que no se toca: cada eslabón con cómo terminó. Quién negó a quién el núcleo no lo dice: no se muestra. Un combo guardado no lleva cadenas. Archivos: <Tag>probability/PracticeMatPanel.tsx</Tag> y <Tag>probability/panel-steps.ts</Tag>
          </>
        }
      >
        <div className="h-[44rem] w-[22rem] max-w-full overflow-hidden rounded-card border border-border-subtle bg-background p-3">
          <PracticeMatPanel steps={steps.slice(0, 8)} initial={combo.initial} cursor={8} onSeek={noop} nameOf={combo.nameOf} artOf={combo.artOf} combos={NO_COMBOS} deckName="" onLoad={noop} onRename={noop} onDelete={noop} showCombos={false} chains={SAMPLE_CHAINS} className="h-full" />
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
        note={<>Como la de YouTube: a la izquierda la hamburguesa (contrae el menú lateral; se ilumina en ámbar) con la marca; en el centro el buscador de la app (<Tag>FeatureSearch</Tag>: escribís «vidas», «pdf», «banlist»… y lleva a la pantalla o abre la herramienta; entre los resultados están las cartas) y a la derecha las mascotas y el idioma, que ya no están en el menú lateral. También se abre con <Tag>/</Tag> y <Tag>Ctrl+K</Tag>; en el celular, con la lupa de la barra de arriba. No está en la práctica ni en la mesa de un duelo. Archivos: <Tag>shell/AppNavbar.tsx</Tag> <Tag>shell/FeatureSearch.tsx</Tag> <Tag>shell/feature-search.ts</Tag></>}
      >
        <div className="grid gap-3">
          <div className="overflow-hidden rounded-card border border-border-subtle">
            <AppNavbar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((current) => !current)} onSearch={() => setFinding(true)} onMascots={() => {}} />
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

        <Specimen title="Barra de abajo y hoja (celular)" layout="free" note={<>Un botón por grupo; tocarlo abre una hoja que prolonga la barra (el mismo índigo, sin velo ni sombra; mide lo que mide su contenido): «Tu deck» con el estado de cada paso a la derecha, «Duelo» con el aviso de la sala en pausa y las demás con una línea que explica cada destino. Con una hoja abierta sólo su grupo va en ámbar; tocar el mismo grupo la cierra. Archivos: <Tag>shell/MobileTabBar.tsx</Tag> <Tag>shell/GroupSheet.tsx</Tag></>}>
          <div className="grid gap-4">
            <div className="w-full max-w-[23.4rem] overflow-hidden rounded-card border border-border-subtle">
              <MobileTabBar groups={groups} activeKey={active} openKey={sheetKey} onOpen={setSheetKey} placement="inline" />
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

      <StepListSamples />

      <Specimen title="Final del menú" layout="free" note={<>Las tres redes del autor arriba y, debajo, la privacidad y el aviso legal, con la autoría y el aviso de sitio no oficial; va al final de lo que scrollea del menú lateral (no hay pie en ninguna pantalla). Con el menú contraído se desvanece. Archivo: <Tag>shell/SidebarLegal.tsx</Tag></>}>
        <div className="w-60 overflow-hidden rounded-card border border-border-subtle bg-nav">
          <SidebarLegal className="border-t-0" />
        </div>
      </Specimen>
    </div>
  )
}
