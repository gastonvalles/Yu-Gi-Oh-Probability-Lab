import { useMemo, useState } from 'react'

import { cx } from '../../ui/cx'
import { Segmented } from '../../ui/Segmented'
import { field } from '../../ui/surfaces'
import { Specimen, SpecimenGrid } from '../Specimen'
import { readThemeTokens, tokenKind, type ThemeToken, type TokenKind } from '../theme-tokens'

const KIND_LABEL: Record<TokenKind, string> = {
  color: 'Colores',
  radius: 'Radios',
  shadow: 'Sombras',
  'font-size': 'Tamaños de texto',
  'font-family': 'Tipografías',
  animation: 'Animaciones',
  size: 'Medidas',
  other: 'Otras variables',
}

const KIND_ORDER: TokenKind[] = ['color', 'radius', 'shadow', 'font-size', 'font-family', 'size', 'animation', 'other']

/** Cada variable de `:root` con una muestra de lo que es. */
function TokenRow({ token, kind }: { token: ThemeToken; kind: TokenKind }) {
  const preview = (() => {
    switch (kind) {
      case 'color':
        return <span className="size-9 shrink-0 rounded-control border border-tint/20" style={{ background: `var(${token.name})` }} />
      case 'radius':
        return <span className="size-9 shrink-0 border-2 border-primary-soft bg-primary/20" style={{ borderRadius: `var(${token.name})` }} />
      case 'shadow':
        return <span className="size-9 shrink-0 rounded-control bg-card-background" style={{ boxShadow: `var(${token.name})` }} />
      case 'font-size':
        return (
          <span className="grid h-9 w-12 shrink-0 place-items-center font-semibold text-foreground" style={{ fontSize: `var(${token.name})`, lineHeight: 1 }}>
            Aa
          </span>
        )
      case 'font-family':
        return (
          <span className="grid h-9 w-12 shrink-0 place-items-center text-lead text-foreground" style={{ fontFamily: `var(${token.name})` }}>
            Aa
          </span>
        )
      default:
        return <span className="h-9 w-12 shrink-0" />
    }
  })()

  return (
    <li className="flex min-w-0 items-center gap-3">
      {preview}
      <span className="grid min-w-0">
        <code className="truncate text-micro font-semibold text-foreground">{token.name}</code>
        <span className="truncate text-micro text-soft" title={token.value}>
          {token.value || '—'}
        </span>
      </span>
    </li>
  )
}

/** Los tokens del diseño leídos de las hojas de estilo: para cambiar uno se toca `src/index.css` (la variable) y cambia en todo lo que lo usa. */
export function TokensSection() {
  const tokens = useMemo(readThemeTokens, [])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<TokenKind | 'all'>('all')
  const grouped = useMemo(() => {
    const words = query.trim().toLowerCase()
    const byKind = new Map<TokenKind, ThemeToken[]>()

    for (const token of tokens) {
      const tokenType = tokenKind(token)

      if ((kind !== 'all' && tokenType !== kind) || (words && !token.name.toLowerCase().includes(words) && !token.value.toLowerCase().includes(words))) continue
      byKind.set(tokenType, [...(byKind.get(tokenType) ?? []), token])
    }

    return KIND_ORDER.flatMap((entry) => (byKind.has(entry) ? [[entry, byKind.get(entry) ?? []] as const] : []))
  }, [tokens, query, kind])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar un token (primary, radius, 0.75rem…)" aria-label="Buscar un token" className={cx(field, 'h-10 min-w-0 flex-1 px-3 text-body')} />
        <Segmented<TokenKind | 'all'>
          label="Tipo de token"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[{ value: 'all', label: 'Todos', count: tokens.length }, ...KIND_ORDER.filter((entry) => tokens.some((token) => tokenKind(token) === entry)).map((entry) => ({ value: entry, label: KIND_LABEL[entry] }))]}
        />
      </div>
      {tokens.length === 0 ? <p className="m-0 text-body text-muted">No se pudieron leer las hojas de estilo.</p> : null}
      {grouped.map(([entry, list]) => (
        <Specimen key={entry} title={`${KIND_LABEL[entry]} · ${list.length}`} layout="free">
          <SpecimenGrid min="15rem">
            <ul className="contents m-0 list-none p-0">
              {list.map((token) => (
                <TokenRow key={token.name} token={token} kind={entry} />
              ))}
            </ul>
          </SpecimenGrid>
        </Specimen>
      ))}
    </div>
  )
}
