import { useMemo, useState } from 'react'

import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../../deck-mode/deck-workflow-navigation'
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
        <Specimen title="Menú lateral (escritorio)" layout="free" note={<>Reemplaza la barra de arriba. El punto de color dice cómo viene cada paso (verde listo, naranja a medio hacer). Archivos: <Tag>shell/AppSidebar.tsx</Tag> <Tag>shell/SidebarNav.tsx</Tag></>}>
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
