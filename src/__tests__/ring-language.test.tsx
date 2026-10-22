// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createRoleGroupKey, getDeckGroupTheme } from '../app/deck-groups'
import { ProgressRing } from '../components/ui/ProgressRing'
import { SegmentedRing } from '../components/ui/SegmentedRing'
import { formatPer100 } from '../components/ui/ring-shared'
import { BUILD_TONE, RING_ARC, judgeTone, progressTone, type Tone } from '../components/ui/tone'

// El lenguaje de los anillos (docs/design-system.md, «Anillos»): un anillo dice una cosa, el número del centro es lo que dibuja el arco, el arco se lee (3:1) y la pista es una sola.
const CSS = readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8')

/** "R G B" de un token de index.css: `--x-rgb: 1 2 3` o, si no tiene, su hex. */
function tokenRgb(name: string): [number, number, number] {
  const rgb = CSS.match(new RegExp(`--${name}-rgb:\\s*(\\d+) (\\d+) (\\d+);`))
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]

  const hex = CSS.match(new RegExp(`--${name}:\\s*#([0-9a-f]{6});`, 'i'))?.[1]
  if (!hex) throw new Error(`No está el token --${name}`)

  return [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [number, number, number]
}

/** `var(--success-rgb)` → el token; "199 125 255" → esos números. */
function resolve(color: string): [number, number, number] {
  const variable = /var\(--([a-z-]+)-rgb\)/.exec(color)?.[1]

  return variable ? tokenRgb(variable) : (color.split(' ').map(Number) as [number, number, number])
}

/** Contraste WCAG 2.x entre dos colores. */
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const luminance = (rgb: [number, number, number]) =>
    rgb.map((channel) => channel / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index]!, 0)
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]

  return (light + 0.05) / (dark + 0.05)
}

const SURFACES = { tarjeta: tokenRgb('card-background'), lienzo: tokenRgb('background'), pista: tokenRgb('border'), lente: tokenRgb('lavender') }

