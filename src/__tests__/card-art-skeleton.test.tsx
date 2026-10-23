// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { Provider } from 'react-redux'

import { store } from '../app/store'
import { CardArt } from '../components/CardArt'
import { Skeleton } from '../components/ui/Skeleton'

// Las imágenes de las cartas esperan con el esqueleto quieto: el brillo no va por el compositor y, con las ~70 fichas del deck cargando a la vez en un celular,
// recalculaba los estilos en cada cuadro. Los demás esqueletos conservan el brillo.
describe('esqueleto de carga', () => {
  it('el de una carta que todavía no cargó no lleva el brillo animado', () => {
    const { container } = render(
      <Provider store={store}>
        <CardArt remoteUrl="https://images.ygoprodeck.com/images/cards_small/46986414.jpg" name="Dark Magician" />
      </Provider>,
    )
    const skeleton = container.querySelector('[aria-hidden="true"]')

    expect(skeleton).not.toBeNull()
    expect(skeleton?.className).not.toContain('animate-shimmer')
  })

  it('el de siempre sí lo lleva', () => {
    const { container } = render(<Skeleton />)

    expect(container.firstElementChild?.className).toContain('before:animate-shimmer')
  })
})
