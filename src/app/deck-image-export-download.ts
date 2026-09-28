// Firefox y Safari pueden leer el blob después del click: revocar la URL
// en el mismo tick llega a cancelar la descarga.
const OBJECT_URL_REVOKE_DELAY_MS = 30_000

export async function downloadCanvasAsPng(
  canvas: HTMLCanvasElement,
  filenameBase: string,
): Promise<void> {
  const blob = await canvasToBlob(canvas)
  downloadBlob(blob, `${sanitizeFilename(filenameBase)}.png`)
}

export function downloadTextAsTxt(text: string, filenameBase: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  downloadBlob(blob, `${sanitizeFilename(filenameBase)}.txt`)
}

export function downloadTextAsYdk(text: string, filenameBase: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  downloadBlob(blob, `${sanitizeFilename(filenameBase)}.ydk`)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No pude generar el PNG del deck.'))
        return
      }

      resolve(blob)
    }, 'image/png')
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS)
}

export function sanitizeFilename(value: string): string {
  const sanitized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitized || 'deck-export'
}
