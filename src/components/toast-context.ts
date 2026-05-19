import { createContext } from "react"

export type ToastOptions = {
  title?: string
  durationMs?: number
  persistent?: boolean
  dedupe?: boolean
}

export type ToastContextValue = {
  showSuccess: (message: string, options?: ToastOptions) => string
  showError: (message: string, options?: ToastOptions) => string
  showWarning: (message: string, options?: ToastOptions) => string
  showInfo: (message: string, options?: ToastOptions) => string
  dismissToast: (id: string) => void
  clearToasts: () => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
