interface EdisonTables {
  pool: Set<number>
  forbidden: Set<number>
  limited: Set<number>
  semiLimited: Set<number>
}

/** Las tablas de Genesys y Edison, null hasta que `loadFormatData` termina. Leerlas antes nunca falla: sólo no encuentran nada. */
export const formatTables: { genesys: Record<string, number> | null; edison: EdisonTables | null } = {
  genesys: null,
  edison: null,
}

let loading: Promise<void> | null = null

export function formatDataLoaded(): boolean {
  return formatTables.genesys !== null
}

/** Baja las tablas (una sola vez; después devuelve la misma promesa) y las deja en `formatTables`. Si falla, el próximo llamado vuelve a intentar. */
export function loadFormatData(): Promise<void> {
  loading ??= import('./format-tables')
    .then((tables) => {
      formatTables.genesys = tables.genesysCardData.cards as Record<string, number>
      formatTables.edison = {
        pool: new Set(tables.EDISON_CARD_POOL_IDS),
        forbidden: new Set(tables.EDISON_FORBIDDEN_IDS),
        limited: new Set(tables.EDISON_LIMITED_IDS),
        semiLimited: new Set(tables.EDISON_SEMI_LIMITED_IDS),
      }
    })
    .catch((error: unknown) => {
      loading = null
      throw error
    })

  return loading
}
