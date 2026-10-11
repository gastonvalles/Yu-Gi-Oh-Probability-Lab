// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { currentMascotId, isMascotEnabled, resetMascotChoiceForTests, resetMascotForTests, setMascotEnabled } from '../app/mascot'
import { useHold } from '../app/use-hold'
import { MascotPicker } from '../components/mascot/MascotPicker'

beforeEach(() => {
  localStorage.clear()
  resetMascotChoiceForTests()
  resetMascotForTests()
})

afterEach(() => vi.useRealTimers())

describe('el botón del Kuriboh', () => {
  it('despliega las mascotas que hay y marca cómo está la actual', () => {
    render(<MascotPicker placement="below" />)

    expect(screen.queryByRole('group', { name: 'Mascotas disponibles' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mascotas' }))

    expect(screen.getByRole('group', { name: 'Mascotas disponibles' })).toBeInTheDocument()
    expect(screen.getByText('Cupsy')).toBeInTheDocument()
    expect(screen.getByText('Afuera')).toBeInTheDocument()
  })

  it('elegir una mascota que descansaba la trae de vuelta y cierra el desplegable', () => {
    setMascotEnabled(false)
    render(<MascotPicker placement="above" />)

    fireEvent.click(screen.getByRole('button', { name: 'Mascotas' }))
    expect(screen.getByText('Descansando')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Cupsy/ }))

    expect(isMascotEnabled()).toBe(true)
    expect(currentMascotId()).toBe('cupsy')
    expect(screen.queryByRole('group', { name: 'Mascotas disponibles' })).not.toBeInTheDocument()
    expect(localStorage.getItem('ygo-lab:mascot')).toBeNull()
  })

  it('se cierra con Escape y tocando afuera', () => {
    render(<MascotPicker placement="below" />)
    const open = () => fireEvent.click(screen.getByRole('button', { name: 'Mascotas' }))

    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Mascotas disponibles' })).not.toBeInTheDocument()

    open()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('group', { name: 'Mascotas disponibles' })).not.toBeInTheDocument()
  })
})

describe('mantener apretada la mascota', () => {
  it('dispara una sola vez a los siete segundos y no antes', () => {
    vi.useFakeTimers()
    const onHold = vi.fn()
    const { result } = renderHook(() => useHold(onHold, 7000))

    act(() => result.current.start())
    act(() => vi.advanceTimersByTime(6999))
    expect(onHold).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onHold).toHaveBeenCalledTimes(1)

    act(() => vi.advanceTimersByTime(20_000))
    expect(onHold).toHaveBeenCalledTimes(1)
  })

  it('soltar o arrastrar antes de tiempo lo cancela, y volver a apretar arranca de cero', () => {
    vi.useFakeTimers()
    const onHold = vi.fn()
    const { result } = renderHook(() => useHold(onHold, 7000))

    act(() => result.current.start())
    act(() => vi.advanceTimersByTime(5000))
    act(() => result.current.stop())
    act(() => vi.advanceTimersByTime(10_000))
    expect(onHold).not.toHaveBeenCalled()

    act(() => result.current.start())
    act(() => vi.advanceTimersByTime(3000))
    act(() => result.current.start())
    act(() => vi.advanceTimersByTime(6999))
    expect(onHold).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onHold).toHaveBeenCalledTimes(1)
  })

  it('si el componente se va con la cuenta en marcha, no dispara nada', () => {
    vi.useFakeTimers()
    const onHold = vi.fn()
    const { result, unmount } = renderHook(() => useHold(onHold, 7000))

    act(() => result.current.start())
    unmount()
    act(() => vi.advanceTimersByTime(10_000))

    expect(onHold).not.toHaveBeenCalled()
  })
})
