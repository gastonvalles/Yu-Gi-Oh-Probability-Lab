// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Tabs, tabId, type TabOption } from '../components/ui/Tabs'

type Value = 'a' | 'b' | 'c' | 'd'

const OPTIONS: ReadonlyArray<TabOption<Value>> = [
  { value: 'a', label: 'Hand traps' },
  { value: 'b', label: 'Boardbreakers', disabled: true },
  { value: 'c', label: 'La tuya', count: 12, ariaLabel: 'La tuya, con 12 cartas' },
  { value: 'd', label: 'Otra' },
]

function Demo({ initial = 'a', panelId }: { initial?: Value; panelId?: string }) {
  const [value, setValue] = useState<Value>(initial)

  return (
    <>
      <Tabs label="Qué ver" value={value} onChange={setValue} options={OPTIONS} panelId={panelId} />
      {panelId ? <div id={panelId} role="tabpanel" aria-labelledby={tabId(panelId, value)} /> : null}
    </>
  )
}

const tab = (name: string) => screen.getByRole('tab', { name })

describe('Tabs', () => {
  it('es un tablist con su nombre; la elegida lleva aria-selected y es la única que entra con Tab', () => {
    render(<Demo />)

    const list = screen.getByRole('tablist', { name: 'Qué ver' })

    expect(within(list).getAllByRole('tab')).toHaveLength(4)
    expect(tab('Hand traps')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Hand traps')).toHaveAttribute('tabindex', '0')
    expect(tab('Otra')).toHaveAttribute('aria-selected', 'false')
    expect(tab('Otra')).toHaveAttribute('tabindex', '-1')
    // La cuenta se ve; el lector oye la frase entera.
    expect(tab('La tuya, con 12 cartas')).toHaveTextContent('12')

    fireEvent.click(tab('Otra'))
    expect(tab('Otra')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Hand traps')).toHaveAttribute('tabindex', '-1')
  })

  it('las flechas eligen la de al lado (dando la vuelta y saltando la apagada) e Inicio/Fin van a los extremos, con el foco', () => {
    render(<Demo />)

    fireEvent.keyDown(tab('Hand traps'), { key: 'ArrowRight' })
    expect(tab('La tuya, con 12 cartas')).toHaveAttribute('aria-selected', 'true')
    expect(tab('La tuya, con 12 cartas')).toHaveFocus()

    fireEvent.keyDown(tab('La tuya, con 12 cartas'), { key: 'ArrowLeft' })
    expect(tab('Hand traps')).toHaveFocus()
    fireEvent.keyDown(tab('Hand traps'), { key: 'ArrowLeft' })
    expect(tab('Otra')).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tab('Otra'), { key: 'ArrowRight' })
    expect(tab('Hand traps')).toHaveFocus()

    fireEvent.keyDown(tab('Hand traps'), { key: 'End' })
    expect(tab('Otra')).toHaveFocus()
    fireEvent.keyDown(tab('Otra'), { key: 'Home' })
    expect(tab('Hand traps')).toHaveAttribute('aria-selected', 'true')
  })

  it('la apagada no se elige ni con el dedo', () => {
    render(<Demo />)

    expect(tab('Boardbreakers')).toBeDisabled()
    fireEvent.click(tab('Boardbreakers'))
    expect(tab('Hand traps')).toHaveAttribute('aria-selected', 'true')
  })

  it('con un panel, cada pestaña lo nombra en aria-controls y el panel se llama como la elegida', () => {
    render(<Demo panelId="panel" />)

    for (const node of screen.getAllByRole('tab')) {
      expect(node).toHaveAttribute('aria-controls', 'panel')
    }

    expect(screen.getByRole('tabpanel', { name: 'Hand traps' })).toBeInTheDocument()
    fireEvent.click(tab('Otra'))
    expect(screen.getByRole('tabpanel', { name: 'Otra' })).toBeInTheDocument()
  })

  it('la elegida no cambia de ancho: el rótulo reserva el de la negrita con una copia invisible, oculta al lector', () => {
    render(<Demo />)

    for (const node of screen.getAllByRole('tab')) {
      const label = OPTIONS.find((option) => option.value === node.dataset.value)?.label ?? ''
      const [reserve, shown] = within(node).getAllByText(label)

      expect(reserve).toHaveAttribute('aria-hidden', 'true')
      expect(reserve).toHaveClass('invisible', 'font-semibold')
      expect(shown).toHaveClass(node.getAttribute('aria-selected') === 'true' ? 'font-semibold' : 'font-medium')
      // El subrayado está siempre medido igual (todo el ancho de la pestaña), sin animar su ancho.
      expect(node.className).not.toMatch(/transition-(all|\[width)/)
    }
  })
})
