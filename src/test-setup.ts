// Los tests no salen a internet: un `fetch` a un sitio de verdad falla enseguida. Los que necesitan una respuesta la ponen ellos con `vi.stubGlobal('fetch', …)`.
const realFetch = globalThis.fetch

globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

  return /^https?:/.test(url) ? Promise.reject(new TypeError(`No network in tests: ${url}`)) : realFetch(input, init)
}) as typeof fetch
