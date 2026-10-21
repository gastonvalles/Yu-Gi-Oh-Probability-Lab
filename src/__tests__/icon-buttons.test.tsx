// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { SidebarNav } from '../components/shell/SidebarNav'
import { CloseButton, IconButton } from '../components/ui/IconButton'
import { InfoTip } from '../components/ui/InfoTip'
import { Icon } from '../components/ui/Icon'
import { SocialLinks } from '../components/ui/SocialLinks'

afterEach(cleanup)

describe('los íconos blancos se ponen violeta claro al pasar el mouse y al seleccionarlos', () => {
  it('un botón sin texto es blanco y sin fondo; violeta claro al pasar el mouse y mientras está seleccionado, sea cual sea su forma', () => {
    render(
      <>
        {(['raised', 'close', 'ghost', 'flat', 'outline'] as const).map((tone) => (
          <IconButton key={tone} tone={tone} aria-label={tone}>
            <Icon name="plus" />
          </IconButton>
        ))}
        <CloseButton aria-label="cerrar" />
      </>,
    )

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('bg-transparent', 'text-white', 'hover:text-accent', 'aria-pressed:text-accent', 'data-[active=true]:text-accent')
      // Sin resplandor: el verde ya no es del hover y los brillos de adorno están fuera del sistema.
      expect(button.className).not.toContain('drop-shadow')
    }
  })

  it('el botón redondo violeta de la barra (primary) sigue con su relleno: es la acción principal, no un ícono suelto', () => {
    render(
      <IconButton tone="primary" aria-label="reproducir">
        <Icon name="play" />
      </IconButton>,
    )

    expect(screen.getByRole('button', { name: 'reproducir' })).toHaveClass('bg-primary')
    expect(screen.getByRole('button', { name: 'reproducir' })).not.toHaveClass('text-white')
  })

  it('el botón de reproducir (play) es redondo y ámbar, como el de la fase de ahora: lo que se toca; el ícono va oscuro y no blanco', () => {
    render(
      <IconButton tone="play" aria-label="reproducir">
        <Icon name="play" />
      </IconButton>,
    )

    const button = screen.getByRole('button', { name: 'reproducir' })
    expect(button).toHaveClass('rounded-full', 'bg-info', 'text-accent-foreground', 'hover:bg-info-soft')
    expect(button).not.toHaveClass('bg-primary', 'text-white')
  })

  it('las redes del pie y la ⓘ de las ayudas también: blancas, y violeta claro al pasar el mouse', () => {
    render(
      <>
        <SocialLinks />
        <InfoTip label="Ayuda">explicación</InfoTip>
      </>,
    )

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass('text-white', 'hover:text-accent')
    }

    expect(screen.getByRole('button', { name: 'Ayuda' })).toHaveClass('text-white', 'hover:text-accent', 'aria-expanded:text-accent')
  })

  it('los destinos del menú: ícono y rótulo blancos; el ícono se pone ámbar al pasar el mouse, y el destino abierto va ámbar', () => {
    const steps = buildDeckWorkflowNavigationItems({ mainDeckCount: 42, roleCardCount: 40, unclassifiedCardCount: 0, hasCompletedRoleStep: true, patternCount: 1 })
    render(<SidebarNav groups={buildAppNavGroups(steps, { practice: true })} activeKey="export" onSelect={() => {}} />)

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    const inactive = within(nav).getByRole('button', { name: /^Deck Builder/ })
    const active = within(nav).getByRole('button', { name: /^Exportar deck/ })

    expect(inactive).toHaveClass('text-foreground')
    expect(inactive.querySelector('svg')).toHaveClass('text-white', 'group-hover/item:text-nav-active')
    expect(active).toHaveClass('text-nav-active')
    expect(active.querySelector('svg')).toHaveClass('text-nav-active')
    expect(active.querySelector('svg')).not.toHaveClass('text-white')
  })
})
