import type { RivalAttack } from './auto/adapter'
import type { WireAct } from './mat-public'
import type { MatAction } from './practice-mat'

/**
 * El ataque del rival que sigue en curso, para su estela (`AttackTrail`) mientras podés responder: el último que declaró (`rivalAttacks`), si después no cambió ninguna vida (el daño, o lo que
 * pagó o ganó alguien: el núcleo no los distingue en la cinta) ni ninguna fase, de ningún lado. Lo que se responde en la ventana (una activación tuya, una suya) no lo termina; si el atacante o
 * tu carta se van del campo, la estela no tiene de dónde ni adónde ir y no se dibuja. Sólo lo público: quién atacó a qué lo cuenta el flujo de jugadas de cada asiento.
 */
export function rivalAttackInCourse(
  attacks: readonly RivalAttack[],
  order: readonly ('mine' | 'theirs')[],
  mine: readonly MatAction[],
  theirs: readonly WireAct[],
  lifeSteps: readonly { at: number }[],
): RivalAttack | null {
  const last = attacks.at(-1)

  if (!last) return null
  // Su lugar en `order`: las tuyas y las suyas de antes.
  const place = last.at + last.index

  if (lifeSteps.some((step) => step.at > place)) return null
  let ownNext = last.at
  let theirsNext = last.index + 1

  for (const side of order.slice(place + 1)) {
    const action = side === 'mine' ? mine[ownNext++] : theirs[theirsNext++]?.action

    if (action?.type === 'phase') return null
  }
  return last
}
