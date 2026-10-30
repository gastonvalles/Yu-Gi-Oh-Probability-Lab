import type { Ctx, VideoAssets } from '../../components/replays/video/video-draw'

/** Lo que pinta el video sin lienzo de verdad (jsdom y node no tienen): las imágenes no cargaron y los colores son de mentira. */
export const fakeAssets: VideoAssets = {
  theme: { background: '#000', card: '#111', raised: '#222', border: '#333', primary: '#80c', accent: '#0f9', info: '#fc0', infoSoft: '#fd6', foreground: '#fff', muted: '#aaa', soft: '#888', fieldLine: '#fff', danger: '#f66', success: '#6f6', primaryRgb: '128 0 203', backgroundRgb: '0 0 0', accentRgb: '0 255 153' },
  arts: new Map(),
  back: null,
}

/** Un contexto 2D que acepta todo y cuenta lo que se le pide (para ver que un efecto pinta sin romperse). */
export function fakeCtx(): Ctx & { calls: number } {
  const state = { calls: 0 }
  return new Proxy(state, {
    get: (target, key) => {
      if (key in target) return target[key as keyof typeof target]
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} })
      if (key === 'measureText') return (text: string) => ({ width: text.length * 8 })
      return () => {
        target.calls += 1
      }
    },
    set: () => true,
  }) as unknown as Ctx & { calls: number }
}
