import { PILE_LAYER_DIM, PILE_LAYER_PX, CARD_BACK, pileDepth } from './practice-styles'

/**
 * El volumen de una pila de cartas (el deck y el Extra): capas de dorso, una por cada seis cartas (hasta 8), cada una un poco más abajo y más oscura que la de arriba, como
 * los cantos de un mazo. Un deck de 40 se ve más grueso que uno de 15 y se va afinando al robar. Asoman debajo de la pila (arriba, la del rival: del lado de afuera del campo,
 * donde no pisan a las demás casillas). Va antes que la carta de arriba, que las tapa; sin cartas, no hay nada.
 */
export function PileStack({ count, up = false }: { count: number; up?: boolean }) {
  const depth = pileDepth(count)

  if (depth === 0) {
    return null
  }

  return (
    <span aria-hidden="true" data-pile-edge className="pointer-events-none absolute inset-0">
      {Array.from({ length: depth }, (_, index) => {
        // La más lejana primero: cada capa nueva va encima de la anterior.
        const layer = depth - index

        return <span key={layer} className={CARD_BACK} style={{ transform: `translateY(${(up ? -1 : 1) * layer * PILE_LAYER_PX}px)`, filter: `brightness(${1 - layer * PILE_LAYER_DIM})` }} />
      })}
    </span>
  )
}
