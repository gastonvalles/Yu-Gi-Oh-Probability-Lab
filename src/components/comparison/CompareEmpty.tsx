import type { LabViewResult } from '../../app/probability-lab'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { formatPer100 } from '../ui/ring-shared'
import { SegmentedRing } from '../ui/SegmentedRing'
import { Skeleton } from '../ui/Skeleton'
import { RING_ARC } from '../ui/tone'
import { per100Exact } from './comparison-rows'

/** Todavía no hay B (primera vez): en el lugar del veredicto, las dos puertas para tener una. */
export function FirstTimeCard({ onTryLab, onImport }: { onTryLab: () => void; onImport: () => void }) {
  return (
    <Card level="hero">
      <EmptyState
        icon="columns"
        title={t('meta.compare.empty.title')}
        actions={
          <>
            {/* `max-w-full`: en 320–360 px «Probar un cambio en el Lab» no entra en un renglón y se salía de la tarjeta; así baja de renglón adentro del botón. */}
            <Button variant="secondary" icon="upload" className="max-w-full" onClick={onImport}>
              {t('meta.compare.import')}
            </Button>
            <Button variant="primary" icon="flask" className="max-w-full" onClick={onTryLab}>
              {t('meta.compare.empty.lab')}
            </Button>
          </>
        }
      >
        {t('meta.compare.empty.body')}
      </EmptyState>
    </Card>
  )
}

interface SameDeckCardProps {
  /** El cálculo de A (es el mismo de B): `null` si no se pudo medir. */
  result: LabViewResult | null
  computing: boolean
  cards: number
  onGoToBuilder: () => void
  onTryLab: () => void
}

/** A y B tienen las mismas cartas en las tres zonas: un solo anillo (el de las dos) y lo que sigue, cambiar cartas o probar un cambio del Lab. */
export function SameDeckCard({ result, computing, cards, onGoToBuilder, onTryLab }: SameDeckCardProps) {
  return (
    <Card level="hero" className="@container grid content-start gap-4" aria-busy={computing}>
      <header className="flex items-center gap-2.5">
        <Icon name="columns" size={24} className="shrink-0 text-foreground" />
        <Heading level="section">{t('meta.compare.same.title')}</Heading>
      </header>
      <div className="flex items-center gap-4">
        <div className="size-26 shrink-0 @min-[30rem]:size-40">
          {computing ? (
            <Skeleton radius="chip" className="size-full" />
          ) : result ? (
            <SegmentedRing
              fluid
              size={160}
              strokeWidth={14}
              format={formatPer100}
              label={t('meta.compare.same.ring', { clean: per100Exact(result.cleanProbability) })}
              segments={[
                { key: 'clean', value: result.cleanProbability, color: RING_ARC.success },
                { key: 'withProblem', value: result.withProblemProbability, color: RING_ARC.warning },
                { key: 'noOpening', value: result.noOpeningProbability, color: RING_ARC.danger },
              ]}
            />
          ) : null}
        </div>
        <div className="grid min-w-0 gap-1">
          <strong className="text-lead font-semibold text-foreground">{t('meta.compare.same.good')}</strong>
          <span className="text-body text-muted">{t('meta.compare.same.body', { count: cards, n: formatInteger(cards) })}</span>
        </div>
      </div>
      <div className="grid gap-3 border-t border-border-subtle pt-4">
        <p className="m-0 text-body text-muted">{t('meta.compare.same.next')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="cards" className="max-w-full" onClick={onGoToBuilder}>
            {t('meta.compare.goToBuilder')}
          </Button>
          <Button variant="primary" icon="flask" className="max-w-full" onClick={onTryLab}>
            {t('meta.compare.empty.lab')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
