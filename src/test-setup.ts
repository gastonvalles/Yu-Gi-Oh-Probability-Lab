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
