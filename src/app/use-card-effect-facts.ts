import { useEffect, useState } from 'react'

import { getCardEffectFactNames, loadCardEffects } from './card-effect-data'
import type { EffectFactName } from './card-effect-facts'

/**
 * Los hechos confirmados de los efectos de una carta (`card-effect-facts.ts`, capa 1 del motor de cartas): los baja la primera vez que alguien los pide (un archivo aparte de ~80 KB) y vuelve a dibujar cuando llegan.
 * Sin carta, o sin nada confirmado para ella, es una lista vacía: la pantalla no muestra nada en vez de adivinar.
 */
export function useCardEffectFacts(ygoprodeckId: number | null | undefined): EffectFactName[] {
  const [, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true

    void loadCardEffects().then(() => {
      if (alive) setLoaded(true)
    })

    return () => {
      alive = false
    }
  }, [])

  return ygoprodeckId === null || ygoprodeckId === undefined ? [] : getCardEffectFactNames(ygoprodeckId)
}
