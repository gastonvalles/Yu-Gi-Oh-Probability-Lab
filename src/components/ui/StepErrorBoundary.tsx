import { Component, type ErrorInfo, type ReactNode } from 'react'

import { t } from '../../i18n'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

interface StepErrorBoundaryProps {
  children: ReactNode
  /** Qué pantalla se rompió («Algo salió mal en el Lab»). */
  title: string
  /** La salida alternativa a reintentar («Ir al builder»). */
  backLabel: string
  onBack: () => void
}

interface StepErrorBoundaryState {
  error: Error | null
}

/**
 * La red de seguridad de una sola pantalla: si se rompe al dibujar, el resto de la app sigue en pie y se ofrece reintentar o volver a otro paso
 * (sin recargar toda la página, a diferencia de `ErrorBoundary`). Dice lo que se conserva y no muestra códigos.
 */
export class StepErrorBoundary extends Component<StepErrorBoundaryProps, StepErrorBoundaryState> {
  state: StepErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): StepErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Una pantalla falló al renderizar.', error, info.componentStack)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <div role="alert" className="grid justify-items-center gap-4 px-gutter py-10">
        <EmptyState icon="alert" title={this.props.title}>
          {t('shell.stepError.description')}
        </EmptyState>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="md" onClick={this.props.onBack}>
            {this.props.backLabel}
          </Button>
          <Button variant="primary" size="md" icon="refresh" onClick={() => this.setState({ error: null })}>
            {t('shell.error.retry')}
          </Button>
        </div>
      </div>
    )
  }
}
