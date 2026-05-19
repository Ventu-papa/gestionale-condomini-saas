// Moduli dashboard e lista impianti disponibili

import type { Page } from "../types"

export const modules: {
  title: string
  page: Page
  description: string
  status: string
}[] = [
  {
    title: "Condomini",
    page: "condomini",
    description:
      "Anagrafica fabbricati, indirizzi, unita', impianti e informazioni operative.",
    status: "Primo modulo",
  },
  {
    title: "Fornitori",
    page: "fornitori",
    description:
      "Anagrafiche fornitori, mansioni e collegamento ai condomini seguiti.",
    status: "Operativo",
  },
  {
    title: "Scadenze",
    page: "scadenze",
    description: "Vista globale delle scadenze impianti ordinate per urgenza.",
    status: "Operativo",
  },
  {
    title: "Timeline globale",
    page: "timelineGlobale",
    description: "Tutte le comunicazioni operative di tutti i condomini.",
    status: "Memoria studio",
  },
  {
    title: "Timeline",
    page: "timeline",
    description:
      "Storico centralizzato di email, WhatsApp, chiamate, ticket e documenti.",
    status: "Cuore del sistema",
  },
  {
    title: "Documenti",
    page: "documenti",
    description:
      "Archivio digitale per PDF, immagini, contratti, verbali e rapportini.",
    status: "Prossimo step",
  },
  {
    title: "Ticket",
    page: "ticket",
    description:
      "Gestione richieste, guasti, interventi e attivita' operative dello studio.",
    status: "Operativo",
  },
]

export const impiantiDisponibili = [
  "Ascensore",
  "Impianto elettrico",
  "Centrale termica",
  "Antincendio",
  "Impianto idrico",
  "Fotovoltaico",
  "Autoclave",
  "Cancello automatico",
  "Messa a terra",
  "Linea vita",
]
