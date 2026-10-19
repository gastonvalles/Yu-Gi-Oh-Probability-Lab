import { useEffect, useMemo, useState } from 'react'

import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../../deck-mode/deck-workflow-navigation'
import { ReplayBar, type ReplayMark, type ReplaySpeed } from '../../probability/ReplayBar'
import { AppShell } from '../../shell/AppShell'
import { AppSidebar } from '../../shell/AppSidebar'
import { GroupSheet } from '../../shell/GroupSheet'
import { MobileTabBar } from '../../shell/MobileTabBar'
import { MobileTopBar } from '../../shell/MobileTopBar'
import { DrawerPanel, NavDrawer } from '../../shell/NavDrawer'
import { SidebarLegal } from '../../shell/SidebarLegal'
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

        <Specimen title="Barra de abajo y hoja (celular)" layout="free" note={<>Un botón por grupo; tocarlo abre una hoja que se apoya sobre la barra (el velo cubre sólo lo de arriba): «Tu deck» con el estado de cada paso a la derecha, «Duelo» con el aviso de la sala en pausa y las demás con una línea que explica cada destino. Con una hoja abierta sólo su grupo va en ámbar; tocar el mismo grupo la cierra. Archivos: <Tag>shell/MobileTabBar.tsx</Tag> <Tag>shell/GroupSheet.tsx</Tag></>}>
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

      <Specimen title="Final del menú" layout="free" note={<>Las tres redes del autor arriba y, debajo, la privacidad y el aviso legal, con la autoría y el aviso de sitio no oficial; va al final de lo que scrollea del menú lateral (no hay pie en ninguna pantalla). Con el menú contraído se desvanece. Archivo: <Tag>shell/SidebarLegal.tsx</Tag></>}>
        <div className="w-60 overflow-hidden rounded-card border border-border-subtle bg-nav">
          <SidebarLegal className="border-t-0" />
        </div>
      </Specimen>
    </div>
  )
}
