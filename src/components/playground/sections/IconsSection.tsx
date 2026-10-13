import { useMemo, useState } from 'react'

import { cx } from '../../ui/cx'
import { ICON_NAMES, Icon } from '../../ui/Icon'
import { Segmented } from '../../ui/Segmented'
import { field } from '../../ui/surfaces'
import { Tag } from '../Specimen'

type Variant = 'linear' | 'bulk' | 'bold'

/** Todos los íconos del set (`ui/Icon.tsx`), en sus tres variantes: la lista sale del propio componente, así que un ícono nuevo aparece solo. */
export function IconsSection() {
  const [variant, setVariant] = useState<Variant>('linear')
  const [size, setSize] = useState('24')
  const [query, setQuery] = useState('')
  const names = useMemo(() => ICON_NAMES.filter((name) => name.includes(query.trim().toLowerCase())), [query])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar un ícono" aria-label="Buscar un ícono" className={cx(field, 'h-10 min-w-0 flex-1 px-3 text-body')} />
        <Segmented<Variant> label="Variante" size="sm" value={variant} onChange={setVariant} options={[{ value: 'linear', label: 'linear' }, { value: 'bulk', label: 'bulk' }, { value: 'bold', label: 'bold' }]} />
        <Segmented label="Tamaño" size="sm" value={size} onChange={setSize} options={[{ value: '18', label: '18' }, { value: '24', label: '24' }, { value: '32', label: '32' }]} />
      </div>
      <p className="m-0 text-micro text-soft">
        <Tag>{names.length}</Tag> de <Tag>{ICON_NAMES.length}</Tag> íconos. <Tag>linear</Tag> es el trazo; <Tag>bulk</Tag> (duotono) es el de las pestañas inactivas y <Tag>bold</Tag> (relleno) el de la activa.
      </p>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 p-0">
        {names.map((name) => (
          <li key={name} className="grid justify-items-center gap-2 rounded-card border border-border-subtle bg-card-background/60 px-2 py-3">
            <Icon name={name} size={Number(size)} variant={variant} className="text-primary-soft [--icon-cut:var(--card-background)]" />
            <code className="max-w-full truncate text-micro text-muted">{name}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}
