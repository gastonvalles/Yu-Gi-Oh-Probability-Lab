// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SearchResultsToolbar } from '../components/search/SearchFeedback'

afterEach(cleanup)

const TOP_0 = /(^|\s)top-0(\s|$)/

/**
 * El navegador pega una barra `sticky` al borde del CONTENIDO del recuadro que se desplaza, no al de su relleno: con `py-2` en el recuadro,
 * una barra pegada con `top-0` queda 8 px más abajo y por ese hueco se ve pasar lo que se desplaza (Gastón, 2026-10-21, en el panel del builder).
 * Por eso la barra lleva el relleno del recuadro en negativo. jsdom no calcula la posición: se mira la clase.
 */
describe('barras pegadas dentro de un recuadro con relleno', () => {
  it('la barra de resultados del celular (recuadro con py-2) se pega con -top-2 y no con top-0', () => {
    const { container } = render(<SearchResultsToolbar layout="mobile" count={3} hasMore={false} sortOrder="default" onSortOrderChange={vi.fn()} />)
    const bar = container.firstElementChild as HTMLElement

    expect(bar).toHaveClass('sticky', '-top-2', '-mt-2')
    expect(bar.className).not.toMatch(TOP_0)
  })

  it('la de escritorio (recuadro sin relleno) sigue pegada con top-0', () => {
    const { container } = render(<SearchResultsToolbar layout="desktop" count={3} hasMore={false} sortOrder="default" onSortOrderChange={vi.fn()} />)
    const bar = container.firstElementChild as HTMLElement

    expect(bar).toHaveClass('sticky', 'top-0')
    expect(bar).not.toHaveClass('-top-2')
  })
})
