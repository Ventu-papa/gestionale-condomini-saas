// Funzioni per calcolare stato e giorni mancanti delle scadenze

export function getStatoScadenza(data?: string) {
  if (!data) return "none"

  const oggi = new Date()
  const scadenza = new Date(data)

  const diff = Math.ceil(
    (scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diff <= 30) return "rosso"
  if (diff <= 120) return "arancione"
  return "verde"
}

export function giorniAllaScadenza(data: string) {
  const oggi = new Date()
  const scadenza = new Date(data)

  return Math.ceil(
    (scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
  )
}