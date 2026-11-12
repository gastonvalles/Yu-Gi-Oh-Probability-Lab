// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { renderAuto } from './support/auto-screen-harness'

// El campo no se mueve nunca, tampoco en `x`: la columna de la mesa se recorta de costado y sólo se desplaza hacia abajo (si el navegador la corre para mostrar entero un Cementerio a medio ver, vuelve).

describe('la columna de la mesa', () => {
  it('no se queda desplazada hacia un costado: un scroll en x vuelve a 0 (el campo, la chapa «Vos» y el botón de fases no se corren)', () => {
    renderAuto()
    const column = screen.getByLabelText('Campo').closest<HTMLElement>('.overflow-y-auto')!

    expect(column).toHaveClass('overflow-x-hidden')
    column.scrollLeft = 22
    fireEvent.scroll(column)
    expect(column.scrollLeft).toBe(0)
  })
})
