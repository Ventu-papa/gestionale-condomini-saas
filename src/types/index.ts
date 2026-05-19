// Tipi TypeScript condivisi in tutta l'app

export type Page =
  | "home"
  | "condomini"
  | "fornitori"
  | "scadenze"
  | "timelineGlobale"
  | "timeline"
  | "documenti"
  | "ticket"
  | "comunicazioni"
  | "impostazioni"

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
  manutenzione?: string
  avviso_manutenzione?: string
  contratto_manutenzione?: string
  avviso_contratto_manutenzione?: string
}

export type Condominio = {
  id: number
  nome?: string
  nome_condominio?: string
  cod_fiscale?: string
  indirizzo: string
  cap?: string
  comune: string
  provincia?: string
  dati_catastali?: string
  email_notifiche?: string
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

export type Fornitore = {
  id: number
  user_id?: string
  nome: string
  cognome: string
  partita_iva: string
  telefono: string
  iban: string
  mansione: string
  condominio_id?: number | null
  created_at?: string
}
