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

  // El `relative` del esqueleto va después de `absolute` en el CSS y le ganaba: el esqueleto quedaba en el flujo y empujaba la imagen (transparente) una carta más abajo.
  // La carta lo recorta, pero la que se reparte no recorta mientras vuela y la mesa sacaba una barra de scroll (y se corría) en la primera mano.
  it('el de una carta que no cargó va encima de la imagen, fuera del flujo', () => {
    const { container } = render(
      <Provider store={store}>
        <CardArt remoteUrl="https://images.ygoprodeck.com/images/cards_small/46986414.jpg" name="Dark Magician" />
      </Provider>,
    )

    expect(container.querySelector('[aria-hidden="true"]')?.className.split(' ')).toContain('absolute!')
  })

  it('el de siempre sí lo lleva', () => {
    const { container } = render(<Skeleton />)

    expect(container.firstElementChild?.className).toContain('before:animate-shimmer')
  })
})
