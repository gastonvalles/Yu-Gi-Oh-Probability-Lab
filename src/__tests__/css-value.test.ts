import { describe, expect, it } from 'vitest'

import { css, expectClose } from './support/css-value'

/** Cada par: cómo lo escribe jsdom 30 y cómo lo escribe jsdom 31 (los «recibidos» del CI de `main`): el mismo valor. */
const SAME: Array<[string, string]> = [
  ['rotate(1.5707963267948966rad)', 'rotate(1.5708rad)'],
  ['0.8666666666666667 0.8999999999999999 0 12deg', '0.866667 0.9 0 12deg'],
  ['-12px 0', '-12px'],
  ['0px 0', '0px'],
  ['-324px 0px', '-324px'],
  ['487.36922563916295px', '487.369px'],
  ['repeat(5, 95.07384512783258px)', 'repeat(5, 95.0738px)'],
  ['min(3px, 0.8695652173913043%)', 'min(3px, 0.869565%)'],
  ['0 30px', '0px 30px'],
  ['translate3d(106px, 700px, 0)', 'translate3d(106px, 700px, 0px)'],
  ['translate3d(58.4375px, 9.6px, 0) rotate(-2.2deg)', 'translate3d(58.4375px, 9.6px, 0px) rotate(-2.2deg)'],
  ['rgb(192 132 252) 0 0 0 2px', 'rgb(192, 132, 252) 0px 0px 0px 2px'],
]

describe('css: las dos escrituras de jsdom 30 y 31 dan la misma forma', () => {
  it.each(SAME)('%s = %s', (before, after) => {
    expect(css(after)).toBe(css(before))
  })

  it('no confunde valores distintos', () => {
    expect(css('-12px')).not.toBe(css('12px'))
    expect(css('0px 30px')).not.toBe(css('30px 0px'))
    expect(css('translate3d(106px, 700px, 0px)')).not.toBe(css('translate3d(106px, 701px, 0px)'))
    expect(css('rgb(192, 132, 252)')).not.toBe(css('rgb(192, 132, 253)'))
    expect(css('487.369px')).not.toBe(css('487.37px'))
    expect(css('')).toBe('')
    expect(css(null)).toBe('')
  })

  it('el color con comas contiene el mismo trío que el de espacios', () => {
    expect(css('rgb(192, 132, 252) 0px 0px 0px 2px, rgba(192, 132, 252, 0.8) 0px 0px 22px 6px')).toContain('192 132 252')
  })
})

describe('expectClose: lo que conserva jsdom 31', () => {
  it('acepta el número redondeado a 6 cifras (con el viejo y el nuevo) y rechaza uno que se aparte más', () => {
    expectClose(437.157, 437.15716725658194, 6)
    expectClose(437.15716725658194, 437.15716725658194, 6)
    expectClose(447.282, 447.28247383789073, 6)
    expectClose(405.314, 405.31355745989896, 3)
    expect(() => expectClose(437.158, 437.15716725658194, 6)).toThrow()
    expect(() => expectClose(437.16, 437.15716725658194, 6)).toThrow()
  })
})
