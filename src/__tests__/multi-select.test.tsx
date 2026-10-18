// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyLocale } from '../i18n'
import { MultiSelect } from '../components/ui/MultiSelect'

afterEach(() => {
  cleanup()
  applyLocale('es')
})

const OPTIONS = [
  { value: 'a', label: 'Alfa' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
  { value: 'd', label: 'Delta' },
]

/** Con su propio estado, como lo usa la pantalla: lo marcado vuelve como `selected`. */
function Harness({ initial = [], onChange = () => {} }: { initial?: string[]; onChange?: (values: string[]) => void }) {
  const [selected, setSelected] = useState(initial)

  return (
    <MultiSelect
      label="Letras"
      options={OPTIONS}
      selected={selected}
      onChange={(values) => {
        setSelected(values)
        onChange(values)
      }}
    />
  )
}

describe('el selector desplegable de elección múltiple', () => {
  it('cerrado dice qué hay elegido: «Elegir» sin nada, los nombres con uno o dos y la cuenta con más', () => {
    const { rerender } = render(<MultiSelect label="Letras" options={OPTIONS} selected={[]} onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Letras Elegir' })).toBeInTheDocument()

    rerender(<MultiSelect label="Letras" options={OPTIONS} selected={['a']} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Letras Alfa' })).toBeInTheDocument()

    rerender(<MultiSelect label="Letras" options={OPTIONS} selected={['a', 'c']} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Letras Alfa, Gamma' })).toBeInTheDocument()

    rerender(<MultiSelect label="Letras" options={OPTIONS} selected={['a', 'b', 'c']} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Letras 3 elegidos' })).toBeInTheDocument()
  })

  it('dice lo mismo en inglés', () => {
    applyLocale('en')
    const { rerender } = render(<MultiSelect label="Letters" options={OPTIONS} selected={[]} onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Letters Select' })).toBeInTheDocument()

    rerender(<MultiSelect label="Letters" options={OPTIONS} selected={['a', 'b', 'c']} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Letters 3 selected' })).toBeInTheDocument()
  })

  it('arranca cerrado; el botón despliega la lista (aria-expanded, aria-controls) con una casilla por opción, en el orden dado', () => {
    render(<Harness initial={['b']} />)

    const trigger = screen.getByRole('button', { name: 'Letras Beta' })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group', { name: 'Letras' })).toHaveAttribute('id', trigger.getAttribute('aria-controls'))
    expect(screen.getAllByRole('checkbox').map((box) => box.parentElement?.textContent)).toEqual(['Alfa', 'Beta', 'Gamma', 'Delta'])
    expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Alfa' })).not.toBeChecked()
  })

  it('se marcan varias a la vez, la lista queda abierta mientras se marca y el campo cerrado lo refleja', () => {
    const onChange = vi.fn()

    render(<Harness onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Letras Elegir' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gamma' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alfa' }))

    expect(onChange).toHaveBeenLastCalledWith(['c', 'a'])
    // Sigue abierta.
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Letras Alfa, Gamma' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Gamma' }))

    expect(onChange).toHaveBeenLastCalledWith(['a'])

    fireEvent.click(screen.getByRole('button', { name: 'Letras Alfa' }))

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('Escape cierra la lista y devuelve el foco al campo, sin llegar a lo que la contiene', () => {
    const onOuterKey = vi.fn()

    render(
      <div onKeyDown={onOuterKey}>
        <Harness />
      </div>,
    )

    const trigger = screen.getByRole('button', { name: 'Letras Elegir' })

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Alfa' }), { key: 'Escape' })

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(trigger).toHaveFocus()
    expect(onOuterKey).not.toHaveBeenCalled()

    // Con la lista cerrada, Escape sigue su camino.
    fireEvent.keyDown(trigger, { key: 'Escape' })

    expect(onOuterKey).toHaveBeenCalledTimes(1)
  })
})