describe('el arco se lee: 3:1 o más contra la tarjeta, el lienzo, la lente y la pista (fórmula WCAG sobre los tokens)', () => {
  it.each(Object.entries(RING_ARC))('tono %s', (_tone, arc) => {
    for (const [surface, rgb] of Object.entries(SURFACES)) {
      expect(contrast(resolve(arc), rgb), `contra la ${surface}`).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(['starter', 'extender', 'handtrap', 'brick'] as const)('el color del rol %s (identidad)', (role) => {
    for (const [surface, rgb] of Object.entries(SURFACES)) {
      expect(contrast(resolve(getDeckGroupTheme(createRoleGroupKey(role)).rgb), rgb), `contra la ${surface}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('el violeta de marca y el rojo de la paleta no van de arco (por eso brand dibuja en lila y danger en rojo claro)', () => {
    expect(contrast(tokenRgb('primary'), SURFACES.tarjeta)).toBeLessThan(3)
    expect(contrast(tokenRgb('danger'), SURFACES.pista)).toBeLessThan(3)
    expect(RING_ARC.brand).toBe('var(--primary-soft-rgb)')
    expect(RING_ARC.danger).toBe('var(--danger-soft-rgb)')
  })

  it('sobre la tarjeta índigo de la navegación, el arco lavanda y el verde se leen contra su pista', () => {
    for (const arc of [[0xee, 0xe9, 0xff] as [number, number, number], tokenRgb('success')]) {
      expect(contrast(arc, tokenRgb('nav'))).toBeGreaterThanOrEqual(3)
      expect(contrast(arc, tokenRgb('nav-raised'))).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('los cinco anillos', () => {
  it('medida con juicio, progreso y builds dicen su color con una regla', () => {
    expect(judgeTone(true)).toBe<Tone>('success')
    expect(judgeTone(false)).toBe<Tone>('danger')
    expect(progressTone(9, 17)).toBe<Tone>('warning')
    expect(progressTone(17, 17)).toBe<Tone>('success')
    expect(progressTone(0, 0)).toBe<Tone>('warning')
    expect(BUILD_TONE).toEqual({ A: 'brand', B: 'info' })
  })

  it('el número es «de cada 100»: entero, sin «%» y sin mentir en las puntas', () => {
    expect(formatPer100(0.813)).toBe('81')
    expect(formatPer100(0.9952)).toBe('>99')
    expect(formatPer100(0.004)).toBe('<1')
    expect(formatPer100(1)).toBe('100')
    expect(formatPer100(0)).toBe('0')
  })
})

function mockReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced }) as unknown as typeof window.matchMedia
}

describe('ProgressRing', () => {
  beforeEach(() => mockReducedMotion(true))
  afterEach(() => vi.unstubAllGlobals())

  it('es un medidor con su valor: el número entero al centro, el decimal en el nombre y, si se pide, el valor en palabras', () => {
    render(<ProgressRing value={0.783} size={44} label="Yendo 1º: 78.3%" valueText="78 de cada 100" />)
    const meter = screen.getByRole('meter', { name: 'Yendo 1º: 78.3%' })

    expect(meter).toHaveAttribute('aria-valuenow', '78')
    expect(meter).toHaveAttribute('aria-valuetext', '78 de cada 100')
    expect(meter).toHaveTextContent(/^78$/)
  })

  it('una sola pista, índigo y neutra, para todos los tonos; el arco, del color de su tono', () => {
    const { container } = render(
      <>
        <ProgressRing value={0.5} tone="success" label="verde" />
        <ProgressRing value={0.5} tone="danger" label="rojo" />
        <ProgressRing value={0.5} color="var(--accent-rgb)" label="rol" />
      </>,
    )
    const tracks = [...container.querySelectorAll('svg')].map((svg) => svg.querySelector('circle')!)

    expect(tracks.every((track) => track.classList.contains('stroke-border'))).toBe(true)
    expect(screen.getByRole('meter', { name: 'rojo' }).style.getPropertyValue('--tone-rgb')).toBe('var(--danger-soft-rgb)')
    expect(screen.getByRole('meter', { name: 'rol' }).style.getPropertyValue('--tone-rgb')).toBe('var(--accent-rgb)')
  })

  it('«sin medir»: pista punteada, sin arco y «?»; es una imagen (no tiene valor que medir)', () => {
    const { container } = render(<ProgressRing value={0} unmeasured size={64} label="Build B: sin medir" />)
    const ring = screen.getByRole('img', { name: 'Build B: sin medir' })

    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(ring).not.toHaveAttribute('aria-valuenow')
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(container.querySelector('circle')).toHaveAttribute('stroke-dasharray', '4 6')
    expect(ring).toHaveTextContent('?')
  })

  it('con menos de 36 px no lleva número (no se lee): lo dice su nombre', () => {
    render(<ProgressRing value={0.5} size={28} label="Chico: 50%" />)

    expect(screen.getByRole('meter', { name: 'Chico: 50%' })).toHaveTextContent('')
  })
})

describe('SegmentedRing protagonista', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const segments = [
    { key: 'clean', value: 0.81, color: RING_ARC.success },
    { key: 'withProblem', value: 0.004, color: RING_ARC.warning },
    { key: 'noOpening', value: 0.186, color: RING_ARC.danger },
  ]

  it('el centro es el primer tramo (el protagonista) y cuenta de 0 junto con su arco; con movimiento reducido aparece ya', () => {
    mockReducedMotion(true)
    render(<SegmentedRing segments={segments} size={184} strokeWidth={16} label="De cada 100 manos: 81 buenas" format={formatPer100} />)

    expect(screen.getByRole('img', { name: 'De cada 100 manos: 81 buenas' })).toHaveTextContent('81')
  })

  it('con movimiento arranca en 0 y llega exacto al valor del tramo', () => {
    mockReducedMotion(false)
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'performance'] })
    render(<SegmentedRing segments={segments} size={184} strokeWidth={16} label="Reparto" format={formatPer100} />)
    const ring = screen.getByRole('img', { name: 'Reparto' })

    expect(ring).toHaveTextContent(/^0$/)
    // Dos cuadros para que el anillo pase a su valor; después, lo que tarda el tramo en barrerse.
    act(() => {
      vi.advanceTimersByTime(50)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(Number(ring.textContent)).toBeGreaterThan(0)
    expect(Number(ring.textContent)).toBeLessThan(81)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(ring).toHaveTextContent(/^81$/)
  })

  it('la pista es la misma de los demás anillos', () => {
    mockReducedMotion(true)
    const { container } = render(<SegmentedRing segments={segments} size={140} label="Reparto" />)

    expect(container.querySelector('circle')).toHaveClass('stroke-border')
  })
})
