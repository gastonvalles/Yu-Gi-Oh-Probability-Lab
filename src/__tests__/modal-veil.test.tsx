// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Modal } from '../components/ui/Modal'
import { SideDrawer } from '../components/ui/SideDrawer'

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(cleanup)

/** Lo que pinta fondo entre la mesa y el panel: el velo del `Modal` o del cajón. */
const veils = () => document.body.querySelectorAll('.animate-nav-scrim, [class*="bg-background/"]')
const backdrop = () => screen.getByRole('dialog').parentElement!
const tapBackdrop = () => {
  fireEvent.pointerDown(backdrop())
  fireEvent.click(backdrop())
}

describe('Modal sin velo (los menús de la mesa)', () => {
  it('con velo (lo de siempre) oscurece el fondo; sin velo no pinta nada y el panel lleva el borde marcado', () => {
    const { rerender } = render(<Modal isOpen onClose={() => {}} title="Elegí la posición">x</Modal>)
    expect(veils()).toHaveLength(1)
    expect(screen.getByRole('dialog')).toHaveClass('border-border-subtle', 'shadow-overlay')

    rerender(<Modal isOpen onClose={() => {}} veil={false} title="Elegí la posición">x</Modal>)
    expect(veils()).toHaveLength(0)
    expect(screen.getByRole('dialog')).toHaveClass('border-border', 'shadow-overlay')
    expect(screen.getByRole('dialog')).not.toHaveClass('border-border-subtle')
  })

  it('sin velo sigue siendo un modal: foco adentro, Escape y tocar afuera cierran', async () => {
    const onClose = vi.fn()
    render(<Modal isOpen onClose={onClose} veil={false} title="Más opciones"><button type="button">Sonidos</button></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Más opciones' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    tapBackdrop()
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('sin velo y no descartable: tocar afuera ni Escape lo cierran', () => {
    const onClose = vi.fn()
    render(<Modal isOpen onClose={onClose} veil={false} dismissible={false} size="keypad" title="Ordená las cartas">x</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    tapBackdrop()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('el cajón del chat sin velo: no oscurece y tocar afuera lo cierra', () => {
    const onClose = vi.fn()
    render(<SideDrawer isOpen onClose={onClose} veil={false} title="Chat">x</SideDrawer>)
    expect(veils()).toHaveLength(0)
    expect(screen.getByRole('dialog')).toHaveClass('border-border')
    fireEvent.click(screen.getByRole('dialog').previousElementSibling!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
