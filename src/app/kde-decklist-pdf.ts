import { PDFDocument, StandardFonts, TextAlignment, type PDFFont, type PDFTextField } from 'pdf-lib'

import type { KdeDecklist } from './kde-decklist'

const NAME_FONT_SIZE = 9
const MIN_NAME_FONT_SIZE = 5
const COUNT_FONT_SIZE = 10
const FIELD_HORIZONTAL_PADDING = 4

// El formulario queda editable: el jugador completa nombre, CARD GAME ID y evento.
export async function fillKdeDecklistPdf(templateBytes: ArrayBuffer | Uint8Array, decklist: KdeDecklist): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes)
  const form = pdf.getForm()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  for (const [fieldName, value] of Object.entries(decklist.fields)) {
    const field = form.getTextField(fieldName)
    field.setText(value)

    if (isCountField(fieldName)) {
      field.setAlignment(TextAlignment.Center)
      field.setFontSize(COUNT_FONT_SIZE)
    } else {
      field.setFontSize(fitFontSize(field, value, font))
    }
  }

  form.updateFieldAppearances(font)
  return pdf.save()
}

function isCountField(fieldName: string): boolean {
  return fieldName.includes('Count') || fieldName.includes('Total')
}

// Los nombres largos se achican para entrar en una sola línea del casillero.
function fitFontSize(field: PDFTextField, value: string, font: PDFFont): number {
  const widget = field.acroField.getWidgets()[0]
  const availableWidth = widget ? widget.getRectangle().width - FIELD_HORIZONTAL_PADDING : Number.POSITIVE_INFINITY
  const widthAtBaseSize = font.widthOfTextAtSize(value, NAME_FONT_SIZE)

  if (widthAtBaseSize <= availableWidth) {
    return NAME_FONT_SIZE
  }

  return Math.max(MIN_NAME_FONT_SIZE, Math.floor((NAME_FONT_SIZE * availableWidth * 10) / widthAtBaseSize) / 10)
}
