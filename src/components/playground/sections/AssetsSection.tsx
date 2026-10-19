import publicAssets from 'virtual:public-assets'

import { CardArt } from '../../CardArt'
import { AppBrand } from '../../shell/AppBrand'
import { Icon } from '../../ui/Icon'
import { CARD_BACK_URL } from '../../probability/practice-styles'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const IMAGE = /\.(png|jpe?g|webp|gif|svg|ico)$/i
/** Las fuentes de `src/fonts/` (el proceso de build las copia a `assets/` con su hash; acá se ven por su URL de desarrollo). */
const FONT_FILES = import.meta.glob('../../../fonts/*', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const SAMPLE_CARD = { url: 'https://images.ygoprodeck.com/images/cards_small/14558127.jpg', name: 'Ash Blossom & Joyous Spring' }

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/'
const kilobytes = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`)

/** Los archivos de `public/` (la lista sale de la carpeta: un archivo nuevo aparece solo), la marca, las fuentes y las imágenes de cartas. */
export function AssetsSection() {
  const folders = Map.groupBy(publicAssets, (asset) => folderOf(asset.path))

  return (
    <div className="grid gap-4">
      <SpecimenGrid min="22rem">
        <Specimen title="Marca" layout="column" note={<>La marca de la app. Archivo: <Tag>shell/AppBrand.tsx</Tag>. Los íconos de la app y de la pestaña están más abajo, en <Tag>/</Tag>.</>}>
          <AppBrand />
        </Specimen>

        <Specimen title="Cartas" note={<>El dorso es el de YGOPRODeck, por el proxy de imágenes; las cartas, por <Tag>CardArt</Tag> (esqueleto, iniciales si no hay imagen y esquinas rectas).</>}>
          <div className="grid gap-1 text-center text-micro text-soft">
            <img src={CARD_BACK_URL} alt="Dorso de una carta" className="h-36 w-auto" />
            <Tag>card-back-sm.webp</Tag>
          </div>
          <div className="grid gap-1 text-center text-micro text-soft">
            <div className="h-36 w-[6.2rem]">
              <CardArt remoteUrl={SAMPLE_CARD.url} name={SAMPLE_CARD.name} className="block h-full w-full object-cover" />
            </div>
            <Tag>CardArt</Tag>
          </div>
        </Specimen>

        <Specimen title="Fuentes" layout="column" note={<>Lexend Deca, autoalojada (licencia OFL). Archivos: <Tag>src/fonts/</Tag> y <Tag>@font-face</Tag> en <Tag>index.css</Tag>.</>}>
          {Object.entries(FONT_FILES).filter(([path]) => path.endsWith('.woff2')).map(([path, url]) => (
            <div key={path} className="grid gap-0.5">
              <code className="text-micro text-soft">{path.split('/').pop()}</code>
              <span className="text-lead text-foreground" style={{ fontFamily: `'Lexend Deca'`, fontWeight: path.match(/-(\d{3})-/)?.[1] ?? 400 }} data-font-url={url}>
                Probabilidad de abrir 6 de 10
              </span>
            </div>
          ))}
        </Specimen>
      </SpecimenGrid>

      {[...folders].map(([folder, files]) => (
        <Specimen key={folder} title={`public${folder === '/' ? '' : folder}`} layout="free" note={`${files.length} ${files.length === 1 ? 'archivo' : 'archivos'}`}>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 p-0">
            {files.map((asset) => (
              <li key={asset.path} className="grid min-w-0 content-start justify-items-center gap-2 rounded-card border border-border-subtle bg-tint/4 p-3 text-center">
                <a href={asset.path} target="_blank" rel="noreferrer" className="grid size-20 place-items-center rounded-control bg-[repeating-conic-gradient(rgb(255_255_255/0.06)_0%_25%,transparent_0%_50%)] bg-size-[14px_14px] focus-visible:outline-none focus-visible:shadow-focus">
                  {IMAGE.test(asset.path) ? <img src={asset.path} alt="" className="max-h-full max-w-full object-contain" /> : <Icon name="file" size={28} className="text-primary-soft/70" />}
                </a>
                <code className="max-w-full truncate text-micro text-foreground" title={asset.path}>
                  {asset.path.split('/').pop()}
                </code>
                <span className="text-micro text-soft">{kilobytes(asset.bytes)}</span>
              </li>
            ))}
          </ul>
        </Specimen>
      ))}
    </div>
  )
}
