import { describe, expect, it } from 'vitest'

import { rivalAttackInCourse } from '../app/attack-trail'
import { rivalAttacks } from '../app/auto/adapter'
import type { WireAct } from '../app/mat-public'
import type { MatAction } from '../app/practice-mat'

// El ataque del rival que sigue en curso (su estela, mientras le podés responder): el último que declaró, hasta que cambia una vida (el daño) o una fase.
const wire = (action: MatAction): WireAct => ({ action, reveal: {} })
const attack = (target?: string) => wire({ type: 'attack', id: 'c1', ...(target ? { target } : {}) })
const course = (order: ('mine' | 'theirs')[], mine: MatAction[], theirs: WireAct[], lifeSteps: { at: number }[] = [{ at: 0 }]) =>
  rivalAttackInCourse(rivalAttacks(order, theirs), order, mine, theirs, lifeSteps)

describe('rivalAttackInCourse', () => {
  it('el último ataque declarado sigue en curso: de su monstruo a tu carta, o directo', () => {
    expect(course(['theirs', 'theirs'], [], [wire({ type: 'phase', phase: 'battle' }), attack('card-200-1')])).toMatchObject({ attackerId: 'c1', targetId: 'card-200-1' })
    expect(course(['theirs'], [], [attack()])).toMatchObject({ attackerId: 'c1' })
    expect(course(['theirs'], [], [attack()])?.targetId).toBeUndefined()
  })

  it('sin ataques, nada', () => {
    expect(course(['theirs'], [], [wire({ type: 'phase', phase: 'battle' })])).toBeNull()
    expect(course([], [], [])).toBeNull()
  })

  it('lo que se responde en la ventana (una activación tuya o suya) no lo termina; las vidas de antes del ataque, tampoco', () => {
    const mine: MatAction[] = [{ type: 'activate', id: 'card-900-1' }]
    const theirs = [attack('card-200-1'), wire({ type: 'activate', id: 'c5' })]

    expect(course(['theirs', 'mine', 'theirs'], mine, theirs, [{ at: 0 }])).toMatchObject({ targetId: 'card-200-1' })
  })

  it('se va con el daño: una vida que cambia después del ataque lo termina', () => {
    expect(course(['theirs'], [], [attack('card-200-1')], [{ at: 0 }, { at: 1 }])).toBeNull()
    // Un ataque nuevo, después de ese daño, sí está en curso.
    expect(course(['theirs', 'theirs'], [], [attack('card-200-1'), attack()], [{ at: 0 }, { at: 1 }])).toMatchObject({ index: 1 })
  })

  it('una fase nueva, de cualquiera de los dos, lo termina (la batalla terminó sin daño o empezó otro turno)', () => {
    expect(course(['theirs', 'theirs'], [], [attack('card-200-1'), wire({ type: 'phase', phase: 'main2' })])).toBeNull()
    expect(course(['theirs', 'mine'], [{ type: 'phase', phase: 'draw' }], [attack()])).toBeNull()
  })
})
