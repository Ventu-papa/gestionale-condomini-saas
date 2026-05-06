// Tipi TypeScript condivisi in tutta l'app

export type Page =
  | "home"
  | "condomini"
  | "scadenze"
  | "timelineGlobale"
  | "timeline"
  | "documenti"
  | "ticket"

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
}

export type Documento = {
  id: number
  titolo: string
  categoria: string
  data: string
  note: string
  file_path?: string
  file_name?: string
}