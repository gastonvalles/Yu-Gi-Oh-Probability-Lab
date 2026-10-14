import { useMemo, useState } from 'react'

import { PILE_TITLES, CardBack } from '../../probability/MatDialogs'
import { DuelTable, type DuelSideView } from '../../duel/DuelTable'
import { CardArt } from '../../CardArt'
import { Icon } from '../../ui/Icon'
import { Segmented } from '../../ui/Segmented'
import { cx } from '../../ui/cx'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'
import { sampleDuel } from './duel-sample'

/**
 * El duelo por enlace: cómo se ven los dos campos. Las tres variantes son las que se ofrecen para el celular; en una
 * ventana ancha se ven con las medidas de escritorio. Para verlas como en el celular, achicá la ventana a menos de 1100 px.
 */
export function DuelSection() {
  const duel = useMemo(sampleDuel, [])
  const [view, setView] = useState<'mine' | 'theirs'>('mine')
  const [open, setOpen] = useState(false)

  return (
    <SpecimenGrid min="24rem">
      <Specimen
        title="A · Todo junto"
        layout="column"
        className="col-span-full"
        note={<>La mesa real: el rival arriba y espejado, las Zonas Extra compartidas en el medio, vos abajo. Archivo: <Tag>duel/DuelTable.tsx</Tag></>}
      >
        <DuelTable mine={duel.mine} theirs={duel.theirs} turn="theirs" />
      </Specimen>

      <Specimen
        title="B · Tira del rival"
        layout="column"
        note="Tu campo entero y el del rival en una tira de resumen; al tocarla se abre su campo arriba del tuyo."
      >
        <RivalStrip side={duel.theirs} open={open} onToggle={() => setOpen((value) => !value)} />
        <DuelTable mine={duel.mine} theirs={duel.theirs} show={open ? 'both' : 'mine'} />
      </Specimen>

      <Specimen
        title="C · Alternar"
        layout="column"
        note="Un campo por vez, con una pestaña para pasar del tuyo al del rival."
      >
        <Segmented
          label="Qué campo ver"
          variant="track"
          value={view}
          onChange={setView}
          options={[
            { value: 'mine', label: 'Mi campo' },
            { value: 'theirs', label: 'Campo rival' },
          ]}
          fullWidth
        />
        <DuelTable mine={duel.mine} theirs={duel.theirs} show={view} turn={view} />
      </Specimen>
    </SpecimenGrid>
  )
}

/** Resumen del rival en una línea (cuántas cartas tiene en cada lado) con sus monstruos en miniatura; al tocarla se abre su campo. */
function RivalStrip({ side, open, onToggle }: { side: DuelSideView; open: boolean; onToggle: () => void }) {
  const { state } = side
  const counts: [string, number][] = [
    [PILE_TITLES.hand, state.hand.length],
    [PILE_TITLES.deck, state.deck.length],
    [PILE_TITLES.extra, state.extra.length],
    [PILE_TITLES.gy, state.gy.length],
    [PILE_TITLES.banished, state.banished.length],
  ]

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="grid w-full gap-1.5 rounded-card border border-border-subtle bg-card-background/70 px-3 py-2 text-left"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-micro font-extrabold uppercase tracking-[0.06em] text-soft">Rival</span>
        <span className="flex flex-wrap gap-x-2 text-micro tabular-nums text-foreground">
          {counts.map(([label, count]) => (
            <span key={label}>
              {label} {count}
            </span>
          ))}
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} className="shrink-0 text-soft" />
      </span>
      {open ? null : (
        <span className="flex gap-1" aria-hidden="true">
          {state.mz.map((placed, index) => {
            const art = placed ? side.artOf(placed.id) : null

            return (
              <span key={index} className={cx('block aspect-[421/614] w-7 overflow-hidden border border-dashed border-tint/20', placed && 'border-solid')}>
                {placed ? art && placed.pos !== 'set' ? <CardArt remoteUrl={art} name="" className="block h-full w-full object-cover" /> : <CardBack className="h-full" /> : null}
              </span>
            )
          })}
        </span>
      )}
    </button>
  )
}
