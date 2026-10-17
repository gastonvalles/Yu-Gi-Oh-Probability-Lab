// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DeckBuilderState } from '../app/model'
import { DeckImportDrawer } from '../components/deck-mode/DeckImportDrawer'
import { applyLocale } from '../i18n'
import type { ApiCardSearchResult } from '../ygoprodeck'

const apiCard = (ygoprodeckId: number, name: string, frameType = 'effect'): ApiCardSearchResult => ({
  ygoprodeckId, name, cardType: 'Effect Monster', frameType, description: null, race: 'Zombie', attribute: 'FIRE', level: 3,
  linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
})

const CATALOG = [apiCard(14558127, 'Ash Blossom & Joyous Spring'), apiCard(24224830, 'Called by the Grave')]

// El catálogo de verdad se baja de YGOPRODeck: acá, dos cartas.
vi.mock('../ygoprodeck', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ygoprodeck')>()),
  loadCardCatalog: async () => CATALOG,
}))

const EMPTY_DECK: DeckBuilderState = { deckName: '', main: [], extra: [], side: [], isEditingDeck: false }
const LIST = '3 Ash Blossom & Joyous Spring\n2 Called by the Grave'

function renderDrawer(props: Partial<Parameters<typeof DeckImportDrawer>[0]> = {}) {
  const onApplyImport = vi.fn()
  const onClose = vi.fn()

  render(<DeckImportDrawer isOpen deckBuilder={EMPTY_DECK} deckFormat="unlimited" onApplyImport={onApplyImport} onClose={onClose} {...props} />)

  return { onApplyImport, onClose }
}

beforeEach(() => {
  window.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  applyLocale('es')
})

