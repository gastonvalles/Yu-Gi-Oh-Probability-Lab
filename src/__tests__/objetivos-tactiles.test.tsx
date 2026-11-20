// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardArtPicker } from '../components/card-detail/CardArtPicker'
import { PracticeBoard } from '../components/probability/PracticeBoard'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Carousel } from '../components/ui/Carousel'

vi.mock('../components/CardArt', () => ({ CardArt: ({ name }: { name: string }) => <img alt={name} src="" /> }))

afterEach(cleanup)

/**
 * Con el dedo, lo que se dibuja chico llega a 44 px de zona tocable sin cambiar cómo se ve. jsdom no ve el layout: acá se afirma la utilidad o la clase que lo garantiza;
 * la medida real (elementFromPoint a 369 px, con toque) la tomó quien hizo el cambio.
 */
describe('objetivos táctiles de 44 px', () => {
  it('`touch-area`: una caja invisible centrada de, como mínimo, 44 px (2,75 rem) que sólo se enciende con el dedo', () => {
    const css = readFileSync(path.resolve(__dirname, '..', 'index.css'), 'utf8')
    const block = css.slice(css.indexOf('@utility touch-area'), css.indexOf('@utility touch-area') + 420)

    expect(block).toContain('min-width: 2.75rem')
    expect(block).toContain('min-height: 2.75rem')
    expect(block).toContain('&::before')
  })

  it('las miniaturas de artes: zona de 44 px por `touch-area`, la galería sale 2 px a cada lado y el recorte de la imagen no es del botón (recortaría la zona)', () => {
    const arts = [0, 1, 2].map((id) => ({ id: String(id), imageUrl: `https://img/${id}.jpg`, imageUrlSmall: null, label: '' }))

    render(<CardArtPicker arts={arts} selectedId="0" onSelect={() => {}} direction="column" />)

    const thumb = screen.getAllByRole('button')[0]!

    expect(thumb).toHaveClass('w-9', 'pointer-coarse:touch-area')
    expect(thumb).not.toHaveClass('overflow-hidden')
    expect(thumb.firstElementChild).toHaveClass('overflow-hidden')
    expect(screen.getByRole('group', { name: /artes/i })).toHaveClass('pointer-coarse:-inset-x-0.5', 'pointer-coarse:px-1')
  })

  it('los puntos del carrusel: 44 px de ancho y de alto con el dedo (de 44 px de paso), y bajan de renglón antes que salirse', () => {
    render(
      <Carousel label="Decks">
        <p>Uno</p>
        <p>Dos</p>
      </Carousel>,
    )

    const dot = screen.getByRole('button', { name: 'Ver la 1 de 2' })

    expect(dot).toHaveClass('h-11', 'pointer-coarse:w-11')
    expect(dot.parentElement).toHaveClass('flex-wrap')
  })

  it('el asa de las hojas: subida mide 44 px con el dedo, con los 16 px de más hacia arriba (y el recorte de la hoja los incluye)', () => {
    render(<BottomSheet label="Hoja">contenido</BottomSheet>)

    const grip = screen.getByRole('button', { name: 'Bajar la hoja' })

    expect(grip).toHaveClass('h-7', 'pointer-coarse:h-11', 'pointer-coarse:-mt-4', 'pointer-coarse:pt-4')
    expect(grip.closest('.overflow-clip')).toHaveClass('pointer-coarse:-mt-4', 'pointer-coarse:pt-4')
  })

  it('los chips de salidas y problemas: zona de 44 px de alto por `touch-area` y las filas se separan 12 px con el dedo', () => {
    render(<PracticeBoard openings={[]} problems={[]} activeId={null} caseIndex={0} unplayable unplayableOdds={null} onToggle={vi.fn()} />)

    const chip = screen.getByRole('button', { name: 'Mano no jugable' })

    expect(chip).toHaveClass('min-h-8', 'pointer-coarse:touch-area')
    expect(chip.closest('ul')!.parentElement).toHaveClass('gap-1.5', 'pointer-coarse:gap-y-3')
  })
})
