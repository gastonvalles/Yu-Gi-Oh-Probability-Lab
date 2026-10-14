import { afterEach, describe, expect, it, vi } from 'vitest'

type Message = { id: number; tag: string; handSize?: number }
type Listener = (event: unknown) => void

/** Un worker de mentira: anota lo que recibe y contesta (o falla) cuando el test lo decide. */
class FakeWorker {
  static instances: FakeWorker[] = []
  readonly posted: Message[] = []
  terminated = false
  private readonly listeners: Record<string, Listener[]> = { message: [], error: [] }

  constructor() {
    FakeWorker.instances.push(this)
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners[type]?.push(listener)
  }

  postMessage(message: Message) {
    this.posted.push(message)
  }

  terminate() {
    this.terminated = true
  }

  reply(id: number) {
    this.listeners.message?.forEach((listener) => listener({ data: { id, odds: null } }))
  }

  fail() {
    this.listeners.error?.forEach((listener) => listener({}))
  }
}

/** Un pool nuevo por test (el módulo guarda sus workers): `cores - 2` workers, entre 1 y 3. */
async function loadPool(cores: number) {
  vi.resetModules()
  FakeWorker.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('navigator', { hardwareConcurrency: cores })

  return import('../app/lab-worker-pool')
}

const job = (tag: string) => (id: number) => ({ id, tag })
const posted = (worker: number) => FakeWorker.instances[worker]?.posted.map((message) => message.tag)

