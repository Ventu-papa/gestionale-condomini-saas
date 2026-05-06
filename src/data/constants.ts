// Moduli dashboard e lista impianti disponibili

import type { Page } from "../types"

export const modules: {
  title: string
  page: Page
  description: string
  status: string
}[] = [
  {
    title: "Condomìni",
    page: "condomini",
    description: "Anagrafica fabbricati, indirizzi, unità, impianti e informazioni operative.",
    status: "Primo modulo",
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
    description: "Tutte le comunicazioni operative di tutti i condomìni.",
    status: "Memoria studio",
  },
  {
    title: "Timeline",
    page: "timeline",
    description: "Storico centralizzato di email, WhatsApp, chiamate, ticket e documenti.",
    status: "Cuore del sistema",
  },
  {
    title: "Documenti",
    page: "documenti",
    description: "Archivio digitale per PDF, immagini, contratti, verbali e rapportini.",
    status: "Prossimo step",
  },
  {
    title: "Ticket",
    page: "ticket",
    description: "Gestione richieste, guasti, interventi e attività operative dello studio.",
    status: "Da costruire",
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