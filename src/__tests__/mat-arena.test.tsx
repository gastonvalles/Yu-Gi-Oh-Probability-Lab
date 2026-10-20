// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { MatPlate, MatScene, PickMarks } from '../components/probability/MatArena'

afterEach(cleanup)

describe('la arena de la mesa es decoración: no se lee, no se toca y no ocupa lugar', () => {
  it('el fondo de la mesa es una capa escondida a los lectores de pantalla', () => {
    const { container } = render(<MatScene className="absolute inset-0 -z-10" />)
    const scene = container.firstElementChild as HTMLElement

    expect(scene).toHaveAttribute('aria-hidden', 'true')
    expect(scene).toHaveClass('mat-scene', 'absolute', 'inset-0', '-z-10')
    expect(scene).toBeEmptyDOMElement()
  })

  it('la placa del campo va detrás del campo (`-z-10`), sobresale un poco y trae sus cuatro esquinas y sus cuatro rombos; los de los costados no van en el celular (se cortarían a la mitad)', () => {
    const { container } = render(<MatPlate />)
    const plate = container.firstElementChild as HTMLElement

    expect(plate).toHaveAttribute('aria-hidden', 'true')
    expect(plate).toHaveClass('mat-plate', 'absolute', '-z-10', '-inset-x-[1%]', '-inset-y-[5%]')
    expect(plate.querySelectorAll('.mat-corner')).toHaveLength(4)

    const studs = Array.from(plate.querySelectorAll('.mat-stud'))

    expect(studs).toHaveLength(4)
    // Arriba y abajo van siempre; izquierda y derecha, sólo en escritorio.
    expect(studs.filter((stud) => stud.classList.contains('max-[1100px]:hidden'))).toHaveLength(2)
  })

  it('las marcas de una casilla que se puede elegir: las esquinas siempre y el rombo sólo si está libre', () => {
    const { container, rerender } = render(<PickMarks diamond />)
    const marks = () => container.firstElementChild as HTMLElement

    expect(marks()).toHaveAttribute('aria-hidden', 'true')
    expect(marks()).toHaveClass('mat-pick-marks')
    expect(marks().querySelector('.mat-pick-diamond')).not.toBeNull()

    rerender(<PickMarks diamond={false} />)
    expect(marks().querySelector('.mat-pick-diamond')).toBeNull()
  })
})
