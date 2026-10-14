// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardArt } from '../components/CardArt'

// El aviso de la banlist lee el store: acá sólo importa de qué imagen es el arte.
vi.mock('../components/CardLimitBadge', () => ({ CardLimitBadge: () => null }))

const SCAN = 'https://tcgplayer-cdn.tcgplayer.com/product/719835_400w.jpg'
const YGOPRODECK = 'https://images.ygoprodeck.com/images/cards/89631139.jpg'

const image = () => document.querySelector('img')

afterEach(cleanup)

describe('CardArt con imagen de respaldo', () => {
  it('si el escaneo de la impresión no carga, muestra la imagen de YGOPRODeck (por el proxy y, si falla, directa) antes de las iniciales', () => {
    render(<CardArt remoteUrl={SCAN} fallbackUrl={YGOPRODECK} name="Ash Blossom" />)

    expect(image()).toHaveAttribute('src', SCAN)

    fireEvent.error(image()!)
    expect(image()).toHaveAttribute('src', '/api/card-image/cards/89631139.jpg')

    fireEvent.error(image()!)
    expect(image()).toHaveAttribute('src', YGOPRODECK)

    fireEvent.error(image()!)
    expect(image()).toBeNull()
    expect(document.querySelector('[data-card-art]')).toHaveTextContent('AB')
  })

  it('sin imagen de respaldo, o si es la misma, cae directo a las iniciales', () => {
    const { rerender } = render(<CardArt remoteUrl={SCAN} name="Ash Blossom" />)

    fireEvent.error(image()!)
    expect(image()).toBeNull()

    rerender(<CardArt remoteUrl={SCAN} fallbackUrl={SCAN} name="Ash Blossom" key="otra" />)
    fireEvent.error(image()!)
    expect(image()).toBeNull()
  })

  it('al cambiar de imagen vuelve a probar con la nueva (no se queda con el respaldo)', () => {
    const { rerender } = render(<CardArt remoteUrl={SCAN} fallbackUrl={YGOPRODECK} name="Ash Blossom" />)

    fireEvent.error(image()!)
    expect(image()).toHaveAttribute('src', '/api/card-image/cards/89631139.jpg')

    rerender(<CardArt remoteUrl="https://tcgplayer-cdn.tcgplayer.com/product/719836_400w.jpg" fallbackUrl={YGOPRODECK} name="Ash Blossom" />)
    expect(image()).toHaveAttribute('src', 'https://tcgplayer-cdn.tcgplayer.com/product/719836_400w.jpg')
  })
})
