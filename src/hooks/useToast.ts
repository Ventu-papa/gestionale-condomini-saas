import { useContext } from "react"

import { ToastContext } from "../components/toast-context"

export type { ToastOptions } from "../components/toast-context"

export function useToast() {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error("useToast deve essere usato dentro ToastProvider.")
  }

  return context
}
