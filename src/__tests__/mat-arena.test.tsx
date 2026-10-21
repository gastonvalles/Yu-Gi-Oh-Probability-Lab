// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import type { MatPos } from '../app/practice-mat'
import { FieldArt, fieldArtSrc, MatPlate, MatScene, PickMarks } from '../components/probability/MatArena'

afterEach(cleanup)

const ISLAND = 'card-57554544-1'
const CROPPED = '/api/card-image/cards_cropped/57554544.jpg?w=512'
const onField = (pos: MatPos) => ({ id: ISLAND, pos, counters: 0, materials: [] })
const smallArt = (id: string) => `https://images.ygoprodeck.com/images/cards_small/${id.split('-')[1]}.jpg`

describe('el arte de la magia de campo, de fondo de la mitad de quien la activó', () => {
  it('sale de lo que está boca arriba en la Zona de campo: el arte recortado (sin marco ni texto), achicado por el proxy', () => {
    expect(fieldArtSrc(onField('atk'), smallArt)).toBe(CROPPED)
    // Con la imagen entera de la carta, también.
    expect(fieldArtSrc(onField('atk'), () => 'https://images.ygoprodeck.com/images/cards/57554544.jpg')).toBe(CROPPED)
  })

  it('sin fondo: la zona vacía, la carta boca abajo, una del rival que no se sabe cuál es y una imagen que no es de YGOPRODeck', () => {
    expect(fieldArtSrc(null, smallArt)).toBeNull()
    expect(fieldArtSrc(onField('set'), smallArt)).toBeNull()
    expect(fieldArtSrc(onField('atk'), () => null)).toBeNull()
    expect(fieldArtSrc(onField('atk'), () => 'https://tcgplayer-cdn.tcgplayer.com/product/1234_200w.jpg')).toBeNull()
  })

  it('es decoración en la mitad de cada uno, por las líneas de la grilla: aparece cuando llegó la imagen y, si la carta se va, se apaga con la última', () => {
    const { container, rerender } = render(<FieldArt side="mine" src={null} />)

    // Sin magia de campo, nada.
    expect(container).toBeEmptyDOMElement()

    rerender(<FieldArt side="mine" src={CROPPED} />)
    const layer = container.firstElementChild as HTMLElement
    const image = layer.querySelector('img')!

    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer).toHaveClass('mat-field-art')
    expect(image).toHaveAttribute('alt', '')
    // Tus filas (de la de monstruos a la de las pilas), de punta a punta: la fila del medio no es de nadie.
    expect(layer.style.gridArea).toBe('m1-start / extra-start / extra-end / deck-end')
    // Hasta que la imagen no llegó, no se ve (no entra a medio cargar).
    expect(layer).toHaveAttribute('data-shown', 'false')
    fireEvent.load(image)
    expect(layer).toHaveAttribute('data-shown', 'true')

    // Boca abajo o al cementerio: se queda con la imagen mientras se apaga.
    rerender(<FieldArt side="mine" src={null} />)
    expect(layer).toHaveAttribute('data-shown', 'false')
    expect(layer.querySelector('img')).toHaveAttribute('src', CROPPED)

    // De vuelta boca arriba: la imagen ya está, se ve enseguida.
    rerender(<FieldArt side="mine" src={CROPPED} />)
    expect(layer).toHaveAttribute('data-shown', 'true')
  })

  it('la del rival va en sus filas (las que llevan la `t`), también por las líneas de la grilla', () => {
    const { container } = render(<FieldArt side="theirs" src={CROPPED} />)
    const layer = container.firstElementChild as HTMLElement

    expect(layer).toHaveAttribute('data-side', 'theirs')
    expect(layer.style.gridArea).toBe('tdeck-start / tdeck-start / tm1-end / textra-end')
  })

  it('el estilo: detrás de las casillas y encima de la placa, sin toques, con una máscara que la desvanece y sin desenfoque; con movimiento reducido, sin fundido', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const rule = css.slice(css.indexOf('@utility mat-field-art {'), css.indexOf('/* Una esquina del marco de la placa'))

    expect(rule).toContain('z-index: -9;')
    expect(rule).toContain('pointer-events: none;')
    expect(rule).toContain('mask-image:')
    expect(rule).toContain('object-fit: cover;')
    expect(rule).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*transition: none;/)
    expect(rule).not.toMatch(/blur|backdrop-filter/)
  })
})

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
    expect(studs.filter((stud) => stud.classList.contains('max-[1101px]:hidden'))).toHaveLength(2)
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
