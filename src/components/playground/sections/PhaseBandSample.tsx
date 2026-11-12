import { useEffect, useMemo, useState } from 'react'

import { PHASES } from '../../../app/practice-mat'
import { DuelTable } from '../../duel/DuelTable'
import { PHASE_BAND_MS, PhaseBand, PhaseStrip, type PhaseCue } from '../../duel/PhaseBand'
import type { PlayerSide } from '../../duel/player-color'
import { Button } from '../../ui/Button'
import { Segmented } from '../../ui/Segmented'
import { Specimen, Tag } from '../Specimen'
import { sampleDuel } from './duel-sample'

/** La banda de la fase sobre la mesa del duelo, a 390 px: tocá una fase para verla entrar, o la ráfaga (tres fases en medio segundo, como las que pasan solas). Abajo, las doce quietas. */
export function PhaseBandSample() {
  const duel = useMemo(sampleDuel, [])
  const [side, setSide] = useState<PlayerSide>('mine')
  const [cue, setCue] = useState<PhaseCue | null>(null)
  const [burst, setBurst] = useState<number | null>(null)

  // La ráfaga: Draw, Standby y Main Phase 1, a 250 ms una de otra.
  useEffect(() => {
    if (burst === null) return
    const timers = PHASES.slice(0, 3).map((entry, index) => window.setTimeout(() => setCue({ key: burst + index, phase: entry.id, side }), index * 250))

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [burst, side])

  return (
    <Specimen
      title="PhaseBand · la banda de la fase"
      layout="column"
      className="col-span-full"
      note={
        <>
          Como en Master Duel, con los colores de la casa: cruza el campo por la fila del medio (la del botón de fase), la tuya violeta desde la izquierda y la del rival lima desde la derecha (las de sus
          chapas). Sólo el nombre de la fase: el turno lo dicen el color y la chapa. Entra en 200 ms, el nombre llega 100 ms después, se queda y sale por el otro lado: {PHASE_BAND_MS} ms en total, sin que
          nadie la espere. Si llega otra fase mientras se ve, la misma banda cambia de texto y vuelve a contar (la ráfaga). No ataja toques y queda debajo de la cadena y de las preguntas. Con movimiento
          reducido (la preferencia del sistema), sólo aparece y se va. Sólo <Tag>translate</Tag> y <Tag>opacity</Tag>. Archivo: <Tag>duel/PhaseBand.tsx</Tag>
        </>
      }
    >
      <Segmented
        label="De quién es la fase"
        variant="track"
        value={side}
        onChange={setSide}
        options={[
          { value: 'mine', label: 'Tuya' },
          { value: 'theirs', label: 'Del rival' },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        {PHASES.map((entry) => (
          <Button key={entry.id} variant="secondary" size="sm" onClick={() => setCue({ key: Date.now(), phase: entry.id, side })}>
            {entry.short}
          </Button>
        ))}
        <Button variant="secondary" size="sm" icon="play" onClick={() => setBurst(Date.now())}>
          Ráfaga DP → SP → M1
        </Button>
      </div>
      <div className="mx-auto w-full max-w-[24.375rem] [--cell:3.57rem]">
        <DuelTable mine={duel.mine} theirs={duel.theirs} turn={side}>
          <PhaseBand cue={cue} />
        </DuelTable>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['mine', 'theirs'] as const).map((owner) => (
          <div key={owner} className="grid gap-2">
            {PHASES.map((entry) => (
              <PhaseStrip key={entry.id} phase={entry.id} side={owner} />
            ))}
          </div>
        ))}
      </div>
    </Specimen>
  )
}