describe('el importador de decks', () => {
  it('ofrece el archivo y el texto pegado como opciones parejas (no un botón suelto), y el texto se pega ahí mismo', () => {
    renderDrawer()

    // Arranca en «Pegar texto» (como la hoja); «Archivo» y «Enlace» son las otras dos formas.
    expect(screen.getByRole('radiogroup', { name: 'Cómo importar' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Pegar texto' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Enlace' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Archivo' }))
    expect(screen.getByRole('radio', { name: 'Archivo' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Elegir un archivo' })).toBeInTheDocument()
    // Los formatos se dicen con una frase (no con pastillas que parecen botones).
    expect(screen.getByText('Acepta archivos .txt, .json y .ydk')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Pegar texto' }))

    expect(screen.getByRole('radio', { name: 'Pegar texto' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('textbox', { name: 'Lista de cartas' })).toBeInTheDocument()
    expect(screen.getByText(/Una carta por línea, con la cantidad adelante/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Procesar texto' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Elegir un archivo' })).not.toBeInTheDocument()
  })

  it('con un puntero táctil no se habla de arrastrar: las dos frases están y el CSS muestra la que corresponde', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('radio', { name: 'Archivo' }))

    expect(screen.getByText('Arrastrá el archivo acá')).toHaveClass('pointer-coarse:hidden')
    expect(screen.getByText('Elegí un archivo de tu dispositivo')).toHaveClass('hidden', 'pointer-coarse:block')
  })

  it('pegar una lista y procesarla muestra la vista previa con sus acciones en el pie; "Volver" la descarta y deja el texto para corregirlo', async () => {
    renderDrawer()

    fireEvent.click(screen.getByRole('radio', { name: 'Pegar texto' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Lista de cartas' }), { target: { value: LIST } })
    fireEvent.click(screen.getByRole('button', { name: 'Procesar texto' }))

    expect(await screen.findByText('Todo listo para aplicar el import')).toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: 'Importador de deck' })
    const footer = dialog.querySelector('footer')!

    // Las acciones van en el pie (siempre a la vista) y no hay forma de elegir otra cosa sin pasar por "Volver".
    expect(within(footer).getByRole('button', { name: 'Volver' })).toBeInTheDocument()
    expect(within(footer).getByRole('button', { name: 'Importar al builder' })).toBeEnabled()
    expect(screen.queryByRole('radiogroup', { name: 'Cómo importar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()

    fireEvent.click(within(footer).getByRole('button', { name: 'Volver' }))

    expect(screen.getByRole('radio', { name: 'Pegar texto' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('textbox', { name: 'Lista de cartas' })).toHaveValue(LIST)
    expect(dialog.querySelector('footer')).toBeNull()
  })

  it('aplicar manda el deck armado y cierra la ventana', async () => {
    const { onApplyImport, onClose } = renderDrawer()

    fireEvent.click(screen.getByRole('radio', { name: 'Pegar texto' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Lista de cartas' }), { target: { value: LIST } })
    fireEvent.click(screen.getByRole('button', { name: 'Procesar texto' }))
    await screen.findByText('Todo listo para aplicar el import')

    fireEvent.click(screen.getByRole('button', { name: 'Importar al builder' }))

    expect(onApplyImport).toHaveBeenCalledTimes(1)
    expect(onApplyImport.mock.calls[0]![0].main).toHaveLength(5)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('un texto vacío avisa en la misma pestaña, y cambiar de opción borra el aviso', () => {
    renderDrawer()

    fireEvent.click(screen.getByRole('radio', { name: 'Pegar texto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Procesar texto' }))

    expect(screen.getByText('Pegá una lista de cartas si querés cargar la lista a mano.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Archivo' }))

    expect(screen.queryByText('Pegá una lista de cartas si querés cargar la lista a mano.')).not.toBeInTheDocument()
  })

  it('un archivo .ydk también pasa por la vista previa, y "Volver" no deja el archivo marcado como elegido', async () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('radio', { name: 'Archivo' }))

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['#main\n14558127\n14558127\n#extra\n!side\n24224830\n'], 'Mi deck.ydk', { type: 'text/plain' })

    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText('Todo listo para aplicar el import')).toBeInTheDocument()
    expect(screen.getByText('YDK')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Elegir un archivo' })).toBeInTheDocument())
    expect(screen.queryByText(/Archivo seleccionado/)).not.toBeInTheDocument()
  })

  it('Tab gira entre la X y el botón de archivo: el input invisible que abre el botón no es el "último" control', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('radio', { name: 'Archivo' }))

    const dialog = screen.getByRole('dialog', { name: 'Importador de deck' })
    const close = within(dialog).getByRole('button', { name: 'Cerrar importador' })
    const choose = within(dialog).getByRole('button', { name: 'Elegir un archivo' })

    choose.focus()
    fireEvent.keyDown(choose, { key: 'Tab' })
    expect(close).toHaveFocus()

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(choose).toHaveFocus()
  })

  it('al procesar el texto y al volver el foco se queda en el panel (no cae al <body>), y lo que se anuncia vale para un texto y para un archivo', async () => {
    renderDrawer()

    const dialog = screen.getByRole('dialog', { name: 'Importador de deck' })

    fireEvent.click(screen.getByRole('radio', { name: 'Pegar texto' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Lista de cartas' }), { target: { value: LIST } })
    const process = screen.getByRole('button', { name: 'Procesar texto' })
    process.focus()
    fireEvent.click(process)

    // Mientras carga los controles no están: el foco ya está en el panel, y el aviso es neutro.
    expect(dialog).toHaveFocus()
    expect(screen.getByText('Procesando…')).toBeInTheDocument()
    expect(screen.queryByText('Procesando archivo')).not.toBeInTheDocument()

    await screen.findByText('Todo listo para aplicar el import')
    const back = within(dialog).getByRole('button', { name: 'Volver' })
    back.focus()
    fireEvent.click(back)

    expect(dialog).toHaveFocus()
  })

  it('en inglés', () => {
    applyLocale('en')
    renderDrawer()

    expect(screen.getByRole('radiogroup', { name: 'How to import' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'File' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Paste text' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Link' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'File' }))
    expect(screen.getByText('Accepts .txt, .json and .ydk files')).toBeInTheDocument()
    expect(screen.getByText('Pick a file from your device')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Paste text' }))

    expect(screen.getByText(/One card per line, with the quantity first/)).toBeInTheDocument()
  })
})
