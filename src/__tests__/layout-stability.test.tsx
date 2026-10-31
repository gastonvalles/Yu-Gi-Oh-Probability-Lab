// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { StepHero } from '../components/StepHero'
import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { SidebarNav } from '../components/shell/SidebarNav'

// jsdom no calcula el layout: lo que se mide a mano en el navegador (que todo quede en el mismo píxel al pasar de una pestaña a
// otra) se cuida acá con las reglas que lo hacen posible. Ver "Reglas para sumar pantallas", punto 7, en docs/design-system.md.
const source = (file: string) => readFileSync(path.join(process.cwd(), 'src', file), 'utf8')

describe('que nada se corra de lugar al cambiar de pestaña', () => {
  it('los destinos del menú reservan el ancho de la negrita: al abrirse uno, ninguno se mueve', () => {
    const groups = buildAppNavGroups(
      buildDeckWorkflowNavigationItems({ mainDeckCount: 40, roleCardCount: 40, unclassifiedCardCount: 0, hasCompletedRoleStep: true, patternCount: 2 }),
      { practice: true },
    )

    render(<SidebarNav groups={groups} activeKey="probability-lab" onSelect={() => {}} />)

    // Los ocultos (Crear tier list, que es «La tuya» de Tier lists) no se dibujan.
    for (const item of groups.flatMap((group) => group.items).filter((item) => !item.hidden)) {
      // El nombre accesible es uno solo: la copia que reserva el ancho está oculta a los lectores de pantalla.
      const [reserve, shown] = within(screen.getByRole('button', { name: new RegExp(`^${item.title}`) })).getAllByText(item.label)

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
    for (const file of ['DeckRolesPanel', 'ProbabilityPanel', 'comparison/ComparisonScreen', 'ExportDeckPanel', 'meta/TierListsScreen', 'meta/TournamentDecksScreen', 'replays/ReplaysScreen']) {
      expect(source(`components/${file}.tsx`), file).toMatch(/<StepHero[^>]*?\bsubtitle=/s)
    }
  })

  it('la barra de scroll queda reservada: en la página entera (celular y tablet) y en el contenedor de los pasos (escritorio)', () => {
    expect(source('index.css')).toMatch(/@media \(width < 1101px\)\s*\{\s*html\s*\{\s*scrollbar-gutter: stable;/)

    const shell = source('components/shell/AppShell.tsx')

    expect(shell).toContain('min-[1101px]:[scrollbar-gutter:stable]')
    // Fina en todos los pasos: sin `overflow: auto` el navegador reservaría la gruesa y el builder quedaría más angosto.
    expect(shell).toContain('min-[1101px]:[scrollbar-width:thin]')
  })

  it('lo que envuelve al armazón mide el alto visible (`dvh`), no el de la pantalla sin la barra de direcciones (`vh`): la calculadora de LP no scrollea en el celular', () => {
    expect(source('index.css')).toMatch(/\bbody\s*\{\s*min-height: 100dvh;/)
    expect(source('App.tsx')).toContain('<main className="min-h-dvh ')
    expect(source('App.tsx')).not.toContain('min-h-screen')
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

/** Los .ts, .tsx y .css de `dir` (sin `__tests__`), con su ruta relativa a `base`. */
function fuentes(dir: string, base = dir): [string, string][] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(dir, entrada.name)

    if (entrada.isDirectory()) return entrada.name === '__tests__' ? [] : fuentes(ruta, base)
    if (!/\.(tsx?|css)$/.test(entrada.name)) return []

    return [[path.relative(base, ruta).split(path.sep).join('/'), readFileSync(ruta, 'utf8')]]
  })
}

// Tailwind v4 compila `max-[N]` como `width < N` (exclusivo): el complemento exacto de `min-[N]` es `max-[N]`, con el mismo N.
// Con `max-[1100px]` quedaba 1100 px sin cubrir (ni celular ni escritorio); los pares de 559/560 y 519/520 tenían el mismo hueco.
describe('los cortes entre celular y escritorio no dejan huecos', () => {
  it('ningún archivo de src vuelve a usar un corte de un píxel de menos', () => {
    const prohibidos = ['max-[1100px]', '(max-width: 1100px)', 'max-[559px]', 'max-[519px]']
    const culpables = fuentes(path.join(process.cwd(), 'src')).flatMap(([archivo, texto]) =>
      prohibidos.filter((corte) => texto.includes(corte)).map((corte) => `${archivo}: ${corte}`),
    )

    expect(culpables, 'El complemento de min-[N] es max-[N] (docs/design-system.md, regla 6): para el escritorio usá max-[1101px].').toEqual([])
  })
})
