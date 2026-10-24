/// <reference lib="webworker" />
import wasmUrl from 'ocgcore-wasm/lib/ocgcore.sync.wasm?url'
import { preloadedReaders, type DuelData } from './auto-data'
import { createAutoHost, type AutoHost } from './core-host'
import { parseAutoCommand, type AutoEvent } from './protocol'

/**
 * El Worker del núcleo (§3.2 del diseño): posee un `createAutoHost` y habla `AutoCommand` hacia adentro y `AutoEvent` hacia afuera. Lo
 * primero que recibe son los datos del duelo (`{ t: 'data' }`, de `auto-session.ts`): los lectores síncronos salen de ahí. El wasm se
 * compila una sola vez por Worker y cada duelo (y cada `rewind`) lo instancia de nuevo; con `locateFile` el paquete no baja el wasm en
 * base64. Los comandos se atienden de a uno, en el orden en que llegan.
 */

export type WorkerData = { t: 'data' } & Pick<DuelData, 'cards' | 'scripts'>

const post = (event: AutoEvent) => self.postMessage(event)
const module = WebAssembly.compileStreaming(fetch(wasmUrl))
let host: AutoHost | null = null
let queue = Promise.resolve()

self.onmessage = (message: MessageEvent<unknown>) => {
  const data = message.data as Partial<WorkerData> | null

  if (data?.t === 'data' && Array.isArray(data.cards) && data.scripts) {
    host = createAutoHost({
      core: {
        locateFile: () => wasmUrl,
        instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) {
          module
            .then((compiled) => WebAssembly.instantiate(compiled, imports).then((instance) => done(instance, compiled)))
            .catch((error: unknown) => post({ t: 'fault', kind: 'crash', message: `wasm failed: ${error instanceof Error ? error.message : String(error)}` }))

          return {}
        },
      },
      ...preloadedReaders(data as WorkerData, post),
      emit: post,
    })
    return
  }

  const command = parseAutoCommand(data)

  if (!command || !host) return
  const target = host

  queue = queue.then(() => target.handle(command)).catch((error: unknown) => post({ t: 'fault', kind: 'crash', message: `core host failed: ${error instanceof Error ? error.message : String(error)}` }))
}
