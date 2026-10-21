// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { FOIL_KINDS } from '../app/card-foil'
import { RarityFoil } from '../components/card-detail/RarityFoil'

describe('RarityFoil', () => {
  it('cada efecto es decoración (aria-hidden) con las mismas siete capas, en orden, y su marco; sólo la Ultimate suma el relieve', () => {
    for (const kind of FOIL_KINDS) {
      const { container, unmount } = render(<RarityFoil kind={kind} frame="monster" />)
      const foil = container.querySelector('.rarity-foil')!

      expect(foil).toHaveAttribute('aria-hidden', 'true')
      expect(foil).toHaveAttribute('data-foil', kind)
      expect(foil).toHaveAttribute('data-frame', 'monster')
      expect([...foil.children].filter((child) => child.tagName === 'SPAN').map((child) => child.className)).toEqual(['rf-glare', 'rf-art', 'rf-detail', 'rf-text', 'rf-sparkle', 'rf-title', 'rf-border', ...(kind === 'ultimate' ? ['rf-relief'] : [])])
      unmount()
    }
  })

  it('un arte extendido lleva el marco «full» (sin ventana del arte)', () => {
    const { container } = render(<RarityFoil kind="ultra" frame="full" />)

    expect(container.querySelector('.rarity-foil')).toHaveAttribute('data-frame', 'full')
  })

  it('el relieve de la Ultimate dibuja la imagen de la carta que tiene al lado y la sigue si cambia', async () => {
    const { container } = render(
      <div>
        <img src="https://example.test/chica.jpg" alt="" />
        <RarityFoil kind="ultimate" />
      </div>,
    )
    const relief = () => container.querySelector<HTMLElement>('.rf-relief')!

    expect(relief().style.backgroundImage).toContain('chica.jpg')

    // La imagen grande reemplaza a la chica (misma etiqueta, otra dirección): el relieve la lee de nuevo.
    container.querySelector('img')!.setAttribute('src', 'https://example.test/grande.jpg')

    await waitFor(() => expect(relief().style.backgroundImage).toContain('grande.jpg'))
  })

  it('con un filtro de grabado para el relieve y sin él en los demás', () => {
    const ultimate = render(<RarityFoil kind="ultimate" />)

    expect(ultimate.container.querySelector('filter#rf-emboss')).not.toBeNull()
    ultimate.unmount()

    const gold = render(<RarityFoil kind="gold" />)

    expect(gold.container.querySelector('filter')).toBeNull()
  })
})
