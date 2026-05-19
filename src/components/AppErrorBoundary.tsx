import { Component } from "react"
import type { ErrorInfo, ReactNode } from "react"

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  hasError: boolean
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Errore applicazione", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-page">
          <section className="app-error-card">
            <p className="eyebrow">Errore applicazione</p>
            <h1>Qualcosa non ha funzionato</h1>
            <p>
              Ricarica la pagina. Se il problema continua, controlla che la
              pubblicazione abbia le variabili Supabase configurate.
            </p>
            <button type="button" onClick={() => window.location.reload()}>
              Ricarica
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
