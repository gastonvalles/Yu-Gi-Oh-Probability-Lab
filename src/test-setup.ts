import { loadFormatData } from './app/format-data'

// Los tests no salen a internet: un `fetch` a un sitio de verdad falla enseguida. Los que necesitan una respuesta la ponen ellos con `vi.stubGlobal('fetch', …)`.
const realFetch = globalThis.fetch

globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

  return /^https?:/.test(url) ? Promise.reject(new TypeError(`No network in tests: ${url}`)) : realFetch(input, init)
}) as typeof fetch

// En la app las tablas de Genesys y Edison bajan bajo demanda; los tests (síncronos) las encuentran ya cargadas.
// Sólo acá va un `await` de nivel superior: en un módulo que llegue al build fragmentaría el archivo principal.
await loadFormatData()

// Bajo carga (varias suites a la vez, o la propia partida de archivos en paralelo) un `findBy*` o un `waitFor` que espera una pantalla que se carga al usarla o un fundido tarda más de 1 s —el margen
// de Testing Library— sin que haya ningún bug. Más margen: sólo se gasta cuando algo falla de verdad (los que pasan no tardan más). Sólo en los archivos con DOM: los de `node` no cargan la librería.
if (typeof document !== 'undefined') {
  const { configure } = await import('@testing-library/react')

  configure({ asyncUtilTimeout: 4000 })
}
