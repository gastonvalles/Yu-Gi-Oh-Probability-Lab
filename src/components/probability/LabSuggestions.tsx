import type { DeckSuggestion } from '../../app/deck-suggestions'
import { formatPercentPoints, formatShortPercent } from '../../app/utils'
import { InfoTip } from '../ui/InfoTip'
import { Skeleton } from '../ui/Skeleton'
import { LabSection } from './LabSection'
import type { DeckSuggestionsState } from './use-deck-suggestions'

export function LabSuggestions({ state }: { state: DeckSuggestionsState }) {
  const report = state.status === 'ready' ? state.report : null
  const best = report?.suggestions[0] ?? null

  return (
    <LabSection
      title="Cómo subir el %"
      summary={best ? `Hasta ${formatPercentPoints(best.delta)}` : state.status === 'loading' ? 'Simulando…' : undefined}
      className="lab-suggestions"
      actions={
        <InfoTip label="Cómo se eligen las sugerencias">
          <span>
            <strong>Qué prueba:</strong> sacar o sumar 1 copia de cada carta, y los mejores cambios de una carta por
            otra, respetando el límite de copias de tu formato.
          </span>
          <span>
            <strong>Qué mide:</strong> cuánto cambia el % de manos limpias promediando ir 1º (5 cartas) y 2º (6), con
            tus reglas activas. Si el deck tiene 40, sacar una carta equivale a cambiarla por una que no esté en tus reglas.
          </span>
          <span>
            <strong>Qué no mide:</strong> el poder de cada carta. Una handtrap o un rompe campo pueden valer más de lo
            que muestra el %: tomalo como una pista, no como una orden.
          </span>
          <span>
            <strong>Cartas clave:</strong> las que más bajan el % si cambiás una copia por una carta neutra.
          </span>
        </InfoTip>
      }
    >
      {!report ? (
        <div className="grid gap-2" aria-label="Simulando cambios" aria-busy="true">
          <Skeleton radius="panel" className="h-12 w-full" />
          <Skeleton radius="panel" className="h-12 w-full" />
          <Skeleton radius="panel" className="h-12 w-[80%]" />
        </div>
      ) : (
        <>
          {report.suggestions.length > 0 ? (
            <ol className="lab-suggestion-list">
              {report.suggestions.map((suggestion) => (
                <li key={JSON.stringify(suggestion.change)} className="lab-suggestion">
                  <SuggestionText suggestion={suggestion} />
                  <span className="lab-suggestion-result">
                    <strong className="lab-delta" data-tone="positive">
                      {formatPercentPoints(suggestion.delta)}
                    </strong>
                    <small>{formatShortPercent(suggestion.probability)}</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="lab-empty-note">
              Ningún cambio de una copia mejora el deck con tus reglas actuales. Está bien afinado.
            </p>
          )}

          {report.keyCards.length > 0 ? (
            <div className="lab-key-cards">
              <span className="lab-key-cards-title">Cartas clave</span>
              <ul>
                {report.keyCards.map((card) => (
                  <li key={card.cardId}>
                    <span className="truncate">{card.name}</span>
                    <span className="lab-delta" data-tone="negative" title="Si cambiás una copia por una carta neutra">
                      {formatPercentPoints(card.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

        </>
      )}
    </LabSection>
  )
}

function SuggestionText({ suggestion }: { suggestion: DeckSuggestion }) {
  if (suggestion.change.type === 'swap') {
    return (
      <span className="lab-suggestion-text">
        <span className="lab-suggestion-verb">Cambiá</span>
        <span className="lab-suggestion-card" data-tone="negative">
          −1 {suggestion.cutName}
        </span>
        <span className="lab-suggestion-card" data-tone="positive">
          +1 {suggestion.addName}
        </span>
      </span>
    )
  }

  if (suggestion.change.type === 'add') {
    return (
      <span className="lab-suggestion-text">
        <span className="lab-suggestion-verb">Sumá</span>
        <span className="lab-suggestion-card" data-tone="positive">
          +1 {suggestion.addName}
        </span>
        <small className="app-muted">({suggestion.deckSize} cartas)</small>
      </span>
    )
  }

  return (
    <span className="lab-suggestion-text">
      <span className="lab-suggestion-verb">{suggestion.replacedWithNeutral ? 'Cambiá' : 'Sacá'}</span>
      <span className="lab-suggestion-card" data-tone="negative">
        −1 {suggestion.cutName}
      </span>
      <small className="app-muted">
        {suggestion.replacedWithNeutral ? 'por una carta que no esté en tus reglas' : `(${suggestion.deckSize} cartas)`}
      </small>
    </span>
  )
}
