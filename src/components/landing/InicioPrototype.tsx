import { useMemo, useState } from 'react'

import { t } from '../../i18n'
import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../deck-mode/deck-workflow-navigation'
import { AppShell } from '../shell/AppShell'
import type { NavGroup } from '../shell/nav-model'
import { LandingContent } from './Landing'

/**
 * PROTOTIPO de la propuesta B de TI-113 (sólo en `npm run dev`, `/?landing=b`): «Inicio» como un paso más de la app, adentro del armazón de siempre (`AppShell`). El menú es el
 * real (`buildAppNavGroups`) con «Inicio» arriba, en un grupo propio; en el celular la barra de abajo no cambia y a «Inicio» se llega tocando la marca de la barra de arriba
 * o desde el cajón. No es la integración: falta el paso `inicio` en `DeckModeScreen` y en `deck-workflow-navigation.ts`.
 */
export default function InicioPrototype() {
  const [active, setActive] = useState<string | null>('inicio')
  const groups = useMemo<NavGroup[]>(() => {
    const app = buildAppNavGroups(
      buildDeckWorkflowNavigationItems({ mainDeckCount: 0, roleCardCount: 0, unclassifiedCardCount: 0, hasCompletedRoleStep: false, patternCount: 0, savedBuildCount: 0 }),
      { duel: true },
    )

    // ponytail: el grupo «Inicio» entra al menú lateral; la barra de abajo del celular lo dejaría como sexto lugar, así que ahí se saca (en la integración, un `tabBar: false` del grupo).
    return [{ key: 'home', label: t('landing.nav.home'), icon: 'layers', items: [{ key: 'inicio', label: t('landing.nav.home'), title: t('landing.nav.home'), icon: 'layers' }] }, ...app]
  }, [])
  const phone = typeof window !== 'undefined' && window.innerWidth < 1101

  return (
    <AppShell groups={phone ? groups.slice(1) : groups} activeKey={active} onSelect={(key) => setActive(key)} contentScrollable searchAvailable>
      <div className="mx-auto w-full max-w-content px-gutter pb-10 min-[1101px]:px-10">
        <LandingContent inApp />
      </div>
    </AppShell>
  )
}
