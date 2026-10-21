import { META_DECKS, type MetaRegion } from '../../app/meta'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { Badge } from '../ui/Badge'
import { Segmented } from '../ui/Segmented'
import { formatMetaDateFull } from './meta-format'

const REGION_OPTIONS = [
  { value: 'tcg', label: 'TCG' },
  { value: 'ocg', label: 'OCG' },
] as const satisfies ReadonlyArray<{ value: MetaRegion; label: string }>

interface MetaHeroSideProps {
  region: MetaRegion
  onRegionChange: (region: MetaRegion) => void
}

/** Lo que va a la derecha del encabezado de los tier lists y de los decks de torneo: de cuándo son los datos y de qué región. */
export function MetaHeroSide({ region, onRegionChange }: MetaHeroSideProps) {
  return (
    // En celular, un solo renglón: la región ocupa lo que sobra y la fecha va compacta al lado. Desde 560 px (tableta) la región va a su ancho.
    <div className="flex w-full items-center gap-2 min-[1101px]:w-auto">
      <Badge icon="refresh" title={t('meta.screen.updatedTitle')} className="min-[1101px]:order-first">
        {tRich(
          'meta.updated',
          { lead: (text) => <span className="sr-only min-[1101px]:not-sr-only">{text} </span> },
          { date: formatMetaDateFull(META_DECKS.fetchedAt) },
        )}
      </Badge>
      <Segmented
        value={region}
        onChange={onRegionChange}
        options={REGION_OPTIONS}
        label={t('meta.screen.regionLabel')}
        size="sm"
        className="min-w-0 max-[1101px]:order-first max-[560px]:flex-1"
      />
    </div>
  )
}
