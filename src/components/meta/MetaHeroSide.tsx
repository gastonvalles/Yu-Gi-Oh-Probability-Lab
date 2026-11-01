import type { ReactNode } from 'react'

import { META_DECKS, type MetaRegion } from '../../app/meta'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { setMetaRegion } from '../../app/use-meta-region'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { Badge } from '../ui/Badge'
import { SelectChip } from '../ui/SelectChip'
import { formatMetaDateFull } from './meta-format'

const REGION_OPTIONS = [
  { value: 'tcg', label: 'TCG' },
  { value: 'ocg', label: 'OCG' },
] as const satisfies ReadonlyArray<{ value: MetaRegion; label: string }>

interface MetaHeroSideProps {
  region: MetaRegion
  /** De cuándo son los datos; si no se dice, la de los decks del meta («Actualizado el …»). */
  date?: ReactNode
  /** Qué es esa fecha, al pasarle por encima. */
  dateTitle?: string
}

/**
 * La fila de datos del encabezado de Tier lists, Decks de torneo y Banlists: de cuándo son los datos y «Región: TCG», la misma elección en las tres pantallas
 * (`setMetaRegion`). En el celular, la fecha a la izquierda y la región a la derecha; en escritorio, las dos a la derecha del título.
 */
export function MetaHeroSide({ region, date, dateTitle }: MetaHeroSideProps) {
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 min-[1101px]:w-auto min-[1101px]:justify-end">
      <Badge icon="refresh" title={dateTitle ?? t('meta.screen.updatedTitle')}>
        {date ??
          tRich(
            'meta.updated',
            { lead: (text) => <span className="sr-only min-[1101px]:not-sr-only">{text} </span> },
            { date: formatMetaDateFull(META_DECKS.fetchedAt) },
          )}
      </Badge>
      <SelectChip value={region} onChange={setMetaRegion} options={REGION_OPTIONS} label={t('meta.screen.regionLabel')} showLabel size={isDesktop ? 'md' : 'sm'} />
    </div>
  )
}
