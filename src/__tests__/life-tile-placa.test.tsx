// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { LifeTile } from '../components/duel/DuelBar'
import { applyLocale, loadLocale, t } from '../i18n'

// La placa de vidas (Gastón, 2026-10-26: «la vida de ambos jugadores junta y con estética plana»): la chapa del dueño rellena con el texto blanco, las cartas de la mano, el número blanco y la barra
// de 8000 en el color del dueño, que es un medidor (la excepción escrita a «los porcentajes son anillos», sólo para las vidas).
describe('la placa de vidas', () => {
  afterEach(cleanup)

  const chip = (tile: HTMLElement) => tile.querySelector<HTMLElement>('.rounded-full.uppercase')!
  const bar = (tile: HTMLElement) => within(tile).getByRole('meter').firstElementChild!

  it('dice de quién es, cuántas cartas tiene en la mano y cuántas vidas, y el lector de pantalla oye lo mismo en una frase', () => {
    render(<LifeTile name="Rival" life={8000} hand={5} />)
    const tile = screen.getByRole('group', { name: 'Puntos de vida de Rival: 8000. 5 cartas en la mano' })

    expect(chip(tile)).toHaveTextContent('Rival')
    expect(tile).toHaveTextContent('Rival58000')
    expect(within(tile).getByRole('meter', { name: 'Puntos de vida de Rival' })).toBeInTheDocument()
    expect(within(tile).getByRole('meter')).toHaveAttribute('aria-valuemin', '0')
    expect(within(tile).getByRole('meter')).toHaveAttribute('aria-valuemax', '8000')
    expect(within(tile).getByRole('meter')).toHaveAttribute('aria-valuenow', '8000')
  })

  it('la chapa es del dueño, rellena y con el texto blanco (violeta la tuya, magenta la del rival); el número, blanco; la barra, en el color del dueño y del largo de las vidas', () => {
    render(
      <>
        <LifeTile name="Ana" label="Vos" life={6000} mine hand={4} />
        <LifeTile name="Rival" life={8000} hand={5} />
      </>,
    )
    const mine = screen.getByRole('group', { name: /^Puntos de vida de Ana/ })
    const rival = screen.getByRole('group', { name: /^Puntos de vida de Rival/ })

    expect(chip(mine)).toHaveClass('bg-primary', 'text-white')
    expect(chip(rival)).toHaveClass('bg-magenta', 'text-white')
    expect(within(mine).getByText('6000')).toHaveClass('text-foreground')
    expect(bar(mine)).toHaveClass('bg-accent')
    expect(bar(rival)).toHaveClass('bg-info')
    expect((bar(mine) as HTMLElement).style.width).toBe('75%')
    expect(mine).toHaveClass('life-plate', 'border-accent/60')
  })

  it('con un cuarto o menos la barra va en rojo; en 0, también el número; con más de 8000, la barra llena', () => {
    const { rerender } = render(<LifeTile name="Rival" life={2000} />)
    const tile = () => screen.getByRole('group')

    expect(bar(tile())).toHaveClass('bg-danger-soft')
    rerender(<LifeTile name="Rival" life={0} />)
    expect(bar(tile())).toHaveClass('bg-danger-soft')
    expect((bar(tile()) as HTMLElement).style.width).toBe('0%')
    rerender(<LifeTile name="Rival" life={9500} />)
    expect((bar(tile()) as HTMLElement).style.width).toBe('100%')
    expect(within(tile()).getByRole('meter')).toHaveAttribute('aria-valuetext', '9500')
  })

  it('mide lo que medían las de antes (56 px en el celular, 72 en escritorio): nada se corre; la del celular en escritorio (`compact`) no lleva corazón', () => {
    const { rerender } = render(<LifeTile name="Rival" life={8000} />)

    expect(screen.getByRole('group')).toHaveClass('h-14', 'min-[1101px]:h-18')
    rerender(<LifeTile name="Rival" life={8000} compact />)
    expect(screen.getByRole('group')).toHaveClass('h-14')
    expect(screen.getByRole('group')).not.toHaveClass('min-[1101px]:h-18')
    expect(screen.getByRole('group').querySelector('svg')!.parentElement).toHaveClass('hidden')
  })

  // «El OPPONENT que tapa un dorso en el celular»: la chapa ensanchaba la placa del rival (de 85 a 113 px a 390) y tapaba el último dorso de su mano.
  it('la chapa no ensancha la placa: en inglés el rival por defecto dice «Opp.» (el lector oye «Opponent») y en `compact` un nombre largo se corta', async () => {
    await loadLocale('en')
    applyLocale('en')
    try {
      render(<LifeTile name={t('duel.bar.rival')} life={8000} compact />)
      const rival = screen.getByRole('group', { name: "Opponent's life points: 8000" })

      expect(chip(rival)).toHaveTextContent(/^Opp\.$/)
      expect(within(rival).getByRole('meter', { name: "Opponent's life points" })).toBeInTheDocument()
    } finally {
      applyLocale('es')
    }
    cleanup()
    render(<LifeTile name="Maximiliano el Destructor de Mundos" life={8000} compact />)
    const long = screen.getByRole('group', { name: /^Puntos de vida de Maximiliano el Destructor de Mundos/ })

    expect(chip(long)).toHaveTextContent('Maximiliano el Destructor de Mundos')
    expect(chip(long)).toHaveClass('truncate', 'max-[1101px]:max-w-15')
  })
})
