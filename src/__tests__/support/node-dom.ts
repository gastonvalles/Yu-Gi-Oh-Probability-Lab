// Un DOM de jsdom en una prueba de `node` (las lentas, que leen el `.cdb` con `node:sqlite`, que el entorno `jsdom` de Vitest no deja importar): se importa PRIMERO, antes que
// React y Testing Library, para montar un hook (`renderHook`) con el núcleo real.
import { createRequire } from 'node:module'

// jsdom viene con Vitest, sin sus tipos: lo poco que se usa, a mano.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string, options: object) => { window: Window & typeof globalThis } }
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' })
const { window } = dom

for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage'] as const) {
  if (!(key in globalThis) || key === 'window' || key === 'document' || key === 'navigator') Object.defineProperty(globalThis, key, { value: window[key as keyof typeof window], configurable: true, writable: true })
}
window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, matchMedia: window.matchMedia })
