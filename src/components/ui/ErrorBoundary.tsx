import { Component, type ErrorInfo, type ReactNode } from 'react'

import { resetPersistedState } from '../../app/persistence'
import { Button } from './Button'
import { Card } from './Card'
import { Icon } from './Icon'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Red de seguridad de toda la app: si algo revienta al renderizar, en vez de una pantalla en blanco
 * se ofrece reintentar, recargar o, como último recurso, empezar de cero (con copia de lo guardado).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('La app falló al renderizar.', error, info.componentStack)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <main className="grid min-h-screen place-items-center px-gutter py-8">
        <Card padding="lg" className="grid w-[min(32rem,100%)] gap-4">
          <div className="flex items-start gap-3">
            {/* Cupsy frustrada (quieta si se pidió reducir movimiento). */}
            <img src="/mascot/failed.webp" alt="" className="w-20 shrink-0 motion-reduce:hidden" />
            <img src="/mascot/idle.png" alt="" className="hidden w-20 shrink-0 motion-reduce:block" />
            <Icon name="alert" size={24} className="mt-0.5 shrink-0 text-danger-soft" />
            <div className="grid gap-1">
              <h1 className="m-0 text-lead font-semibold text-foreground">Algo salió mal</h1>
              <p className="m-0 text-body text-muted">
                La pantalla no se pudo dibujar. Tu deck y tus reglas siguen guardados en este navegador: probá de nuevo o recargá.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" icon="refresh" onClick={() => this.setState({ error: null })}>
              Reintentar
            </Button>
            <Button variant="secondary" size="md" onClick={() => window.location.reload()}>
              Recargar la página
            </Button>
          </div>
          <p className="m-0 text-micro text-soft">
            Si sigue fallando, podés empezar de cero. Se guarda una copia de lo que tenías antes de borrarlo.
          </p>
          <Button
            variant="tertiary"
            color="danger"
            size="sm"
            icon="trash"
            className="justify-self-start"
            onClick={() => {
              resetPersistedState()
              window.location.reload()
            }}
          >
            Empezar de cero
          </Button>
        </Card>
      </main>
    )
  }
}
