// El remolino de fondo del duelo (`mat-scene` en src/index.css): una espiral de trazos finos en violeta (#723BFA) y lima (#B9F500) sobre el carbón (#18181C), procedural y con
// semilla fija (sale igual cada vez). Es nuestro: no copia ningún dorso de carta. Los AVIF comiteados en src/assets/duelo/ son la fuente de verdad; esto es para rehacerlos.
// Dibuja en un <canvas> de Chromium (el de @playwright/test, `npx playwright install chromium`) y codifica a AVIF con sharp, bajando la calidad hasta entrar en 60 KB.
// Uso: node scripts/remolino/remolino.mjs [carpeta de salida = src/assets/duelo]. Después, el contraste: node scripts/remolino/medir.mjs.
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const OUT = process.argv[2] ?? 'src/assets/duelo'
const CAP_KB = 60
// El celular a 2× de 390 px y el escritorio (desde 1101 px); el centro de la espiral, en fracción del ancho y del alto. El del celular sale byte a byte igual al comiteado;
// el de escritorio comiteado salió de una pasada anterior del diseño y esto lo rehace parecido, no idéntico (si se rehace, se vuelve a medir con medir.mjs).
const FILES = [
  { name: 'remolino-medio-movil', W: 780, H: 1688, CX: 0.5, CY: 0.34 },
  { name: 'remolino-medio-escritorio', W: 1600, H: 1000, CX: 0.575, CY: 0.4 },
]
// n: trazos por megapíxel; a: opacidad mínima y máxima; lime: parte de los trazos en lima (a media fuerza, limeA); lw: grosor en px; arc: largo angular (rad);
// cap: tope de luminancia relativa (WCAG) de cualquier píxel, para que las líneas blancas y los rótulos se lean encima del punto más claro.
const V = { n: 1400, a: [0.12, 0.3], lime: 0.3, limeA: 0.5, cap: 0.065, lw: [1, 2.2], arc: [0.4, 1.4] }

const draw = ({ W, H, CX, CY, V }) => {
  let s = 0x9e3779b9 // mulberry32: la misma semilla, el mismo remolino
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#18181c'; g.fillRect(0, 0, W, H)
  const ox = W * CX, oy = H * CY, R = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy))
  const count = Math.round(V.n * (W * H) / 1e6), k = 0.42 // k: cuánto se cierra la espiral por radián
  g.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const r0 = R * (0.02 + 0.98 * Math.pow(rnd(), 0.7)), th0 = rnd() * Math.PI * 2
    const arc = V.arc[0] + rnd() * (V.arc[1] - V.arc[0]), steps = 28
    const near = r0 / R // los del centro, más finos y más tenues: el medio del campo queda calmo
    const lime = rnd() < V.lime
    const a = (V.a[0] + rnd() * (V.a[1] - V.a[0])) * (0.65 + 0.35 * near)
    g.strokeStyle = lime ? `rgba(185,245,0,${a * V.limeA})` : `rgba(114,59,250,${Math.min(1, a * 1.5)})`
    g.lineWidth = (V.lw[0] + rnd() * (V.lw[1] - V.lw[0])) * (0.5 + 0.5 * near)
    g.beginPath()
    for (let j = 0; j <= steps; j++) {
      const th = th0 + (arc * j) / steps, r = r0 * Math.exp(-k * (arc * j) / steps)
      const x = ox + r * Math.cos(th), y = oy + r * Math.sin(th)
      j ? g.lineTo(x, y) : g.moveTo(x, y)
    }
    g.stroke()
  }
  const img = g.getImageData(0, 0, W, H), px = img.data, lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  for (let p = 0; p < px.length; p += 4) {
    const L = 0.2126 * lin(px[p]) + 0.7152 * lin(px[p + 1]) + 0.0722 * lin(px[p + 2])
    if (L > V.cap) { const t = Math.sqrt(V.cap / L); for (let k2 = 0; k2 < 3; k2++) px[p + k2] = Math.round(24 + (px[p + k2] - 24) * t) }
  }
  g.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

const browser = await chromium.launch()
const page = await browser.newPage()
for (const f of FILES) {
  const png = Buffer.from((await page.evaluate(draw, { ...f, V })).split(',')[1], 'base64')
  let q = 60, avif
  do { avif = await sharp(png).avif({ quality: q, effort: 7, chromaSubsampling: '4:2:0' }).toBuffer(); q -= 4 } while (avif.length > CAP_KB * 1024 && q > 18)
  writeFileSync(`${OUT}/${f.name}.avif`, avif)
  console.log(`${f.name}.avif ${f.W}x${f.H} q${q + 4} ${(avif.length / 1024).toFixed(1)} KB`)
}
await browser.close()
