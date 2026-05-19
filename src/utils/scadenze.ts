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

export function getStatoScadenzaDaAvviso(dataAvviso?: string) {
  if (!dataAvviso) return "none"

  const diff = giorniAllaScadenza(dataAvviso)

  if (diff < 0) return "verde"
  if (diff <= 7) return "rosso"
  if (diff <= 30) return "arancione"
  return "verde"
}

export function calcolaDataAvviso(
  dataScadenza?: string,
  giorniAvviso?: string
) {
  if (!dataScadenza || !giorniAvviso) return ""

  const giorni = Number(giorniAvviso)

  if (!Number.isFinite(giorni) || giorni < 0) return ""

  const avviso = new Date(dataScadenza)
  avviso.setDate(avviso.getDate() - giorni)

  return avviso.toISOString().slice(0, 10)
}

export function getStatoScadenzaDaGiorniAvviso(
  dataScadenza?: string,
  giorniAvviso?: string
) {
  if (!dataScadenza) return "none"

  if (giorniAllaScadenza(dataScadenza) < 0) return "verde"

  const dataAvviso = calcolaDataAvviso(dataScadenza, giorniAvviso)

  if (!dataAvviso) return "none"

  const diff = giorniAllaScadenza(dataAvviso)

  if (diff <= 7) return "rosso"
  if (diff <= 30) return "arancione"
  return "verde"
}

export function giorniAllaScadenza(data: string) {
  const oggi = new Date()
  const scadenza = new Date(data)

  return Math.ceil(
    (scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
  )
}
