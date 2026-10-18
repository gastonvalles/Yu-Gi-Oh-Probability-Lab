/**
 * De dónde se juega cada carta y cuándo salió, como los manda YGOPRODeck con `misc=yes` (`misc_info[0]`): la lista de formatos (`formats`) y las fechas de salida en el
 * TCG y en el OCG. Se guardan compactos —una máscara de bits y un año— porque el catálogo son ~14.600 cartas que viven en memoria toda la sesión.
 */

/** Un bit por cada formato que la app ofrece como «pool de cartas». */
export const POOL_BITS = { tcg: 1, ocg: 2, 'master-duel': 4, 'duel-links': 8, 'speed-duel': 16 } as const
export type PoolFormat = keyof typeof POOL_BITS

// Los nombres con los que la API cuenta los formatos. Los que no están acá (Edison, GOAT, Common Charity…) no son un pool de cartas: son listas de prohibidas.
const FORMAT_BY_API_NAME: Record<string, PoolFormat> = {
  TCG: 'tcg',
  OCG: 'ocg',
  'Master Duel': 'master-duel',
  'Duel Links': 'duel-links',
  'Speed Duel': 'speed-duel',
}

export interface CardRelease {
  /** El año en que la carta salió por primera vez, en el TCG o en el OCG; null si la API no trae ninguna fecha (las Fichas, por ejemplo). */
  year: number | null
  /** En qué formatos está, como máscara de bits (`POOL_BITS`). */
  pools: number
}

// El juego salió en 1999: una fecha anterior (la API pone 1990-01-01 en un par de cartas de relleno) no es una salida.
const FIRST_RELEASE_YEAR = 1999

function yearOf(date: unknown): number | null {
  const year = typeof date === 'string' ? Number(date.slice(0, 4)) : Number.NaN

  return Number.isInteger(year) && year >= FIRST_RELEASE_YEAR ? year : null
}

/** Lo de salida de una carta: de su `misc_info[0]`, o nada (`null`) si la respuesta vino sin esos datos (se pidió sin `misc=yes`). */
export function readRelease(miscInfo: unknown): CardRelease | null {
  const misc = Array.isArray(miscInfo) ? miscInfo[0] : undefined

  if (typeof misc !== 'object' || misc === null) {
    return null
  }

  const record = misc as Record<string, unknown>
  const years = [yearOf(record.tcg_date), yearOf(record.ocg_date)].filter((year): year is number => year !== null)
  const formats = Array.isArray(record.formats) ? record.formats : []
  const pools = formats.reduce<number>((mask, format) => mask | (typeof format === 'string' && format in FORMAT_BY_API_NAME ? POOL_BITS[FORMAT_BY_API_NAME[format]!] : 0), 0)

  return { year: years.length > 0 ? Math.min(...years) : null, pools }
}
