// El contraste de lo que va encima del remolino contra su peor punto (el píxel más claro del AVIF ya codificado), con alfa plano. Líneas: 3:1; texto: 4,5:1.
// Uso: node scripts/remolino/medir.mjs [carpeta = src/assets/duelo]
import sharp from 'sharp'
import { statSync } from 'node:fs'

const DIR = process.argv[2] ?? 'src/assets/duelo'
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
const cr = (a, b) => { const x = L(a), y = L(b); return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2) }
const mix = (f, a, b) => f.map((v, i) => Math.round(v * a + b[i] * (1 - a)))
// field-line (#fff), el texto apagado y el suave, el cartel y la chapa.
const W = [255, 255, 255], muted = [182, 179, 198], soft = [154, 150, 173], panel = [32, 31, 39], chapa = [24, 24, 28]
for (const d of ['movil', 'escritorio']) {
  const file = `${DIR}/remolino-medio-${d}.avif`
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
  let max = -1, px
  for (let p = 0; p < data.length; p += info.channels) { const c = [data[p], data[p + 1], data[p + 2]], l = L(c); if (l > max) { max = l; px = c } }
  console.log(JSON.stringify({ remolino: d, kb: +(statSync(file).size / 1024).toFixed(1), peor: px, L: +max.toFixed(4),
    siluetaZona70: cr(mix(W, 0.7, px), px), bordePila50: cr(mix(W, 0.5, px), px), bordePila55: cr(mix(W, 0.55, px), px), rotuloBlanco: cr(W, px),
    apagadoSobreCartel92: cr(muted, mix(panel, 0.92, px)), apagadoSobreLinea88: cr(muted, mix(panel, 0.88, px)), suaveSobreLinea88: cr(soft, mix(panel, 0.88, px)),
    apagadoSobreRemolino: cr(muted, px), blancoSobreChapa82: cr(W, mix(chapa, 0.82, px)) }))
}
