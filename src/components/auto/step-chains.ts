import { chainFeed, type ChainStep } from '../../app/auto/chain-feed'
import type { MatAction } from '../../app/practice-mat'
import type { PanelChainEnd, PanelChainMark, PanelChains } from '../probability/panel-steps'

type ChainLinkOf = NonNullable<ChainStep['link']>

/**
 * Las cadenas de «Jugar solo automático» en la lista de pasos (`PracticeMatPanel.chains`), de `snap.chainSteps` hasta los `count` pasos ya mostrados (como el aviso de la cadena).
 * `actions` son tus jugadas del núcleo (`mineActions`) y `skip`, las que la lista pliega al principio (la mano de apertura): la jugada `i` es el paso `i + 1 - skip`.
 *
 * - La marca va en el paso de la activación: el de `at` (el adaptador anota el eslabón después de su activación), que es «Activar» o, en una Mágica o Trampa que se abrió en la misma
 *   tanda (no emite «Activar»), la que la puso boca arriba. Si esa jugada no es de la carta, la última de ella desde el paso anterior de la cadena; sin ninguna, no hay marca.
 * - Las cartas que se mueven entre el eslabón y el paso siguiente de la cadena pagan su costo («Cadena 1 · CL1 · costo»).
 * - Cada eslabón se resuelve con las jugadas que llegaron entre su `solving` y su `solved`.
 * - El cierre, sólo si la cadena dice algo que su marca no: más de un eslabón, o alguno del rival (los suyos no son pasos tuyos).
 */
export function panelChainsOf(steps: readonly ChainStep[], count: number, actions: readonly MatAction[], skip: number, nameOf: (link: ChainLinkOf) => string): PanelChains {
  const seen = steps.slice(0, Math.min(count, steps.length))
  const marks = new Map<number, PanelChainMark>()
  const ends = new Map<number, PanelChainEnd[]>()
  let chain = 0

  for (let start = 0; start < seen.length; ) {
    let stop = start + 1

    while (stop < seen.length && !(seen[stop]!.kind === 'chain' && seen[stop]!.index === 0)) stop += 1
    const part = seen.slice(start, stop)
    const offset = start

    start = stop
    const feed = chainFeed(part, part.length)

    if (!feed) continue
    chain += 1
    const stateOf = (index: number) => feed.rows.find((row) => row.number === index + 1)?.state ?? 'chained'
    // Quién lo negó (`ChainRow.by`), si se sabe.
    const byOf = (index: number) => {
      const by = feed.rows.find((row) => row.number === index + 1)?.by

      return by ? { by } : {}
    }

    part.forEach((step, k) => {
      const id = step.kind === 'chain' && step.link?.mine ? step.link.card?.id : undefined

      if (!id) return
      const floor = offset + k > 0 ? seen[offset + k - 1]!.at : 0
      let i = step.at - 1

      while (i >= floor && !isActivationOf(actions[i], id)) i -= 1
      const at = i + 1 - skip

      if (i < floor || at < 1) return
      const state = stateOf(step.index)
      const solving = part.find((other) => other.kind === 'solving' && other.index === step.index)
      const solved = part.find((other) => other.kind === 'solved' && other.index === step.index)

      marks.set(at, {
        chain,
        link: step.index + 1,
        result: state === 'negated' || state === 'disabled' ? { negated: true, ...byOf(step.index) } : state === 'solved' && solving && solved ? { negated: false, from: solving.at + 1 - skip, to: solved.at - skip } : null,
      })
      // El costo: el núcleo lo paga después de anotar el eslabón y antes del paso siguiente de la cadena (medido: Pot of Desires destierra, Thunder Dragon se descarta). Sólo
      // las cartas que se mueven: las miras de los objetivos llegan en el mismo tramo y no son costo.
      const next = part[k + 1]

      for (let j = step.at; next && j < next.at; j += 1) {
        if (actions[j]?.type === 'move' && j + 1 - skip >= 1 && !marks.has(j + 1 - skip)) marks.set(j + 1 - skip, { chain, link: step.index + 1, cost: true, result: null })
      }
    })
    const end = part.find((step) => step.kind === 'end')

    if (!feed.done || !end || end.at - skip < 0 || (feed.rows.length === 1 && feed.rows[0]!.mine)) continue
    const links = part.flatMap((step) => (step.kind === 'chain' && step.link ? [{ number: step.index + 1, name: nameOf(step.link), state: stateOf(step.index), ...byOf(step.index) }] : []))

    ends.set(end.at - skip, [...(ends.get(end.at - skip) ?? []), { chain, links }])
  }

  return { marks, ends }
}

/** La jugada que muestra la activación de esa carta: «Activar», o la que la puso boca arriba (una Mágica o Trampa que se abre al activarse). */
const isActivationOf = (action: MatAction | undefined, id: string) => (action?.type === 'activate' || action?.type === 'place' || action?.type === 'position') && action.id === id
