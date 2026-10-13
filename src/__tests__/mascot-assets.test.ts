import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { MASCOTS, MASCOT_ANIMATION, MASCOT_STILL, type MascotId } from '../app/mascot'

/** Lo que dice la cabecera de un WebP: el lienzo, si es animado y cuántos cuadros trae. */
function readWebp(file: string) {
  const buf = readFileSync(file)
  const info = { riff: buf.toString('ascii', 0, 4), webp: buf.toString('ascii', 8, 12), animated: false, width: 0, height: 0, frames: 0 }
  let pos = 12

  while (pos + 8 <= buf.length) {
    const tag = buf.toString('ascii', pos, pos + 4)
    const size = buf.readUInt32LE(pos + 4)

    if (tag === 'VP8X') {
      info.animated = (buf[pos + 8]! & 0b10) !== 0
      info.width = 1 + buf.readUIntLE(pos + 12, 3)
      info.height = 1 + buf.readUIntLE(pos + 15, 3)
    } else if (tag === 'ANMF') {
      info.frames += 1
    }

    pos += 8 + size + (size % 2)
  }

  return info
}

const folderOf = (id: MascotId) => join(__dirname, '..', '..', 'public', MASCOTS[id].folder)

describe('los recursos de cada mascota', () => {
  for (const id of Object.keys(MASCOTS) as MascotId[]) {
    describe(MASCOTS[id].name, () => {
      it('tiene una animación por estado: un WebP animado de 192×208, con transparencia y al menos dos cuadros', () => {
        for (const [state, name] of Object.entries(MASCOT_ANIMATION)) {
          const file = join(folderOf(id), name)

          expect(existsSync(file), `${state}: falta ${file}`).toBe(true)
          expect(readWebp(file), state).toMatchObject({ riff: 'RIFF', webp: 'WEBP', animated: true, width: 192, height: 208 })
          expect(readWebp(file).frames, state).toBeGreaterThanOrEqual(2)
        }
      })

      it('tiene el cuadro quieto (PNG de 192×208 con transparencia) para "reducir movimiento" y para la lista', () => {
        const png = readFileSync(join(folderOf(id), MASCOT_STILL))

        expect(png.toString('latin1', 1, 4)).toBe('PNG')
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([192, 208])
        // Tipo de color 6: RGBA.
        expect(png[25]).toBe(6)
      })
    })
  }
})
