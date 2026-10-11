/**
 * Cosméticos de la calculadora de LP: cada uno con sus imágenes en public/cosmetics. Hoy hay una
 * moneda; el día que haya más (monedas, dados, mascotas), acá se suman y se elige cuál usar.
 */
export const COINS = {
  'king-of-games': {
    name: 'King of Games',
    heads: '/cosmetics/coin/king-of-games/heads.png',
    tails: '/cosmetics/coin/king-of-games/tails.png',
  },
} as const
export type CoinId = keyof typeof COINS

export function currentCoin(): (typeof COINS)[CoinId] {
  return COINS['king-of-games']
}
