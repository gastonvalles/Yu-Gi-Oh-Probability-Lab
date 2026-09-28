// Firefox y Safari pueden leer el blob después del click: revocar la URL
// en el mismo tick llega a cancelar la descarga.
const OBJECT_URL_REVOKE_DELAY_MS = 30_000
const JPEG_QUALITY = 0.92

export function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No pude generar la imagen del deck.'))
          return
        }

        resolve(blob)
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

export function downloadBlob(blob: Blob, filenameBase: string, extension: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${sanitizeFilename(filenameBase)}.${extension}`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS)
}

export function sanitizeFilename(value: string): string {
  const sanitized = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitized || 'deck-export'
}
