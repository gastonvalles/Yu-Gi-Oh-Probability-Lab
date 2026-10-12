// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { StepHero } from '../components/StepHero'
import { DeckModeNavigation } from '../components/deck-mode/DeckModeNavigation'
import { buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'

// jsdom no calcula el layout: lo que se mide a mano en el navegador (que todo quede en el mismo píxel al pasar de una pestaña a
// otra) se cuida acá con las reglas que lo hacen posible. Ver "Reglas para sumar pantallas", punto 7, en docs/design-system.md.
const source = (file: string) => readFileSync(path.join(process.cwd(), 'src', file), 'utf8')

describe('que nada se corra de lugar al cambiar de pestaña', () => {
  it('las pestañas de arriba reservan el ancho de la negrita: al activarse una, ninguna se mueve', () => {
    const items = buildDeckWorkflowNavigationItems({ mainDeckCount: 40, roleCardCount: 40, unclassifiedCardCount: 0, hasCompletedRoleStep: true, patternCount: 2 })

    render(<DeckModeNavigation items={items} activeStep="probability-lab" onStepChange={() => {}} />)

    for (const item of items) {
      // El nombre accesible es uno solo: la copia que reserva el ancho está oculta a los lectores de pantalla.
      const [reserve, shown] = within(screen.getByRole('button', { name: item.label })).getAllByText(item.label)

      expect(reserve).toHaveAttribute('aria-hidden', 'true')
      expect(reserve).toHaveClass('invisible', 'font-semibold')
      expect(shown).toHaveClass(item.key === 'probability-lab' ? 'font-semibold' : 'font-medium')
    }
  })

  it('el título de cada paso tiene un renglón de alto fijo, y todos los pasos llevan subtítulo', () => {
    render(<StepHero title="Un paso" icon="cards" titleAction={<button type="button">Guía</button>} />)

    expect(screen.getByRole('heading', { name: 'Un paso' }).parentElement).toHaveClass('min-h-8')
    // El botón de al lado (44 px en táctil) sobresale con margen negativo: no agranda el renglón ni baja el título.
    expect(screen.getByRole('button', { name: 'Guía' }).parentElement).toHaveClass('-my-1.5')

    // Con subtítulo en todos, el encabezado mide lo mismo en escritorio y el primer bloque arranca en el mismo lugar.
    for (const file of ['DeckRolesPanel', 'ProbabilityPanel', 'comparison/ComparisonScreen', 'ExportDeckPanel', 'meta/MetaScreen', 'replays/ReplaysScreen']) {
      expect(source(`components/${file}.tsx`), file).toMatch(/<StepHero[^>]*?\bsubtitle=/s)
    }
  })

  it('la barra de scroll queda reservada: en la página entera (celular y tablet) y en el contenedor de los pasos (escritorio)', () => {
    expect(source('index.css')).toMatch(/@media \(max-width: 1100px\)\s*\{\s*html\s*\{\s*scrollbar-gutter: stable;/)

    const shell = source('components/deck-mode/DeckModeShell.tsx')

    expect(shell).toContain('min-[1101px]:[scrollbar-gutter:stable]')
    // Fina en todos los pasos: sin `overflow: auto` el navegador reservaría la gruesa y el builder quedaría más angosto.
    expect(shell).toContain('min-[1101px]:[scrollbar-width:thin]')
  })

  it('cambiar de pestaña no desliza ni anima el scroll: la pantalla nueva aparece con un fundido, ya arriba de todo', () => {
    const screenSource = source('components/deck-mode/DeckModeScreen.tsx')

    expect(screenSource).not.toMatch(/behavior:\s*['"]smooth['"]/)
    expect(screenSource).toContain("behavior: 'instant'")
    expect(screenSource).toContain('animate-step-in')

    const keyframes = /@keyframes step-in\s*\{[\s\S]*?\n {2}\}/.exec(source('index.css'))?.[0] ?? ''

    expect(keyframes).toContain('opacity')
    expect(keyframes).not.toContain('transform')
  })
})
