import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"

import { ToastContext } from "./toast-context"
import type { ToastContextValue, ToastOptions } from "./toast-context"
import "./ToastProvider.css"

type ToastType = "success" | "error" | "warning" | "info"

type Toast = {
  id: string
  type: ToastType
  title: string
  message: string
  persistent: boolean
}

type ToastProviderProps = {
  children: ReactNode
  bridgeNativeAlerts?: boolean
}

const DEFAULT_DURATION_MS = 5200
const MAX_TOASTS = 5

function titoloDefault(type: ToastType) {
  if (type === "success") return "Operazione completata"
  if (type === "error") return "Qualcosa non ha funzionato"
  if (type === "warning") return "Attenzione"
  return "Nota operativa"
}

function tipoDaMessaggio(message: string): ToastType {
  const testo = message.toLowerCase()

  if (
    testo.includes("errore") ||
    testo.includes("impossibile") ||
    testo.includes("non riuscit") ||
    testo.includes("failed") ||
    testo.includes("error")
  ) {
    return "error"
  }

  if (
    testo.includes("inserisci") ||
    testo.includes("nessun") ||
    testo.includes("non trovato") ||
    testo.includes("gia") ||
    testo.includes("già") ||
    testo.includes("non ancora")
  ) {
    return "warning"
  }

  if (
    testo.includes("correttamente") ||
    testo.includes("salvato") ||
    testo.includes("creato") ||
    testo.includes("importat") ||
    testo.includes("collegato") ||
    testo.includes("scollegato")
  ) {
    return "success"
  }

  return "info"
}

function normalizzaMessaggio(message: unknown) {
  if (message instanceof Error) return message.message
  return String(message ?? "").trim()
}

export function ToastProvider({
  children,
  bridgeNativeAlerts = true,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastsRef = useRef<Toast[]>([])
  const timersRef = useRef<Map<string, number>>(new Map())

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)

    if (timer) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }

    const nextToasts = toastsRef.current.filter((toast) => toast.id !== id)
    toastsRef.current = nextToasts
    setToasts(nextToasts)
  }, [])

  const clearToasts = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current.clear()
    toastsRef.current = []
    setToasts([])
  }, [])

  const showToast = useCallback(
    (type: ToastType, rawMessage: unknown, options: ToastOptions = {}) => {
      const message = normalizzaMessaggio(rawMessage)

      if (!message) return ""

      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const persistent = options.persistent ?? false
      const dedupe = options.dedupe ?? true
      const toast: Toast = {
        id,
        type,
        persistent,
        title: options.title ?? titoloDefault(type),
        message,
      }

      if (
        dedupe &&
        toastsRef.current.some(
          (item) => item.type === type && item.message === message
        )
      ) {
        return ""
      }

      const nextToasts = [...toastsRef.current, toast].slice(-MAX_TOASTS)
      const removedToasts = toastsRef.current.filter(
        (item) => !nextToasts.some((nextToast) => nextToast.id === item.id)
      )

      removedToasts.forEach((removedToast) => {
        const timer = timersRef.current.get(removedToast.id)

        if (timer) {
          window.clearTimeout(timer)
          timersRef.current.delete(removedToast.id)
        }
      })

      toastsRef.current = nextToasts
      setToasts(nextToasts)

      if (!persistent) {
        const timer = window.setTimeout(
          () => dismissToast(id),
          options.durationMs ?? DEFAULT_DURATION_MS
        )
        timersRef.current.set(id, timer)
      }

      return id
    },
    [dismissToast]
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      showSuccess: (message, options) => showToast("success", message, options),
      showError: (message, options) => showToast("error", message, options),
      showWarning: (message, options) => showToast("warning", message, options),
      showInfo: (message, options) => showToast("info", message, options),
      dismissToast,
      clearToasts,
    }),
    [clearToasts, dismissToast, showToast]
  )

  useEffect(() => {
    if (!bridgeNativeAlerts) return

    const nativeAlert = window.alert

    window.alert = (message?: unknown) => {
      const testo = normalizzaMessaggio(message)
      showToast(tipoDaMessaggio(testo), testo || "Operazione completata")
    }

    return () => {
      window.alert = nativeAlert
    }
  }, [bridgeNativeAlerts, showToast])

  useEffect(() => {
    const timers = timersRef.current

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
      toastsRef.current = []
    }
  }, [])

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toasts.length > 0 ? (
        <div className="toast-viewport" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <div className={`toast-card ${toast.type}`} key={toast.id}>
              <div className="toast-content">
                <strong>{toast.title}</strong>
                <p>{toast.message}</p>
              </div>

              <button
                className="toast-dismiss"
                type="button"
                aria-label="Chiudi notifica"
                onClick={() => dismissToast(toast.id)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}
