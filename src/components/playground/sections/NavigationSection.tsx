import { useEffect, useMemo, useState } from 'react'

import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../../deck-mode/deck-workflow-navigation'
import { ReplayBar, type ReplayMark, type ReplaySpeed } from '../../probability/ReplayBar'
import { AppFooter } from '../../shell/AppFooter'
import { AppShell } from '../../shell/AppShell'
import { AppSidebar } from '../../shell/AppSidebar'
import { DrawerPanel, NavDrawer } from '../../shell/NavDrawer'
import { MobileTopBar } from '../../shell/MobileTopBar'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { StepHero } from '../../StepHero'
import { StepPage } from '../../ui/StepPage'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

/** Un replay de mentira: 36 pasos, con un cambio de fase cada seis y un turno nuevo en la mitad. */
const DEMO_MARKS: ReplayMark[] = Array.from({ length: 36 }, (_, index) => ({ phase: index % 6 === 5, turnStart: index === 18 }))
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

/** El menú (lateral en escritorio, cajón en el celular), la barra de arriba del celular y el pie: lo que arma `AppShell`. Todo sale de `src/components/shell/`. */
export function NavigationSection() {
  const groups = useMemo(
    () =>
      buildAppNavGroups(
        buildDeckWorkflowNavigationItems({ mainDeckCount: 42, roleCardCount: 40, unclassifiedCardCount: 3, hasCompletedRoleStep: false, patternCount: 0 }),
        { practice: true },
      ),
    [],
  )
  const [active, setActive] = useState<string | null>('categorization')
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [shell, setShell] = useState(false)

  return (
    <div className="grid gap-4">
      <Specimen title="Armazón completo" note={<>Prueba el <Tag>AppShell</Tag> a pantalla completa: menú lateral en escritorio, barra con hamburguesa y cajón en el celular (cambia con el ancho de la ventana, 1101 px). Archivo: <Tag>shell/AppShell.tsx</Tag></>}>
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

      <SpecimenGrid min="24rem">
        <Specimen title="Menú lateral (escritorio)" layout="free" note={<>Reemplaza la barra de arriba. Contraído, el ícono de cada fila no se mueve y los rótulos se desvanecen (probalo con la flecha de abajo). Archivos: <Tag>shell/AppSidebar.tsx</Tag> <Tag>shell/SidebarNav.tsx</Tag></>}>
          <div className="flex flex-wrap items-start gap-4">
            <div className="h-[38rem] overflow-hidden rounded-card border border-border-subtle">
              <AppSidebar groups={groups} activeKey={active} onSelect={setActive} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((current) => !current)} />
            </div>
            <div className="h-[38rem] overflow-hidden rounded-card border border-border-subtle">
              <AppSidebar groups={groups} activeKey={active} onSelect={setActive} collapsed onToggleCollapsed={() => setCollapsed((current) => !current)} />
            </div>
          </div>
        </Specimen>

        <Specimen title="Barra de arriba y cajón (celular)" layout="free" note={<>La hamburguesa abre el cajón, que lleva el mismo menú. Archivos: <Tag>shell/MobileTopBar.tsx</Tag> <Tag>shell/NavDrawer.tsx</Tag></>}>
          <div className="grid gap-4">
            <div className="w-full max-w-[23.4rem] overflow-hidden rounded-card border border-border-subtle">
              <MobileTopBar menuOpen={drawer} onMenu={() => setDrawer(true)} />
            </div>
            <div className="h-[34rem] w-full max-w-[20rem] overflow-hidden rounded-card border border-border-subtle">
              <DrawerPanel groups={groups} activeKey={active} onSelect={setActive} onClose={() => {}} />
            </div>
            <Button size="sm" onClick={() => setDrawer(true)}>
              Abrir el cajón de verdad
            </Button>
            <NavDrawer isOpen={drawer} onClose={() => setDrawer(false)} groups={groups} activeKey={active} onSelect={setActive} />
          </div>
        </Specimen>
      </SpecimenGrid>

      <Specimen title="Controles del replay" layout="free" note={<>Como los de YGOPocket: volver al principio, anterior, reproducir, siguiente, la línea de tiempo (se toca, se arrastra o se maneja con el teclado), la lista de pasos y la velocidad. Violeta lo ya visto, verde el paso actual, una rayita naranja los cambios de fase y una línea los turnos. Archivo: <Tag>probability/ReplayBar.tsx</Tag></>}>
        <div className="grid gap-4">
          <div className="rounded-card border border-border-subtle p-3">
            <ReplayDemo />
          </div>
          <div className="w-full max-w-[23.4rem] rounded-card border border-border-subtle p-3">
            <ReplayDemo />
          </div>
        </div>
      </Specimen>

      <Specimen title="Pie" layout="free" note={<>Autoría, aviso de sitio no oficial, redes y privacidad; va abajo de toda pantalla. Archivo: <Tag>shell/AppFooter.tsx</Tag></>}>
        <div className="grid gap-4">
          <div className="overflow-x-auto rounded-card border border-border-subtle">
            <div className="min-w-[68rem]">
              <AppFooter className="min-[1101px]:px-6" />
            </div>
          </div>
          <div className="w-full max-w-[23.4rem] overflow-hidden rounded-card border border-border-subtle">
            <AppFooter />
          </div>
        </div>
      </Specimen>
    </div>
  )
}
