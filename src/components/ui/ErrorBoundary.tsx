import { Component, type ErrorInfo, type ReactNode } from 'react'

import { currentMascot } from '../../app/mascot'
import { t } from '../../i18n'
import { Button } from './Button'
import { Card } from './Card'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Red de seguridad de toda la app: si algo revienta al renderizar, en vez de una pantalla en blanco
 * se ofrece recargar. Recargar también arregla el caso más común, un chunk viejo después de un deploy.
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
        <Card padding="lg" className="grid w-[min(24rem,100%)] justify-items-center gap-4 text-center">
          {/* La mascota frustrada (quieta si se pidió reducir movimiento). */}
          <img src={`${currentMascot().folder}/failed.webp`} alt="" className="w-28 motion-reduce:hidden" />
          <img src={`${currentMascot().folder}/idle.png`} alt="" className="hidden w-28 motion-reduce:block" />
          <div className="grid gap-1">
            <h1 className="m-0 text-title font-semibold text-foreground">{t('shell.error.title')}</h1>
            <p className="m-0 text-body text-muted">{t('shell.error.description')}</p>
          </div>
          <Button variant="primary" size="md" icon="refresh" onClick={() => window.location.reload()}>
            {t('shell.error.retry')}
          </Button>
        </Card>
      </main>
    )
  }
}