/** Contesta el pedido con ese nombre, esté en el worker que esté. */
function answer(tag: string) {
  for (const worker of FakeWorker.instances) {
    const message = worker.posted.find((candidate) => candidate.tag === tag)

    if (message) {
      worker.reply(message.id)
      return
    }
  }

  throw new Error(`nadie recibió ${tag}`)
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('pool de workers del Lab', () => {
  it('cada worker corre un pedido por vez y el resto espera en la cola', async () => {
    const { runInPool } = await loadPool(3)

    void runInPool(job('a'))
    void runInPool(job('b'))
    void runInPool(job('c'))
    expect(posted(0)).toEqual(['a'])

    answer('a')
    expect(posted(0)).toEqual(['a', 'b'])
  })

  it('con varios workers reparte los pedidos entre los libres', async () => {
    const { runInPool } = await loadPool(4)

    void runInPool(job('a'))
    void runInPool(job('b'))
    void runInPool(job('c'))

    expect(posted(0)).toEqual(['a'])
    expect(posted(1)).toEqual(['b'])
  })

  it('lo urgente pasa delante de lo que esperaba, y lo urgente sale en orden de llegada', async () => {
    const { runInPool } = await loadPool(3)

    void runInPool(job('ocupado'))
    void runInPool(job('baja'), 'low')
    void runInPool(job('primero'))
    void runInPool(job('segundo'))

    answer('ocupado')
    answer('primero')
    answer('segundo')

    expect(posted(0)).toEqual(['ocupado', 'primero', 'segundo', 'baja'])
  })

  it('entre pedidos de baja prioridad corre primero el más nuevo', async () => {
    const { runInPool } = await loadPool(3)

    void runInPool(job('ocupado'))
    void runInPool(job('vieja'), 'low')
    void runInPool(job('media'), 'low')
    void runInPool(job('nueva'), 'low')

    answer('ocupado')
    answer('nueva')
    answer('media')

    expect(posted(0)).toEqual(['ocupado', 'nueva', 'media', 'vieja'])
  })

  it('el pedido que espera turno recibe su respuesta cuando le toca', async () => {
    const { runInPool } = await loadPool(3)
    const results: unknown[] = []

    void runInPool(job('a'))
    void runInPool(job('b'))?.then((reply) => results.push(reply))

    answer('a')
    answer('b')
    await vi.advanceTimersByTimeAsync(0)

    expect(results).toEqual([{ id: FakeWorker.instances[0]?.posted[1]?.id, odds: null }])
  })

  it('el tiempo límite se cuenta desde que el pedido arranca, no desde que se pidió', async () => {
    const { runInPool } = await loadPool(3)
    let outcome = 'esperando'

    void runInPool(job('a'))
    runInPool(job('b'))?.then(
      () => (outcome = 'resuelto'),
      (error: Error) => (outcome = error.message),
    )

    await vi.advanceTimersByTimeAsync(29_000)
    answer('a')
    // `b` lleva 58 s desde que se pidió, pero solo 29 corriendo.
    await vi.advanceTimersByTimeAsync(29_000)
    expect(outcome).toBe('esperando')

    await vi.advanceTimersByTimeAsync(1_000)
    expect(outcome).toBe('lab-worker-timeout')
  })

  it('un timeout rechaza solo el pedido que corría y el siguiente sigue en un worker nuevo', async () => {
    const { runInPool, isWorkerTimeout } = await loadPool(3)
    const rejected: unknown[] = []
    const results: unknown[] = []

    runInPool(job('colgado'))?.catch((error) => rejected.push(error))
    runInPool(job('espera'))?.then(
      (reply) => results.push(reply),
      (error) => rejected.push(error),
    )

    await vi.advanceTimersByTimeAsync(30_000)

    expect(rejected).toHaveLength(1)
    expect(isWorkerTimeout(rejected[0])).toBe(true)
    expect(FakeWorker.instances[0]?.terminated).toBe(true)
    expect(FakeWorker.instances).toHaveLength(2)
    expect(posted(1)).toEqual(['espera'])

    answer('espera')
    await vi.advanceTimersByTimeAsync(0)

    expect(results).toHaveLength(1)
    expect(rejected).toHaveLength(1)
  })

  it('si un worker falla se rechaza solo su pedido y no se le manda más trabajo', async () => {
    const { runInPool, isWorkerTimeout } = await loadPool(4)
    const failures: unknown[] = []
    const results: unknown[] = []

    runInPool(job('a'))?.catch((error) => failures.push(error))
    void runInPool(job('b'))
    runInPool(job('c'))?.then((reply) => results.push(reply))

    FakeWorker.instances[0]?.fail()
    await vi.advanceTimersByTimeAsync(0)

    expect(failures).toHaveLength(1)
    expect(failures[0]).toEqual(new Error('lab-worker-error'))
    expect(isWorkerTimeout(failures[0])).toBe(false)
    expect(FakeWorker.instances[0]?.terminated).toBe(true)
    // `c` no va al worker caído: espera al que sigue vivo.
    expect(posted(0)).toEqual(['a'])
    expect(posted(1)).toEqual(['b'])

    answer('b')
    expect(posted(1)).toEqual(['b', 'c'])
    answer('c')
    await vi.advanceTimersByTimeAsync(0)

    expect(results).toHaveLength(1)
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('si no queda ningún worker, los pedidos en espera se rechazan y el pool deja de aceptar trabajo', async () => {
    const { runInPool } = await loadPool(3)
    const failures: unknown[] = []
    const collect = (error: unknown) => failures.push(error)

    runInPool(job('a'))?.catch(collect)
    runInPool(job('b'))?.catch(collect)
    runInPool(job('c'), 'low')?.catch(collect)

    FakeWorker.instances[0]?.fail()
    await vi.advanceTimersByTimeAsync(0)

    expect(failures).toEqual([new Error('lab-worker-error'), new Error('lab-worker-error'), new Error('lab-worker-error')])
    expect(runInPool(job('d'))).toBeNull()
  })

  it('una respuesta de otro pedido no libera al worker', async () => {
    const { runInPool } = await loadPool(3)

    void runInPool(job('a'))
    void runInPool(job('b'))
    FakeWorker.instances[0]?.reply(9_999)

    expect(posted(0)).toEqual(['a'])
  })

  it('sin Worker devuelve null: el que llama calcula en el hilo principal', async () => {
    vi.resetModules()
    vi.stubGlobal('Worker', undefined)

    const { runInPool } = await import('../app/lab-worker-pool')

    expect(runInPool(job('a'))).toBeNull()
  })
})

describe('requestLabOdds y la prioridad', () => {
  it('lo pedido sin prioridad pasa delante de las variantes de baja prioridad', async () => {
    const { runInPool } = await loadPool(3)
    const { requestLabOdds } = await import('../app/lab-odds-client')
    const odds = (handSize: number) => ({ cards: [], patterns: [], handSize })

    void runInPool(job('ocupado'))
    // El tamaño de mano distingue los pedidos (la caché de requestLabOdds los separa por clave).
    void requestLabOdds('variante', odds(5), 'low')
    void requestLabOdds('practica', odds(6))

    answer('ocupado')

    expect(FakeWorker.instances[0]?.posted.slice(1).map((message) => message.handSize)).toEqual([6])
  })
})
