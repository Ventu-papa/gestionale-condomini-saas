// Tipi TypeScript condivisi in tutta l'app

export type Page =
  | "home"
  | "condomini"
  | "scadenze"
  | "timelineGlobale"
  | "timeline"
  | "documenti"
  | "ticket"
  | "integrazioni"

export type TimelineEvent = {
  id: number
  tipo: string
  titolo: string
  descrizione: string
  data: string
}

export type Impianto = {
  id: number
  tipo: string
  nome: string
  manutenzione: string
  contratto_manutenzione: string
}

export type Condominio = {
  id: number
  nome: string
  indirizzo: string
  comune: string
  user_id?: string
  impianti?: Impianto[]
  timeline?: TimelineEvent[]
  documenti?: Documento[]
  ticket?: Ticket[] 
}

export type Documento = {
  id: number
  titolo: string
  categoria: string
  data: string
  note: string
  file_path?: string
  file_name?: string
  mime_type?: string
  file_size?: number
  ocr_text?: string
  ocr_status?: "pending" | "processing" | "completed" | "failed"
  ai_category?: string
  ai_summary?: string
  ai_extracted_dates?: string[]
  ai_extracted_amounts?: string[]
}

// ===============================
// TICKET / SEGNALAZIONI
// ===============================

export type Ticket = {
  id: number
  titolo: string
  descrizione: string
  stato: "Aperto" | "In lavorazione" | "Chiuso"
  priorita: "Bassa" | "Media" | "Alta"
  data: string
}