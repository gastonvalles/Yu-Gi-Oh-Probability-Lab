import { expect } from 'vitest'

/**
 * jsdom 31 devuelve los estilos en línea normalizados (jsdom 30, tal como se los escribió): números a 6 cifras significativas, la unidad del cero
 * (`0px`), sin el segundo valor de un `translate` si es cero y los colores con comas. Estos dos ayudantes dejan una afirmación válida con las dos escrituras
 * del MISMO valor: no la aflojan, sólo dejan de depender de cómo se escribió.
 */

/** Forma canónica de un valor de estilo: pasá por acá el valor leído y el esperado, y compará los dos. */
export function css(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/(rgba?)\(([^)]*)\)/g, (_, fn: string, args: string) => `${fn}(${args.replace(/\s*[,/]\s*/g, ' ')})`)
    .replace(/(?<![\w.#])-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, (number) => String(Number(Number(number).toPrecision(6))))
    .replace(/(?<![\w.%#-])0(?![\w.%])/g, '0px')
    .replace(/^(\S+) 0px$/, '$1')
}

/** Como `toBeCloseTo(expected, precision)`, pero sin pedir más de lo que conserva jsdom 31: 6 cifras significativas del valor esperado. */
export function expectClose(actual: number, expected: number, precision = 2): void {
  const rounding = expected === 0 ? 0 : 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(expected))) - 5)

  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(0.5 * 10 ** -precision, rounding * 1.0001))
}
