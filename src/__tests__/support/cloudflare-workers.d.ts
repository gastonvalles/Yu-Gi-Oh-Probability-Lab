// El Worker del relay importa `cloudflare:workers`, que sólo existe en Cloudflare: acá se declara lo mínimo para que los tests que importan su lógica (`duel-relay-index.test.ts`) compilen.
declare module 'cloudflare:workers' {
  export class DurableObject {
    constructor(ctx: unknown, env: unknown)
  }
}
