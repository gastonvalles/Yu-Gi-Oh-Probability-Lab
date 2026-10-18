import { useMemo, type ComponentProps } from 'react'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { DesktopSearchPanel } from '../search/DesktopSearchPanel'
import { MobileCardSearch } from '../search/MobileCardSearch'
import { buildCardSearchProps } from '../search/search-model'
import { SideDrawer } from '../ui/SideDrawer'
import { countDeckCopiesByCardId, type DeckBuilderStep } from './DeckBuilderStep'

interface GlobalCardSearchProps {
  /** Lo mismo que recibe el builder: la búsqueda y el deck viven en el controlador, acá sólo se muestran en otro lugar. */
  step: ComponentProps<typeof DeckBuilderStep>
  onClose: () => void
}

function ignorePointerDown() {}

/**
 * El buscador de cartas encima de cualquier pantalla que no sea el builder (que ya lo trae), la práctica ni un duelo (la sala y la mesa; el lobby sí lo tiene): en el celular, la hoja a pantalla completa
 * de siempre; en escritorio, el mismo panel del builder en un cajón por la derecha. Agregar una carta la suma al deck de siempre; el detalle de una
 * carta se abre encima (`CardDetailModal`, que `DeckModeScreen` monta para esto). No se arrastra: el deck no está a la vista.
 */
export function GlobalCardSearch({ step, onClose }: GlobalCardSearchProps) {
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const { deckBuilder } = step
  const deckCopyCounts = useMemo(() => countDeckCopiesByCardId(deckBuilder), [deckBuilder])
  const { search, actions } = buildCardSearchProps(step)

  if (!isDesktop) {
    return (
      <MobileCardSearch
        search={search}
        actions={actions}
        deckCopyCounts={deckCopyCounts}
        zoneCounts={{ main: deckBuilder.main.length, extra: deckBuilder.extra.length, side: deckBuilder.side.length }}
        onAddCard={step.onAddSearchResultToDefaultZone}
        onOpenDetail={step.onSearchResultClick}
        onClose={onClose}
      />
    )
  }

  return (
    <SideDrawer isOpen onClose={onClose} title={t('shell.search.title')} size="column">
      <div className="flex h-full min-h-0 flex-col">
        <DesktopSearchPanel
          search={search}
          actions={actions}
          deckCopyCounts={deckCopyCounts}
          activeDragSearchCardId={null}
          selectedCardId={step.selectedDetailCard?.ygoprodeckId ?? null}
          onResultClick={step.onSearchResultClick}
          onAddCard={step.onAddSearchResultToDefaultZone}
          onResultPointerDown={ignorePointerDown}
        />
      </div>
    </SideDrawer>
  )
}
