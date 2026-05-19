import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

import { supabase } from "./supabase"
import type {
  Condominio,
  Documento,
  Fornitore,
  Impianto,
  Page,
  Ticket,
  TimelineEvent,
} from "./types"
import {
  calcolaDataAvviso,
  getStatoScadenzaDaGiorniAvviso,
  giorniAllaScadenza,
} from "./utils/scadenze"
import { impiantiDisponibili, modules } from "./data/constants"

import LoginPage from "./components/LoginPage"
import Dashboard from "./components/Dashboard"
import Sidebar from "./components/sidebar"
import OnboardingPage from "./components/onboarding-page"
import { useToast } from "./hooks/useToast"

import "./App.css"

type GestionaleConnection = {
  provider: "danea" | "excel" | string
  connection_mode?: "api" | "file" | string
  status?: "connected" | "not_connected" | "error" | string
  is_primary?: boolean
  last_sync_at?: string | null
}

type DaneaSyncResponse = {
  success: boolean
  message: string
  importedCount?: number
  skippedCount?: number
  totalRemoteCount?: number
}

type CommunicationEvent = {
  id: string
  channel?: "email" | "pec" | "whatsapp" | "phone" | string
  sender?: string | null
  subject?: string | null
  body?: string | null
  priority?: "bassa" | "media" | "alta" | string | null
  status?: string | null
  linked_ticket_id?: number | null
  condominio_id?: number | null
  created_at: string
}

type ImportCondominio = {
  nome: string
  nome_condominio: string
  indirizzo: string
  comune: string
  email_notifiche: string
  user_id: string
  cap?: string
  cod_fiscale?: string
  dati_catastali?: string
  provincia?: string
  tipo?: string
}

type ImportIssue = Partial<ImportCondominio> & {
  riga: number
  motivo: string
  dati?: Record<string, unknown>
}

type DocumentoGlobale = Documento & {
  condominio_id: number
  condominio: string
  indirizzo: string
}

type TicketGlobale = Ticket & {
  condominio_id: number
  condominio: string
  indirizzo: string
}

type ScadenzaOperativa = {
  id: string
  condominio: string
  impianto: string
  descrizione: string
  tipo: string
  data: string
  avviso?: string
  data_avviso?: string
  stato: string
}

type FornitoreForm = {
  nome: string
  cognome: string
  partita_iva: string
  telefono: string
  iban: string
  mansione: string
  condominio_id: number | ""
}

function creaIdLocale() {
  return Date.now()
}


const MAX_DOCUMENTO_BYTES = 20 * 1024 * 1024
const ESTENSIONI_DOCUMENTO_CONSENTITE = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
])
const MIME_DOCUMENTO_CONSENTITI = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
])

function estensioneFile(nomeFile: string) {
  const parti = nomeFile.toLowerCase().split(".")
  return parti.length > 1 ? parti.pop() ?? "" : ""
}

function normalizzaNomeFile(nomeFile: string) {
  const nomeSenzaPercorso = nomeFile.split(/[\\/]/).pop() || "documento"
  const estensione = estensioneFile(nomeSenzaPercorso)
  const nomeBase = nomeSenzaPercorso
    .replace(/\.[^/.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)

  return `${nomeBase || "documento"}.${estensione}`
}

function validaFileDocumento(file: File) {
  const estensione = estensioneFile(file.name)

  if (!ESTENSIONI_DOCUMENTO_CONSENTITE.has(estensione)) {
    return "Formato file non consentito. Carica PDF, immagini, Word, Excel, CSV o TXT."
  }

  if (file.type && !MIME_DOCUMENTO_CONSENTITI.has(file.type)) {
    return "Tipo file non consentito. Il documento non e' stato caricato."
  }

  if (file.size > MAX_DOCUMENTO_BYTES) {
    return "File troppo grande. Il limite massimo e' 20 MB."
  }

  return null
}

function percorsoDocumentoSicuro(condominioId: number, file: File) {
  const nomeFile = normalizzaNomeFile(file.name)
  const idFile =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return `${condominioId}/${idFile}-${nomeFile}`
}

function ticketGlobaleKey(ticket: Pick<TicketGlobale, "condominio_id" | "id">) {
  return `${ticket.condominio_id}-${ticket.id}`
}

function normalizzaGiorniAvviso(value: string) {
  const soloNumeri = value.replace(/\D/g, "").slice(0, 3)
  const giorni = Number(soloNumeri)

  if (!soloNumeri) return ""
  if (giorni > 365) return "365"

  return soloNumeri
}

function normalizzaTelefonoItalia(value: string) {
  return value.replace(/\D/g, "").slice(0, 11)
}

function normalizzaPartitaIva(value: string) {
  return value.replace(/\D/g, "").slice(0, 11)
}

function normalizzaIbanItalia(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 27)
}

function ibanItalianoValido(value: string) {
  if (!value) return true

  return /^IT\d{2}[A-Z]\d{10}[A-Z0-9]{12}$/.test(value)
}

function telefonoItalianoValido(value: string) {
  if (!value) return true

  return /^\d{6,11}$/.test(value)
}

function partitaIvaValida(value: string) {
  if (!value) return true

  return /^\d{11}$/.test(value)
}

function nomeCondominio(
  condominio?: Pick<Condominio, "nome" | "nome_condominio"> | null,
  fallback = "Condominio senza nome"
) {
  return condominio?.nome || condominio?.nome_condominio || fallback
}

function statoImpianto(impianto: Impianto) {
  const stati = [
    getStatoScadenzaDaGiorniAvviso(
      impianto.manutenzione,
      impianto.avviso_manutenzione
    ),
    getStatoScadenzaDaGiorniAvviso(
      impianto.contratto_manutenzione,
      impianto.avviso_contratto_manutenzione
    ),
  ]

  if (stati.includes("rosso")) return "rosso"
  if (stati.includes("arancione")) return "arancione"
  if (stati.includes("verde")) return "verde"
  return "none"
}

function App() {
  const { showError, showSuccess, showWarning, showInfo } = useToast()

  // ============================================================
  // STATO: SESSIONE, ONBOARDING E NAVIGAZIONE
  // Gestisce l'utente autenticato, il completamento onboarding,
  // la pagina attiva e la shell responsive dell'app.
  // ============================================================
  const [user, setUser] = useState<User | null>(null)
  const [temaInterfaccia, setTemaInterfaccia] = useState<"dark" | "light">(
    () => (localStorage.getItem("temaInterfaccia") as "dark" | "light") || "dark"
  )
  const [page, setPage] = useState<Page>("home")
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [selectedCondominio, setSelectedCondominio] =
    useState<Condominio | null>(null)
  const selectedCondominioId = selectedCondominio?.id ?? null
  const [onboardingCompletato, setOnboardingCompletato] = useState(false)
  const [caricamentoOnboarding, setCaricamentoOnboarding] = useState(true)

  // ============================================================
  // STATO: RICERCHE E FILTRI
  // Mantiene i testi digitati nelle viste globali e nella dashboard.
  // ============================================================
  const [ricercaTimeline, setRicercaTimeline] = useState("")
  const [ricercaCondomini, setRicercaCondomini] = useState("")
  const [ricercaGlobale, setRicercaGlobale] = useState("")

  // ============================================================
  // STATO: GESTIONALE E INTEGRAZIONI
  // Controlla il gestionale principale, il modal di collegamento e
  // la timeline delle comunicazioni importate o generate.
  // ============================================================
  const [gestionaleAttivo, setGestionaleAttivo] =
    useState<GestionaleConnection | null>(null)
  const [showGestionaleModal, setShowGestionaleModal] = useState(false)
  const [gestionaleSelezionato, setGestionaleSelezionato] = useState("")
  const [apiKeyGestionale, setApiKeyGestionale] = useState("")
  const [communicationEvents, setCommunicationEvents] = useState<
    CommunicationEvent[]
  >([])

  useEffect(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    })
  }, [page, selectedCondominioId])

  // ============================================================
  // STATO: IMPORT EXCEL / CSV
  // Conserva anteprima, errori, duplicati e stato di avanzamento
  // prima del salvataggio definitivo su Supabase.
  // ============================================================
  const [anteprimaImport, setAnteprimaImport] = useState<ImportCondominio[]>([])
  const [erroriImport, setErroriImport] = useState<ImportIssue[]>([])
  const [duplicatiImport, setDuplicatiImport] = useState<ImportIssue[]>([])
  const [showImportReport, setShowImportReport] = useState(false)
  const [importInCorso, setImportInCorso] = useState(false)

  // ============================================================
  // STATO: MODALI E MODALITA' DI MODIFICA
  // Identifica quale entita' e' in modifica e gestisce il modal di conferma.
  // ============================================================
  const [showModal, setShowModal] = useState(false)
  const [editingCondominioId, setEditingCondominioId] =
    useState<number | null>(null)
  const [editingImpiantoId, setEditingImpiantoId] =
    useState<number | null>(null)
  const [editingEventoId, setEditingEventoId] = useState<number | null>(null)
  const [editingDocumentoId, setEditingDocumentoId] =
    useState<number | null>(null)
  const [previewDocumento, setPreviewDocumento] = useState<Documento | null>(null)
  const [ricercaDocumenti, setRicercaDocumenti] = useState("")
  const [categoriaDocumenti, setCategoriaDocumenti] = useState("Tutte")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showUploadDocumentoModal, setShowUploadDocumentoModal] = useState(false)
  const [uploadCondominioId, setUploadCondominioId] = useState<number | "">("")
  const [editingTicketId, setEditingTicketId] = useState<number | null>(null)
  const [editingGlobalTicketKey, setEditingGlobalTicketKey] =
    useState<string | null>(null)
  const [editingCommunicationId, setEditingCommunicationId] =
    useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean
    title: string
    message: string
    onConfirm: (() => void) | null
  }>({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
  })
  // ============================================================
  // STATO: DATI PRINCIPALI E FORM
  // Contiene condomini caricati da Supabase e valori temporanei
  // usati per creare impianti, eventi, ticket, documenti e login.
  // ============================================================
  const [condomini, setCondomini] = useState<Condominio[]>([])
  const [fornitori, setFornitori] = useState<Fornitore[]>([])
  const [ricercaFornitori, setRicercaFornitori] = useState("")
  const [editingFornitoreId, setEditingFornitoreId] = useState<number | null>(
    null
  )

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  })

  const [form, setForm] = useState({
    tipo: "Condominio",
    nome_condominio: "",
    cod_fiscale: "",
    indirizzo: "",
    cap: "",
    comune: "",
    provincia: "",
    dati_catastali: "",
    email_notifiche: "",
  })

  const [nuovoImpianto, setNuovoImpianto] = useState({
    tipo: "",
    nome: "",
    manutenzione: "",
    avviso_manutenzione: "",
    contratto_manutenzione: "",
    avviso_contratto_manutenzione: "",
  })

  const [fornitoreForm, setFornitoreForm] = useState<FornitoreForm>({
    nome: "",
    cognome: "",
    partita_iva: "",
    telefono: "",
    iban: "",
    mansione: "",
    condominio_id: "",
  })

  const [nuovoEvento, setNuovoEvento] = useState({
    tipo: "Nota",
    titolo: "",
    descrizione: "",
  })

  const [nuovoTicket, setNuovoTicket] = useState({
    titolo: "",
    descrizione: "",
    stato: "Aperto",
    priorita: "Media",
  })

  const [fileDocumento, setFileDocumento] = useState<File | null>(null)
  const [dragDocumentoAttivo, setDragDocumentoAttivo] = useState(false)
  const [nuovoDocumento, setNuovoDocumento] = useState({
    titolo: "",
    categoria: "Contratto",
    data: "",
    note: "",
  })

  // ============================================================
  // EFFECT: AUTENTICAZIONE
  // Recupera l'utente corrente e mantiene lo stato aggiornato quando
  // Supabase segnala login/logout o refresh sessione.
  // ============================================================
  useEffect(() => {
    const resetImportazione = () => {
      setAnteprimaImport([])
      setErroriImport([])
      setDuplicatiImport([])
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        resetImportazione()
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  // ============================================================
  // EFFECT: Tema
  // Cambia a funzione dell'utente i colori del tema
  // ============================================================
  useEffect(() => {
    localStorage.setItem("temaInterfaccia", temaInterfaccia)
    document.documentElement.dataset.theme = temaInterfaccia
  }, [temaInterfaccia])

  // ============================================================
  // EFFECT: GESTIONALE PRINCIPALE
  // Carica la connessione primaria dello studio per l'utente loggato.
  // ============================================================
  useEffect(() => {
    async function caricaGestionaleAttivo() {
      if (!user) {
        setGestionaleAttivo(null)
        return
      }

      const { data, error } = await supabase
        .from("gestionale_connections")
        .select("provider, connection_mode, status, is_primary, last_sync_at")
        .eq("user_id", user.id)
        .eq("is_primary", true)
        .maybeSingle()

      if (error) {
        showError(error.message)
        return
      }

      setGestionaleAttivo(data)
    }

    caricaGestionaleAttivo()
  }, [showError, user])

  // ============================================================
  // EFFECT: COMMUNICATION EVENTS
  // Carica la timeline comunicazioni salvata per l'utente.
  // ============================================================
  useEffect(() => {
    async function caricaCommunicationEvents() {
      if (!user) {
        setCommunicationEvents([])
        return
      }

      const { data, error } = await supabase
        .from("communication_events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (error) {
        showError(error.message)
        return
      }

      setCommunicationEvents((data ?? []).filter((item) => item != null))
    }

    caricaCommunicationEvents()
  }, [showError, user])

  // ============================================================
  // EFFECT: CONFIGURAZIONE STUDIO
  // Verifica se l'utente ha gia' completato l'onboarding iniziale.
  // ============================================================
  useEffect(() => {
    async function caricaStudioSettings() {
      if (!user) {
        setOnboardingCompletato(false)
        setCaricamentoOnboarding(false)
        return
      }

      setCaricamentoOnboarding(true)

      const { data, error } = await supabase
        .from("studio_settings")
        .select("*")
        .eq("user_id", user.id)
        .single()

      if (error && error.code !== "PGRST116") {
        showError(error.message)
        setCaricamentoOnboarding(false)
        return
      }

      setOnboardingCompletato(data?.onboarding_completed ?? false)
      setCaricamentoOnboarding(false)
    }

    caricaStudioSettings()
  }, [showError, user])

  // ============================================================
  // EFFECT: CONDOMINI UTENTE
  // Carica solo i condomini dell'utente loggato e resetta la selezione.
  // ============================================================
  useEffect(() => {
    async function caricaCondominiUtente() {
      if (!user) {
        setCondomini([])
        setSelectedCondominio(null)
        return
      }

      const { data, error } = await supabase
        .from("condomini")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (error) {
        showError(error.message)
        return
      }

      setCondomini(data ?? [])
      setSelectedCondominio(null)
    }

    caricaCondominiUtente()
  }, [showError, user])

  // ============================================================
  // EFFECT: FORNITORI UTENTE
  // Carica le anagrafiche fornitori collegate allo studio.
  // ============================================================
  useEffect(() => {
    async function caricaFornitoriUtente() {
      if (!user) {
        setFornitori([])
        return
      }

      const { data, error } = await supabase
        .from("fornitori")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (error) {
        showError(error.message)
        return
      }

      setFornitori(data ?? [])
    }

    caricaFornitoriUtente()
  }, [showError, user])

  // ============================================================
  // UI: LAYOUT E CONFERME
  // Funzioni di supporto usate da tutte le pagine autenticate.
  // ============================================================

  function selezionaFileDocumento(file?: File | null) {
    if (!file) {
      setFileDocumento(null)
      return
    }

    const errore = validaFileDocumento(file)

    if (errore) {
      showWarning(errore)
      setFileDocumento(null)
      return
    }

    setFileDocumento(file)
  }

  // Apre il modal di conferma e registra la callback da eseguire su OK.
  function apriConferma(title: string, message: string, onConfirm: () => void) {
    setConfirmModal({
      open: true,
      title,
      message,
      onConfirm,
    })
  }

  // Avvolge ogni pagina autenticata con sidebar, contenuto e modali globali.
  function renderSaasLayout(contenuto: ReactNode) {
    return (
      <main
        className={`app-shell saas-layout theme-${temaInterfaccia}`}
        translate="no"
      >
        <button
          className="mobile-menu-button"
          type="button"
          aria-label="Apri menu"
          onClick={() => setSidebarMobileOpen(true)}
        >
          ☰
        </button>

        <Sidebar
          page={page}
          setPage={(nuovaPagina) => {
            setPage(nuovaPagina)
            setSelectedCondominio(null)
            setSidebarMobileOpen(false)
          }}
          userEmail={user?.email}
          mobileOpen={sidebarMobileOpen}
          onCloseMobile={() => setSidebarMobileOpen(false)}
          onLogout={async () => {
            await supabase.auth.signOut()
            setUser(null)
            setCondomini([])
            setFornitori([])
            setSelectedCondominio(null)
            setPage("home")
          }}
        />

        {confirmModal.open && (
          <div className="premium-modal">
            <div className="premium-confirm-card">
              <h2>{confirmModal.title}</h2>
              <p>{confirmModal.message}</p>

              <div className="confirm-actions">
                <button
                  className="secondary"
                  onClick={() =>
                    setConfirmModal({
                      open: false,
                      title: "",
                      message: "",
                      onConfirm: null,
                    })
                  }
                >
                  Annulla
                </button>

                <button
                  className="premium-save-button"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      confirmModal.onConfirm?.()
                      setConfirmModal({
                        open: false,
                        title: "",
                        message: "",
                        onConfirm: null,
                      })
                    }
                  }}
                  onClick={() => {
                    confirmModal.onConfirm?.()
                    setConfirmModal({
                      open: false,
                      title: "",
                      message: "",
                      onConfirm: null,
                    })
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="saas-content">{contenuto}</section>

        {showUploadDocumentoModal && (
          <div className="premium-modal">
            <div className="premium-modal-card document-upload-modal">
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Nuovo documento</p>
                  <h2>Carica documento</h2>
                </div>

                <button
                  className="icon-button"
                  onClick={() => setShowUploadDocumentoModal(false)}
                >
                  ×
                </button>
              </div>

              <div className="premium-form-grid">
                <label>
                  Condominio
                  <select
                    value={uploadCondominioId}
                    onChange={(e) =>
                      setUploadCondominioId(
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                  >
                    <option value="">Seleziona condominio</option>
                    {condomini.map((condominio) => (
                      <option key={condominio.id} value={condominio.id}>
                        {nomeCondominio(condominio)}
                      </option>
                    ))}
                  </select>
                </label>

                <label> 
                  Titolo
                  <input
                    value={nuovoDocumento.titolo}
                    onChange={(e) =>
                      setNuovoDocumento({
                        ...nuovoDocumento,
                        titolo: e.target.value,
                      })
                    }
                    placeholder="Titolo documento"
                  />
                </label>

                <label>
                  Categoria
                  <select
                    value={nuovoDocumento.categoria}
                    onChange={(e) =>
                      setNuovoDocumento({
                        ...nuovoDocumento,
                        categoria: e.target.value,
                      })
                    }
                  >
                    <option value="Contratto">Contratto</option>
                    <option value="Verbale">Verbale</option>
                    <option value="Fattura">Fattura</option>
                    <option value="Rapportino">Rapportino</option>
                    <option value="Certificazione">Certificazione</option>
                    <option value="Altro">Altro</option>
                  </select>
                </label>

                <label>
                  Data
                  <input
                    type="date"
                    value={nuovoDocumento.data}
                    onChange={(e) =>
                      setNuovoDocumento({
                        ...nuovoDocumento,
                        data: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Note
                  <textarea
                    value={nuovoDocumento.note}
                    onChange={(e) =>
                      setNuovoDocumento({
                        ...nuovoDocumento,
                        note: e.target.value,
                      })
                    }
                    placeholder="Note documento"
                  />
                </label>
              </div>

              <label
                className={`document-dropzone ${dragDocumentoAttivo ? "active" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragDocumentoAttivo(true)
                }}
                onDragLeave={() => setDragDocumentoAttivo(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragDocumentoAttivo(false)

                  const file = e.dataTransfer.files?.[0]

                  if (file) {
                    selezionaFileDocumento(file)
                  }
                }}
              >
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  hidden
                  onChange={(e) =>
                    selezionaFileDocumento(e.target.files?.[0] ?? null)
                  }
                />

                <strong>
                  {fileDocumento ? fileDocumento.name : "Trascina qui il file"}
                </strong>

                <span>
                  oppure clicca per selezionarlo dal computer
                </span>

                <small>PDF, immagini, Word, Excel o altri allegati operativi</small>
                <small>Dimensione massima 20 MB</small>
              </label>

              <button
                className="premium-save-button"
                onClick={aggiungiDocumentoGlobale}
              >
                Salva documento
              </button>
            </div>
          </div>
        )}

        {previewDocumento && previewUrl && (
          <div className="premium-modal">
            <div className="premium-modal-card document-preview-modal">
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Anteprima documento</p>
                  <h2>{previewDocumento.titolo}</h2>
                </div>

                <button className="icon-button" onClick={chiudiPreviewDocumento}>
                  ×
                </button>
              </div>

              <div className="document-preview-body">
                {previewDocumento.mime_type?.includes("image") ||
                previewDocumento.file_name?.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                  <img
                    src={previewUrl}
                    alt={previewDocumento.titolo}
                    className="document-preview-image"
                    referrerPolicy="no-referrer"
                  />
                ) : previewDocumento.mime_type === "application/pdf" ||
                  previewDocumento.file_name?.toLowerCase().endsWith(".pdf") ? (
                  <iframe
                    src={previewUrl}
                    title={previewDocumento.titolo}
                    className="document-preview-frame"
                    referrerPolicy="no-referrer"
                    sandbox="allow-downloads"
                  />
                ) : (
                  <div className="empty-state">
                    Anteprima non disponibile per questo formato.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showGestionaleModal && (
          <div className="premium-modal">
            <div className="premium-modal-card">
              <div className="modal-header">
                <h2>Collega gestionale</h2>

                <button
                  className="icon-button"
                  onClick={() => setShowGestionaleModal(false)}
                >
                  ×
                </button>
              </div>

              <div className="gestionali-grid">
                <div
                  className={`gestionale-card ${
                    gestionaleSelezionato === "danea" ? "active" : ""
                  }`}
                  onClick={() => setGestionaleSelezionato("danea")}
                >
                  <strong>Danea Domustudio</strong>
                  <p>
                    Collegamento tramite APIKey Domustudio Cloud Pro e import
                    condomini dall'archivio Danea.
                  </p>
                </div>
              </div>

              {gestionaleSelezionato && (
                <div className="gestionale-config-section">
                  <h3>Configurazione Danea</h3>
                  <p className="settings-note">
                    Inserisci la APIKey generata da Domustudio Cloud Pro. La
                    sincronizzazione usera' le API ufficiali Danea.
                  </p>

                  <input
                    className="onboarding-input"
                    placeholder="APIKey Domustudio"
                    value={apiKeyGestionale}
                    onChange={(e) => setApiKeyGestionale(e.target.value)}
                  />

                  <button
                    className="premium-save-button"
                    onClick={async () => {
                      const collegato = await salvaCollegamentoGestionale(
                        gestionaleSelezionato,
                        apiKeyGestionale
                      )

                      if (collegato) {
                        setShowGestionaleModal(false)
                      }
                    }}
                  >
                    Collega e sincronizza
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    )
  }

  // ============================================================
  // ONBOARDING
  // Funzioni legate alla prima configurazione dello studio.
  // ============================================================

  // Salva su Supabase che l'utente ha completato la configurazione iniziale.
  async function completaOnboarding() {
    if (!user) return

    const { error } = await supabase.from("studio_settings").upsert({
      user_id: user.id,
      onboarding_completed: true,
    })

    if (error) {
      showError(error.message)
      return
    }

    setOnboardingCompletato(true)
  }

  // ============================================================
  // GESTIONALI
  // Collegamento, disconnessione e sincronizzazione dei provider esterni.
  // ============================================================

  // Avvia la funzione Supabase dedicata alla sincronizzazione Danea.
  async function sincronizzaDanea(): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke<DaneaSyncResponse>(
        "sync-danea",
        {
          method: "POST",
        }
      )

      if (error) {
        showError(`Errore sincronizzazione Danea: ${error.message}`)
        return false
      }

      if (!data?.success) {
        showWarning(data?.message ?? "Sincronizzazione Danea non riuscita.")
        return false
      }

      const riepilogo =
        typeof data.importedCount === "number"
          ? ` Importati: ${data.importedCount}. Ignorati: ${
              data.skippedCount ?? 0
            }.`
          : ""

      showSuccess(`${data.message}${riepilogo}`)

      if (user) {
        const { data: condominiAggiornati } = await supabase
          .from("condomini")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })

        const { data: connessioneAggiornata } = await supabase
          .from("gestionale_connections")
          .select("provider, connection_mode, status, is_primary, last_sync_at")
          .eq("user_id", user.id)
          .eq("provider", "danea")
          .maybeSingle()

        setCondomini(condominiAggiornati ?? condomini)

        if (connessioneAggiornata) {
          setGestionaleAttivo(connessioneAggiornata)
        }
      }

      return true
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Errore sconosciuto durante la sincronizzazione"
      )
      return false
    }
  }

  // Salva o aggiorna il gestionale scelto come principale dello studio.
  async function salvaCollegamentoGestionale(
    provider: string,
    apiKey: string
  ): Promise<boolean> {
    if (!user) return false

    if (provider !== "danea" && provider !== "excel") {
      showWarning("Per ora e' disponibile solo il collegamento Danea Domustudio.")
      return false
    }

    const apiKeyPulita = apiKey.trim()

    if (provider === "danea" && !apiKeyPulita) {
      showWarning("Inserisci la APIKey di Domustudio Cloud Pro.")
      return false
    }

    const { error: resetError } = await supabase
      .from("gestionale_connections")
      .update({ is_primary: false })
      .eq("user_id", user.id)

    if (resetError) {
      showError(resetError.message)
      return false
    }

    const { error } = await supabase.from("gestionale_connections").upsert(
      {
        user_id: user.id,
        provider,
        api_key: apiKeyPulita,
        connection_mode: provider === "excel" ? "file" : "api",
        status:
          apiKeyPulita || provider === "excel" ? "connected" : "not_connected",
        is_primary: true,
        last_sync_at: null,
      },
      {
        onConflict: "user_id,provider",
      }
    )

    if (error) {
      showError(error.message)
      return false
    }

    const connessione = {
      provider,
      connection_mode: provider === "excel" ? "file" : "api",
      status:
        apiKeyPulita || provider === "excel" ? "connected" : "not_connected",
      is_primary: true,
      last_sync_at: null,
    }

    setGestionaleAttivo(connessione)

    if (provider === "danea") {
      return await sincronizzaDanea()
    }

    showSuccess("Gestionale principale salvato correttamente.")
    return true
  }

  // Rimuove la connessione del gestionale principale dopo conferma utente.
  async function scollegaGestionale() {
    if (!user || !gestionaleAttivo) return

    apriConferma(
      "Scollegare gestionale?",
      "Questa azione scollega il gestionale principale dello studio.",
      async () => {
        const { error } = await supabase
          .from("gestionale_connections")
          .delete()
          .eq("user_id", user.id)
          .eq("provider", gestionaleAttivo.provider)

        if (error) {
          showError(error.message)
          return
        }

        setGestionaleAttivo(null)
        showSuccess("Gestionale scollegato correttamente.")
      }
    )
  }

  // Sceglie la procedura di sincronizzazione in base al gestionale attivo.
  async function sincronizzaGestionaleAttivo() {
    if (!gestionaleAttivo) {
      showWarning("Nessun gestionale collegato.")
      return
    }

    if (gestionaleAttivo.provider === "danea") {
      await sincronizzaDanea()
      return
    }

    showInfo("Sincronizzazione non ancora disponibile per questo gestionale.")
  }

  // ============================================================
  // CONDOMINI
  // Creazione, modifica ed eliminazione dei fabbricati amministrati.
  // ============================================================

  // Crea un nuovo condominio manualmente dal form del modal.
  async function creaCondominio() {
    if (!form.nome_condominio || !form.indirizzo || !form.comune) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from("condomini")
      .insert([
        {
          tipo: form.tipo,
          nome: form.nome_condominio,
          nome_condominio: form.nome_condominio,
          cod_fiscale: form.cod_fiscale,
          indirizzo: form.indirizzo,
          cap: form.cap,
          comune: form.comune,
          provincia: form.provincia,
          dati_catastali: form.dati_catastali,
          email_notifiche: form.email_notifiche,
          user_id: user?.id,
        },
      ])
      .select()

    if (error) {
      showError(error.message)
      return
    }

    if (data) {
      setCondomini((prev) => [...data, ...prev])
    }

    setForm({
      tipo: "Condominio",
      nome_condominio: "",
      cod_fiscale: "",
      indirizzo: "",
      cap: "",
      comune: "",
      provincia: "",
      dati_catastali: "",
      email_notifiche: "",
    })

    setShowModal(false)
  }

  // Aggiorna i dati anagrafici principali di un condominio.
  async function modificaCondominio(condominio: Condominio) {
    const { error } = await supabase
      .from("condomini")
      .update({
        nome: nomeCondominio(condominio),
        nome_condominio: nomeCondominio(condominio),
        indirizzo: condominio.indirizzo,
        comune: condominio.comune,
      })
      .eq("id", condominio.id)

    if (error) {
      showError(error.message)
      return
    }

    setEditingCondominioId(null)
  }

  // Elimina un condominio dopo conferma utente.
  async function eliminaCondominio(id: number) {
    apriConferma(
      "Eliminare condominio?",
      "Questa azione eliminerà il condominio selezionato.",
      async () => {
        const { error } = await supabase.from("condomini").delete().eq("id", id)

        if (error) {
          showError(error.message)
          return
        }

        setCondomini((prev) => prev.filter((c) => c.id !== id))
      }
    )
  }

  // ============================================================
  // IMPORT EXCEL / CSV
  // Lettura file, validazione, controllo duplicati e salvataggio finale.
  // ============================================================

  // Legge il file, prepara anteprima e separa validi, errori e duplicati.
  async function preparaAnteprimaImportCondomini(file: File) {
    if (!user) return

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)

    const primoFoglio = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[primoFoglio]

    const righeGreze = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
    })

    const indiceHeader = righeGreze.findIndex((riga) => {
      const valori = riga.map((cella) => String(cella).toLowerCase().trim())

      return (
        valori.includes("nome") &&
        valori.includes("indirizzo") &&
        (valori.includes("città") ||
          valori.includes("citta") ||
          valori.includes("comune"))
      )
    })

    if (indiceHeader === -1) {
      showWarning("Impossibile trovare le intestazioni corrette nel file Excel.")
      return
    }

    const righe = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      range: indiceHeader,
      defval: "",
    })

    const validi: ImportCondominio[] = []
    const errori: ImportIssue[] = []
    const duplicati: ImportIssue[] = []

    const { data: condominiEsistenti, error } = await supabase
      .from("condomini")
      .select("id, nome, nome_condominio, indirizzo, comune")
      .eq("user_id", user.id)

    if (error) {
      showError(error.message)
      return
    }

    const normalizzaTesto = (valore: string) =>
      String(valore || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")

    const creaChiaveDuplicato = (
      condominio: Pick<
        ImportCondominio,
        "nome" | "nome_condominio" | "indirizzo" | "comune"
      >
    ) => {
      const nome = condominio.nome || condominio.nome_condominio || ""

      return `${normalizzaTesto(nome)}|${normalizzaTesto(
        condominio.indirizzo
      )}|${normalizzaTesto(condominio.comune)}`
    }

    const chiaviDatabase = new Set(
      (condominiEsistenti || []).map((condominio) =>
        creaChiaveDuplicato(condominio)
      )
    )

    const chiaviFile = new Set<string>()

    righe.forEach((riga, index) => {
      const valore = (...chiavi: string[]) =>
        chiavi
          .map((chiave) => String(riga[chiave] ?? "").trim())
          .find(Boolean) ?? ""

      const nome = valore(
        "nome",
        "Nome",
        "condominio",
        "Condominio",
        "Nome condominio",
        "Nome Condominio"
      )

      const condominio: ImportCondominio = {
        nome,
        nome_condominio: nome,

        indirizzo: valore("indirizzo", "Indirizzo", "via", "Via"),

        comune: valore("comune", "Comune", "citta", "Citta", "Città"),

        email_notifiche: valore(
          "email_notifiche",
          "Email_notifiche",
          "email",
          "Email",
          "mail",
          "Mail"
        ),

        user_id: user.id,
      }

      if (!condominio.nome || !condominio.indirizzo || !condominio.comune) {
        errori.push({
          riga: index + 2,
          motivo: "Mancano nome, indirizzo o comune",
          dati: riga,
        })
        return
      }

      const chiave = creaChiaveDuplicato(condominio)

      if (chiaviDatabase.has(chiave)) {
        duplicati.push({
          ...condominio,
          riga: index + 2,
          motivo: "Già presente nel database",
        })
        return
      }

      if (chiaviFile.has(chiave)) {
        duplicati.push({
          ...condominio,
          riga: index + 2,
          motivo: "Duplicato nello stesso file",
        })
        return
      }

      chiaviFile.add(chiave)
      validi.push(condominio)
    })

    setAnteprimaImport(validi)
    setErroriImport(errori)
    setDuplicatiImport(duplicati)

    if (duplicati.length > 0 || errori.length > 0) {
      setShowImportReport(true)
    }

    if (validi.length === 0) {
      showWarning("Nessun nuovo condominio valido da importare.")
    }
  }

  // Inserisce in Supabase solo i condomini gia' validati nell'anteprima.
  async function confermaImportCondomini() {
    if (!user) return

    if (anteprimaImport.length === 0) {
      showWarning("Non ci sono condomini validi da importare.")
      return
    }

    setImportInCorso(true)

    const { data, error } = await supabase
      .from("condomini")
      .insert(anteprimaImport)
      .select()

    setImportInCorso(false)

    if (error) {
      showError(error.message)
      return
    }

    if (data) {
      setCondomini((prev) => [...data, ...prev])
    }

    showSuccess(`${anteprimaImport.length} condomini importati correttamente.`)

    setAnteprimaImport([])
    setErroriImport([])
    setDuplicatiImport([])
  }

  // ============================================================
  // IMPIANTI
  // Gestione impianti del condominio selezionato e relative scadenze.
  // ============================================================

  // Aggiunge un impianto al condominio selezionato.
  async function aggiungiImpianto() {
    if (!selectedCondominio || !nuovoImpianto.tipo) return

    const impiantiAttuali = selectedCondominio.impianti ?? []
    const impiantiAggiornati = [
      ...impiantiAttuali,
      {
        id: creaIdLocale(),
        ...nuovoImpianto,
      },
    ]

    const { error } = await supabase
      .from("condomini")
      .update({ impianti: impiantiAggiornati })
      .eq("id", selectedCondominio.id)

    if (error) {
      showError(error.message)
      return
    }

    const aggiornato = {
      ...selectedCondominio,
      impianti: impiantiAggiornati,
    }

    setSelectedCondominio(aggiornato)
    setCondomini((prev) =>
      prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
    )

    setNuovoImpianto({
      tipo: "",
      nome: "",
      manutenzione: "",
      avviso_manutenzione: "",
      contratto_manutenzione: "",
      avviso_contratto_manutenzione: "",
    })
  }

  // Salva le modifiche a un impianto gia' presente.
  async function modificaImpianto(impiantoAggiornato: Impianto) {
    if (!selectedCondominio) return

    const impiantiAggiornati = (selectedCondominio.impianti ?? []).map(
      (impianto) =>
        impianto.id === impiantoAggiornato.id ? impiantoAggiornato : impianto
    )

    const { error } = await supabase
      .from("condomini")
      .update({ impianti: impiantiAggiornati })
      .eq("id", selectedCondominio.id)

    if (error) {
      showError(error.message)
      return
    }

    const aggiornato = {
      ...selectedCondominio,
      impianti: impiantiAggiornati,
    }

    setSelectedCondominio(aggiornato)
    setCondomini((prev) =>
      prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
    )
    setEditingImpiantoId(null)
  }

  // Elimina un impianto dal condominio selezionato dopo conferma.
  async function eliminaImpianto(idImpianto: number) {
    if (!selectedCondominio) return

    apriConferma(
      "Eliminare impianto?",
      "Questa azione eliminerà l’impianto dal condominio.",
      async () => {
        const impiantiAggiornati = (selectedCondominio.impianti ?? []).filter(
          (impianto) => impianto.id !== idImpianto
        )

        const { error } = await supabase
          .from("condomini")
          .update({ impianti: impiantiAggiornati })
          .eq("id", selectedCondominio.id)

        if (error) {
          showError(error.message)
          return
        }

        const aggiornato = {
          ...selectedCondominio,
          impianti: impiantiAggiornati,
        }

        setSelectedCondominio(aggiornato)
        setCondomini((prev) =>
          prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
        )
      }
    )
  }

  // ============================================================
  // DOCUMENTI
  // Upload, apertura, download, modifica ed eliminazione documenti.
  // ============================================================

  // Crea un URL firmato temporaneo e apre il file in una nuova scheda.
  async function apriDocumento(filePath: string) {
    const { data, error } = await supabase.storage
      .from("documenti")
      .createSignedUrl(filePath, 60)

    if (error || !data?.signedUrl) {
      showError("Errore apertura documento.")
      return
    }

    const nuovaFinestra = window.open(
      data.signedUrl,
      "_blank",
      "noopener,noreferrer"
    )

    if (nuovaFinestra) {
      nuovaFinestra.opener = null
    }
  }

  // Serve per aprire la preview all'interno dell'app senza lasciare la pagina, ad esempio per i PDF.//

  async function apriPreviewDocumento(documento: Documento) {
  if (!documento.file_path) {
    showWarning("Nessun file collegato a questo documento.")
    return
  }

  const { data, error } = await supabase.storage
    .from("documenti")
    .createSignedUrl(documento.file_path, 60)

  if (error || !data?.signedUrl) {
    showError("Errore anteprima documento.")
    return
  }

  setPreviewDocumento(documento)
  setPreviewUrl(data.signedUrl)
}

function chiudiPreviewDocumento() {
  setPreviewDocumento(null)
  setPreviewUrl(null)
}

  // Scarica un documento da Supabase Storage nel browser dell'utente.
  async function scaricaDocumento(filePath: string, nomeFile?: string) {
    const { data, error } = await supabase.storage
      .from("documenti")
      .download(filePath)

    if (error || !data) {
      showError("Errore download documento.")
      return
    }

    const url = URL.createObjectURL(data)
    const a = document.createElement("a")
    a.href = url
    a.download = nomeFile || "documento"
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // Aggiunge metadati e, se presente, carica il file in Supabase Storage.
  async function aggiungiDocumento() {
    if (!selectedCondominio || !nuovoDocumento.titolo) return

    let filePath = ""
    let fileName = ""
    let mimeType = ""
    let fileSize = 0

    if (fileDocumento) {
      const erroreFile = validaFileDocumento(fileDocumento)

      if (erroreFile) {
        showWarning(erroreFile)
        return
      }

      fileName = normalizzaNomeFile(fileDocumento.name)
      filePath = percorsoDocumentoSicuro(selectedCondominio.id, fileDocumento)
      mimeType = fileDocumento.type
      fileSize = fileDocumento.size

      const { error: uploadError } = await supabase.storage
        .from("documenti")
        .upload(filePath, fileDocumento)

      if (uploadError) {
        showError(uploadError.message)
        return
      }
    }

    const documentiAttuali = selectedCondominio.documenti ?? []
    const documentiAggiornati: Documento[] = [
      {
        id: Date.now(),
        titolo: nuovoDocumento.titolo,
        categoria: nuovoDocumento.categoria,
        data: nuovoDocumento.data,
        note: nuovoDocumento.note,
        file_path: filePath,
        file_name: fileName,
        mime_type: mimeType,
        file_size: fileSize,
        ocr_status: filePath ? "pending" : undefined,
        ocr_text: "",
        ai_category: "",
        ai_summary: "",
        ai_extracted_dates: [],
        ai_extracted_amounts: [],
      },
      ...documentiAttuali,
    ]

    const { error } = await supabase
      .from("condomini")
      .update({ documenti: documentiAggiornati })
      .eq("id", selectedCondominio.id)

    if (error) {
      showError(error.message)
      return
    }

    const aggiornato = {
      ...selectedCondominio,
      documenti: documentiAggiornati,
    }

    setSelectedCondominio(aggiornato)
    setCondomini((prev) =>
      prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
    )

    setNuovoDocumento({
      titolo: "",
      categoria: "Contratto",
      data: "",
      note: "",
    })
    setFileDocumento(null)
  }

    async function aggiungiDocumentoGlobale() {
  if (!uploadCondominioId || !nuovoDocumento.titolo) return

const condominioTarget = condomini.find(
  (c) => Number(c.id) === Number(uploadCondominioId)
)
  if (!condominioTarget) {
    showWarning("Condominio non trovato.")
    return
  }

  let filePath = ""
  let fileName = ""
  let mimeType = ""
  let fileSize = 0

  if (fileDocumento) {
    const erroreFile = validaFileDocumento(fileDocumento)

    if (erroreFile) {
      showWarning(erroreFile)
      return
    }

    fileName = normalizzaNomeFile(fileDocumento.name)
    mimeType = fileDocumento.type
    fileSize = fileDocumento.size
    filePath = percorsoDocumentoSicuro(condominioTarget.id, fileDocumento)

    const { error: uploadError } = await supabase.storage
      .from("documenti")
      .upload(filePath, fileDocumento)

    if (uploadError) {
      showError(uploadError.message)
      return
    }
  }

  const documentiAttuali = condominioTarget.documenti ?? []

  const documentiAggiornati: Documento[] = [
    {
      id: Date.now(),
      titolo: nuovoDocumento.titolo,
      categoria: nuovoDocumento.categoria,
      data: nuovoDocumento.data,
      note: nuovoDocumento.note,
      file_path: filePath,
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileSize,
      ocr_status: filePath ? "pending" : undefined,
      ocr_text: "",
      ai_category: "",
      ai_summary: "",
      ai_extracted_dates: [],
      ai_extracted_amounts: [],
    },
    ...documentiAttuali,
  ]

  const { error } = await supabase
    .from("condomini")
    .update({ documenti: documentiAggiornati })
    .eq("id", condominioTarget.id)

  if (error) {
    showError(error.message)
    return
  }

  const aggiornato = {
    ...condominioTarget,
    documenti: documentiAggiornati,
  }

  setCondomini((prev) =>
    prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
  )

  if (selectedCondominio?.id === aggiornato.id) {
    setSelectedCondominio(aggiornato)
  }

  setNuovoDocumento({
    titolo: "",
    categoria: "Contratto",
    data: "",
    note: "",
  })

  setFileDocumento(null)
  setUploadCondominioId("")
  setShowUploadDocumentoModal(false)
}

  // Aggiorna titolo, categoria, data e note di un documento.
  async function modificaDocumento(documentoAggiornato: Documento) {
    if (!selectedCondominio) return

    const documentiAggiornati = (selectedCondominio.documenti ?? []).map(
      (documento) =>
        documento.id === documentoAggiornato.id
          ? documentoAggiornato
          : documento
    )

    const { error } = await supabase
      .from("condomini")
      .update({ documenti: documentiAggiornati })
      .eq("id", selectedCondominio.id)

    if (error) {
      showError(error.message)
      return
    }

    const aggiornato = {
      ...selectedCondominio,
      documenti: documentiAggiornati,
    }

    setSelectedCondominio(aggiornato)
    setCondomini((prev) =>
      prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
    )
    setEditingDocumentoId(null)
  }

  async function analizzaDocumentoMock(documentoDaAnalizzare: DocumentoGlobale) {
  const condominio = condomini.find(
    (c) => Number(c.id) === Number(documentoDaAnalizzare.condominio_id)
  )

  if (!condominio) {
    showWarning("Condominio non trovato per questo documento.")
    return
  }

  const documentiProcessing = (condominio.documenti ?? []).map((documento) =>
    documento.id === documentoDaAnalizzare.id
      ? {
          ...documento,
          ocr_status: "processing" as const,
        }
      : documento
  )

  const { error: processingError } = await supabase
    .from("condomini")
    .update({ documenti: documentiProcessing })
    .eq("id", condominio.id)

  if (processingError) {
    showError(processingError.message)
    return
  }

  setCondomini((prev) =>
    prev.map((c) =>
      c.id === condominio.id ? { ...c, documenti: documentiProcessing } : c
    )
  )

  setTimeout(async () => {
    const documentiCompletati = documentiProcessing.map((documento) =>
      documento.id === documentoDaAnalizzare.id
        ? {
            ...documento,
            ocr_status: "completed" as const,
            ocr_text: `
              Testo OCR simulato del documento ${documento.titolo}.
              Condominio collegato: ${nomeCondominio(condominio)}.
              Categoria documento: ${documento.categoria}.
              Possibili riferimenti rilevati: ascensore, manutenzione, contratto, fattura, certificazione, scadenza.
              Data rilevata: ${new Date().toISOString().slice(0, 10)}.
              Importo rilevato: € 1.250,00.
            `,
            ai_category: documento.categoria || "Documento operativo",
            ai_summary:
              "Documento analizzato automaticamente. Il sistema ha rilevato contenuti utili per archivio, ricerca e future automazioni operative.",
            ai_extracted_dates: [
              new Date().toISOString().slice(0, 10),
            ],
           ai_extracted_amounts: ["€ 1.250,00"],
          }
        : documento
    )

    const { error } = await supabase
      .from("condomini")
      .update({ documenti: documentiCompletati })
      .eq("id", condominio.id)

    if (error) {
      showError(error.message)
      return
    }

    setCondomini((prev) =>
      prev.map((c) =>
        c.id === condominio.id ? { ...c, documenti: documentiCompletati } : c
      )
    )

    if (selectedCondominio?.id === condominio.id) {
      setSelectedCondominio({
        ...condominio,
        documenti: documentiCompletati,
      })
    }
  }, 1200)
}

  // Elimina il record documento e, se presente, anche il file collegato.
  async function eliminaDocumento(documento: Documento) {
    if (!selectedCondominio) return

    apriConferma(
      "Eliminare documento?",
      "Questa azione eliminerà il documento e il file collegato.",
      async () => {
        if (documento.file_path) {
          const { error: storageError } = await supabase.storage
            .from("documenti")
            .remove([documento.file_path])

          if (storageError) {
            showError(storageError.message)
            return
          }
        }

        const documentiAggiornati = (
          selectedCondominio.documenti ?? []
        ).filter((doc) => doc.id !== documento.id)

        const { error } = await supabase
          .from("condomini")
          .update({ documenti: documentiAggiornati })
          .eq("id", selectedCondominio.id)

        if (error) {
          showError(error.message)
          return
        }

        const aggiornato = {
          ...selectedCondominio,
          documenti: documentiAggiornati,
        }

        setSelectedCondominio(aggiornato)
        setCondomini((prev) =>
          prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
        )
      }
    )
  }

  // ============================================================
  // TIMELINE CONDOMINIO
  // Gestisce note, telefonate, email e interventi del singolo condominio.
  // ============================================================

  // Aggiunge un nuovo evento alla timeline del condominio selezionato.
  async function aggiungiEventoTimeline() {
    if (!selectedCondominio || !nuovoEvento.titolo) return

    const timelineAttuale = selectedCondominio.timeline ?? []
    const timelineAggiornata = [
      {
        id: Date.now(),
        tipo: nuovoEvento.tipo,
        titolo: nuovoEvento.titolo,
        descrizione: nuovoEvento.descrizione,
        data: new Date().toISOString(),
      },
      ...timelineAttuale,
    ]

    const { error } = await supabase
      .from("condomini")
      .update({ timeline: timelineAggiornata })
      .eq("id", selectedCondominio.id)

    if (error) {
      showError(error.message)
      return
    }

    const aggiornato = {
      ...selectedCondominio,
      timeline: timelineAggiornata,
    }

    setSelectedCondominio(aggiornato)
    setCondomini((prev) =>
      prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
    )

    setNuovoEvento({
      tipo: "Nota",
      titolo: "",
      descrizione: "",
    })
  }

  // Salva la modifica di un evento timeline esistente.
  async function modificaEventoTimeline(eventoAggiornato: TimelineEvent) {
    if (!selectedCondominio) return

    const timelineAggiornata = (selectedCondominio.timeline ?? []).map(
      (evento) =>
        evento.id === eventoAggiornato.id ? eventoAggiornato : evento
    )

    const { error } = await supabase
      .from("condomini")
      .update({ timeline: timelineAggiornata })
      .eq("id", selectedCondominio.id)

    if (error) {
      showError(error.message)
      return
    }

    const aggiornato = {
      ...selectedCondominio,
      timeline: timelineAggiornata,
    }

    setSelectedCondominio(aggiornato)
    setCondomini((prev) =>
      prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
    )
    setEditingEventoId(null)
  }

  // Rimuove un evento dalla timeline dopo conferma.
  async function eliminaEventoTimeline(idEvento: number) {
    if (!selectedCondominio) return

    apriConferma(
      "Eliminare evento?",
      "Questa azione eliminerà l’evento dalla timeline.",
      async () => {
        const timelineAggiornata = (selectedCondominio.timeline ?? []).filter(
          (evento) => evento.id !== idEvento
        )

        const { error } = await supabase
          .from("condomini")
          .update({ timeline: timelineAggiornata })
          .eq("id", selectedCondominio.id)

        if (error) {
          showError(error.message)
          return
        }

        const aggiornato = {
          ...selectedCondominio,
          timeline: timelineAggiornata,
        }

        setSelectedCondominio(aggiornato)
        setCondomini((prev) =>
          prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
        )
      }
    )
  }

  // ============================================================
  // TICKET
  // Crea, modifica ed elimina segnalazioni sul dettaglio condominio
  // e nella vista globale.
  // ============================================================

  // Aggiunge un nuovo ticket al condominio selezionato.
  async function aggiungiTicket() {
    if (!selectedCondominio || !nuovoTicket.titolo) return

    const ticketAttuali = selectedCondominio.ticket ?? []
    const ticketAggiornati: Ticket[] = [
      {
        id: Date.now(),
        titolo: nuovoTicket.titolo,
        descrizione: nuovoTicket.descrizione,
        stato: nuovoTicket.stato as Ticket["stato"],
        priorita: nuovoTicket.priorita as Ticket["priorita"],
        data: new Date().toISOString(),
      },
      ...ticketAttuali,
    ]

    const { error } = await supabase
      .from("condomini")
      .update({ ticket: ticketAggiornati })
      .eq("id", selectedCondominio.id)

    if (error) {
      showError(error.message)
      return
    }

    const aggiornato = {
      ...selectedCondominio,
      ticket: ticketAggiornati,
    }

    setSelectedCondominio(aggiornato)
    setCondomini((prev) =>
      prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
    )

    setNuovoTicket({
      titolo: "",
      descrizione: "",
      stato: "Aperto",
      priorita: "Media",
    })
  }

  // Modifica titolo, descrizione, stato e priorita' di un ticket locale.
  async function modificaTicket(ticketAggiornato: Ticket) {
    if (!selectedCondominio) return

    const ticketAggiornati = (selectedCondominio.ticket ?? []).map((ticket) =>
      ticket.id === ticketAggiornato.id ? ticketAggiornato : ticket
    )

    const { error } = await supabase
      .from("condomini")
      .update({ ticket: ticketAggiornati })
      .eq("id", selectedCondominio.id)

    if (error) {
      showError(error.message)
      return
    }

    const aggiornato = {
      ...selectedCondominio,
      ticket: ticketAggiornati,
    }

    setSelectedCondominio(aggiornato)
    setCondomini((prev) =>
      prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
    )
    setEditingTicketId(null)
  }

  // Elimina un ticket dal dettaglio condominio dopo conferma.
  async function eliminaTicket(idTicket: number) {
    if (!selectedCondominio) return

    apriConferma(
      "Eliminare ticket?",
      "Questa azione eliminerà il ticket selezionato.",
      async () => {
        const ticketAggiornati = (selectedCondominio.ticket ?? []).filter(
          (ticket) => ticket.id !== idTicket
        )

        const { error } = await supabase
          .from("condomini")
          .update({ ticket: ticketAggiornati })
          .eq("id", selectedCondominio.id)

        if (error) {
          showError(error.message)
          return
        }

        const aggiornato = {
          ...selectedCondominio,
          ticket: ticketAggiornati,
        }

        setSelectedCondominio(aggiornato)
        setCondomini((prev) =>
          prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
        )
      }
    )
  }

  // Salva un ticket modificato partendo dalla vista globale.
  async function modificaTicketGlobale(ticketAggiornato: TicketGlobale) {
    const condominio = condomini.find(
      (c) => c.id === ticketAggiornato.condominio_id
    )

    if (!condominio) {
      showWarning("Condominio non trovato.")
      return
    }

    const ticketPulito: Ticket = {
      id: ticketAggiornato.id,
      titolo: ticketAggiornato.titolo,
      descrizione: ticketAggiornato.descrizione,
      stato: ticketAggiornato.stato,
      priorita: ticketAggiornato.priorita,
      data: ticketAggiornato.data,
    }

    const ticketAggiornati = (condominio.ticket ?? []).map((ticket) =>
      ticket.id === ticketAggiornato.id ? ticketPulito : ticket
    )

    const { error } = await supabase
      .from("condomini")
      .update({
        ticket: ticketAggiornati,
      })
      .eq("id", condominio.id)

    if (error) {
      showError(error.message)
      return
    }

    setCondomini((prev) =>
      prev.map((c) =>
        c.id === condominio.id
          ? {
              ...c,
              ticket: ticketAggiornati,
            }
          : c
      )
    )

    setEditingGlobalTicketKey(null)
  }

  // Elimina un ticket dalla vista globale dopo aver individuato il condominio.
  async function eliminaTicketGlobale(ticketDaEliminare: TicketGlobale) {
    const condominio = condomini.find(
      (c) => c.id === ticketDaEliminare.condominio_id
    )

    if (!condominio) {
      showWarning("Condominio non trovato.")
      return
    }

    apriConferma(
      "Eliminare ticket?",
      "Questa azione eliminerà il ticket selezionato.",
      async () => {
        const ticketAggiornati = (condominio.ticket ?? []).filter(
          (ticket) => ticket.id !== ticketDaEliminare.id
        )

        const { error } = await supabase
          .from("condomini")
          .update({ ticket: ticketAggiornati })
          .eq("id", condominio.id)

        if (error) {
          showError(error.message)
          return
        }

        setCondomini((prev) =>
          prev.map((c) =>
            c.id === condominio.id ? { ...c, ticket: ticketAggiornati } : c
          )
        )
      }
    )
  }

  function aggiornaTicketGlobaleDraft(
    ticketDaAggiornare: TicketGlobale,
    patch: Partial<Ticket>
  ) {
    setCondomini((prev) =>
      prev.map((condominio) =>
        condominio.id === ticketDaAggiornare.condominio_id
          ? {
              ...condominio,
              ticket: (condominio.ticket ?? []).map((ticket) =>
                ticket.id === ticketDaAggiornare.id
                  ? { ...ticket, ...patch }
                  : ticket
              ),
            }
          : condominio
      )
    )
  }

  // ============================================================
  // FORNITORI
  // CRUD anagrafiche fornitori collegate ai condomini.
  // ============================================================

  function resetFornitoreForm() {
    setFornitoreForm({
      nome: "",
      cognome: "",
      partita_iva: "",
      telefono: "",
      iban: "",
      mansione: "",
      condominio_id: "",
    })
  }

  async function creaFornitore() {
    if (!user || !fornitoreForm.nome.trim() || !fornitoreForm.cognome.trim()) {
      showWarning("Inserisci almeno nome e cognome del fornitore.")
      return
    }

    const telefono = normalizzaTelefonoItalia(fornitoreForm.telefono)
    const iban = normalizzaIbanItalia(fornitoreForm.iban)
    const partitaIva = normalizzaPartitaIva(fornitoreForm.partita_iva)

    if (!telefonoItalianoValido(telefono)) {
      showWarning("Il numero di telefono deve contenere solo numeri, da 6 a 11 cifre.")
      return
    }

    if (!partitaIvaValida(partitaIva)) {
      showWarning("La Partita IVA deve contenere 11 cifre.")
      return
    }

    if (!ibanItalianoValido(iban)) {
      showWarning("L'IBAN italiano deve avere 27 caratteri e iniziare con IT.")
      return
    }

    const nuovoFornitore = {
      user_id: user.id,
      nome: fornitoreForm.nome.trim(),
      cognome: fornitoreForm.cognome.trim(),
      partita_iva: partitaIva,
      telefono,
      iban,
      mansione: fornitoreForm.mansione.trim(),
      condominio_id: fornitoreForm.condominio_id || null,
    }

    const { data, error } = await supabase
      .from("fornitori")
      .insert([nuovoFornitore])
      .select()
      .single()

    if (error) {
      showError(error.message)
      return
    }

    setFornitori((prev) => [data, ...prev])
    resetFornitoreForm()
    showSuccess("Fornitore salvato correttamente.")
  }

  async function modificaFornitore(fornitoreAggiornato: Fornitore) {
    const telefono = normalizzaTelefonoItalia(fornitoreAggiornato.telefono)
    const iban = normalizzaIbanItalia(fornitoreAggiornato.iban)
    const partitaIva = normalizzaPartitaIva(fornitoreAggiornato.partita_iva)

    if (!telefonoItalianoValido(telefono)) {
      showWarning("Il numero di telefono deve contenere solo numeri, da 6 a 11 cifre.")
      return
    }

    if (!partitaIvaValida(partitaIva)) {
      showWarning("La Partita IVA deve contenere 11 cifre.")
      return
    }

    if (!ibanItalianoValido(iban)) {
      showWarning("L'IBAN italiano deve avere 27 caratteri e iniziare con IT.")
      return
    }

    const { error } = await supabase
      .from("fornitori")
      .update({
        nome: fornitoreAggiornato.nome,
        cognome: fornitoreAggiornato.cognome,
        partita_iva: partitaIva,
        telefono,
        iban,
        mansione: fornitoreAggiornato.mansione,
        condominio_id: fornitoreAggiornato.condominio_id || null,
      })
      .eq("id", fornitoreAggiornato.id)
      .eq("user_id", user?.id)

    if (error) {
      showError(error.message)
      return
    }

    setEditingFornitoreId(null)
    showSuccess("Fornitore aggiornato correttamente.")
  }

  async function eliminaFornitore(id: number) {
    apriConferma(
      "Eliminare fornitore?",
      "Questa azione eliminerà l'anagrafica del fornitore.",
      async () => {
        const { error } = await supabase
          .from("fornitori")
          .delete()
          .eq("id", id)
          .eq("user_id", user?.id)

        if (error) {
          showError(error.message)
          return
        }

        setFornitori((prev) => prev.filter((fornitore) => fornitore.id !== id))
        showSuccess("Fornitore eliminato correttamente.")
      }
    )
  }

  // ============================================================
  // COMMUNICATION ENGINE
  // Gestisce comunicazioni inbound/outbound e creazione ticket collegati.
  // ============================================================

  // Crea un evento test per validare il flusso comunicazione -> ticket.
  async function creaCommunicationEventTest() {
    if (!user) return

    const testoCompleto = `
      Richiesta intervento urgente
      Segnalata infiltrazione nel condominio.
    `.toLowerCase()

    let priority = "media"

    if (
      testoCompleto.includes("urgente") ||
      testoCompleto.includes("allagamento") ||
      testoCompleto.includes("infiltrazione") ||
      testoCompleto.includes("bloccato")
    ) {
      priority = "alta"
    }

    const { data, error } = await supabase
      .from("communication_events")
      .insert([
        {
          user_id: user.id,
          condominio_id: condomini[0]?.id ?? null,
          channel: "email",
          direction: "inbound",
          sender: "fornitore@test.it",
          subject: "Richiesta intervento urgente",
          body: "Segnalata infiltrazione nel condominio.",
          priority,
        },
      ])
      .select()

    if (error) {
      showError(error.message)
      return
    }

    if (data) {
      const eventiCreati = data.filter((item) => item != null)
      setCommunicationEvents((prev) => [...eventiCreati, ...prev])
    }

    showSuccess("Comunicazione creata.")
  }

  // Crea un ticket partendo da una comunicazione non ancora gestita.
  async function creaTicketDaCommunicationEvent(evento: CommunicationEvent) {
    if (!user) return

    if (evento.status === "ticket_created" || evento.linked_ticket_id) {
      showInfo("Per questa comunicazione e' gia' stato creato un ticket.")
      return
    }

    const { data: eventoRows, error: eventoLoadError } = await supabase
      .from("communication_events")
      .select("*")
      .eq("id", evento.id)
      .eq("user_id", user.id)
      .limit(1)

    if (eventoLoadError) {
      showError(eventoLoadError.message)
      return
    }

    const eventoAggiornato = eventoRows?.[0]

    if (!eventoAggiornato) {
      showWarning("Comunicazione non trovata.")
      return
    }

    if (
      eventoAggiornato.status === "ticket_created" ||
      eventoAggiornato.linked_ticket_id
    ) {
      setCommunicationEvents((prev) =>
        prev.map((item) =>
          item.id === eventoAggiornato.id
            ? {
                ...item,
                status: eventoAggiornato.status,
                linked_ticket_id: eventoAggiornato.linked_ticket_id,
              }
            : item
        )
      )
      showInfo("Per questa comunicazione e' gia' stato creato un ticket.")
      return
    }

    const nuovoTicket: Ticket = {
      id: creaIdLocale(),
      titolo: eventoAggiornato.subject || "Nuova segnalazione",
      descrizione: eventoAggiornato.body || "",
      stato: "Aperto",
      priorita:
        eventoAggiornato.priority === "alta"
          ? "Alta"
          : eventoAggiornato.priority === "bassa"
            ? "Bassa"
            : "Media",
      data: new Date().toISOString(),
    }

    if (!eventoAggiornato.condominio_id) {
      showWarning("Nessun condominio associato.")
      return
    }

    const condominio =
      condomini.find((c) => c.id === eventoAggiornato.condominio_id) ??
      (selectedCondominio?.id === eventoAggiornato.condominio_id
        ? selectedCondominio
        : null)

    if (!condominio) {
      showWarning("Condominio non trovato.")
      return
    }

    const { error: eventoError } = await supabase
      .from("communication_events")
      .update({
        status: "ticket_created",
        linked_ticket_id: nuovoTicket.id,
      })
      .eq("user_id", user.id)
      .eq("id", eventoAggiornato.id)
      .is("linked_ticket_id", null)
      .neq("status", "ticket_created")

    if (eventoError) {
      showError(eventoError.message)
      return
    }

    const { data: latestEventRows, error: latestEventError } = await supabase
      .from("communication_events")
      .select("*")
      .eq("id", eventoAggiornato.id)
      .eq("user_id", user.id)
      .limit(1)

    if (latestEventError) {
      showError(latestEventError.message)
      return
    }

    const eventoConTicket = latestEventRows?.[0]

    if (
      !eventoConTicket ||
      eventoConTicket.status !== "ticket_created" ||
      eventoConTicket.linked_ticket_id !== nuovoTicket.id
    ) {
      if (eventoConTicket) {
        setCommunicationEvents((prev) =>
          prev.map((item) =>
            item.id === eventoConTicket.id ? { ...item, ...eventoConTicket } : item
          )
        )
      }

      showError("Impossibile associare il ticket a questa comunicazione.")
      return
    }

    const ticketPrecedenti = condominio.ticket ?? []
    const ticketAggiornati = [nuovoTicket, ...ticketPrecedenti]

    const { data: condominioRows, error: ticketError } = await supabase
      .from("condomini")
      .update({ ticket: ticketAggiornati })
      .eq("id", condominio.id)
      .eq("user_id", user.id)
      .select("id")

    if (ticketError || !condominioRows?.length) {
      await supabase
        .from("communication_events")
        .update({
          status: eventoAggiornato.status,
          linked_ticket_id: eventoAggiornato.linked_ticket_id,
        })
        .eq("id", eventoAggiornato.id)
        .eq("user_id", user.id)

      showError(ticketError?.message ?? "Impossibile salvare il ticket nel condominio.")
      return
    }

    const condominioAggiornato = {
      ...condominio,
      ticket: ticketAggiornati,
    }

    setCondomini((prev) =>
      prev.map((c) => (c.id === condominio.id ? condominioAggiornato : c))
    )

    setSelectedCondominio((prev) =>
      prev && prev.id === condominio.id
        ? { ...prev, ticket: ticketAggiornati }
        : prev
    )

    setCommunicationEvents((prev) =>
      prev.map((item) =>
        item.id === eventoConTicket.id
          ? {
              ...item,
              ...eventoConTicket,
            }
          : item
      )
    )

    showSuccess("Ticket creato dalla comunicazione.")
  }

  // Salva le modifiche manuali a una comunicazione.
  async function modificaCommunicationEvent(eventoAggiornato: CommunicationEvent) {
    if (!user) return

    const { error } = await supabase
      .from("communication_events")
      .update({
        channel: eventoAggiornato.channel,
        sender: eventoAggiornato.sender,
        subject: eventoAggiornato.subject,
        body: eventoAggiornato.body,
        priority: eventoAggiornato.priority,
      })
      .eq("id", eventoAggiornato.id)
      .eq("user_id", user.id)

    if (error) {
      showError(error.message)
      return
    }

    setCommunicationEvents((prev) =>
      prev.map((evento) =>
        evento.id === eventoAggiornato.id ? eventoAggiornato : evento
      )
    )

    setEditingCommunicationId(null)
  }

  // Elimina una comunicazione e, se presente, anche il ticket collegato.
  async function eliminaCommunicationEvent(evento: CommunicationEvent) {
    if (!user) return

    apriConferma(
      "Eliminare comunicazione?",
      "Se questa comunicazione ha generato un ticket, verrà eliminato anche il ticket collegato.",
      async () => {
        if (evento.linked_ticket_id && evento.condominio_id) {
          const condominio = condomini.find((c) => c.id === evento.condominio_id)

          if (condominio) {
            const ticketAggiornati = (condominio.ticket ?? []).filter(
              (ticket) => ticket.id !== evento.linked_ticket_id
            )

            const { error: ticketError } = await supabase
              .from("condomini")
              .update({ ticket: ticketAggiornati })
              .eq("id", condominio.id)

            if (ticketError) {
              showError(ticketError.message)
              return
            }

            setCondomini((prev) =>
              prev.map((c) =>
                c.id === condominio.id ? { ...c, ticket: ticketAggiornati } : c
              )
            )
          }
        }

        const { error } = await supabase
          .from("communication_events")
          .delete()
          .eq("id", evento.id)
          .eq("user_id", user.id)

        if (error) {
          showError(error.message)
          return
        }

        setCommunicationEvents((prev) =>
          prev.filter((item) => item.id !== evento.id)
        )
      }
    )
  }

  // ============================================================
  // RENDER: STATI PRE-AUTENTICAZIONE
  // Login, loader onboarding e pagina di configurazione iniziale.
  // ============================================================
  if (!user) {
    return <LoginPage form={loginForm} setForm={setLoginForm} />
  }

  if (caricamentoOnboarding) {
    return (
      <>
        <main className="onboarding-page">
          <section className="onboarding-card">
            <p className="eyebrow">Caricamento</p>
            <h1>Preparazione studio...</h1>
          </section>
        </main>
      </>
    )
  }

  if (!onboardingCompletato) {
    return (
      <>
        <OnboardingPage
          onComplete={completaOnboarding}
          onConnectGestionale={salvaCollegamentoGestionale}
        />
      </>
    )
  }

  // ============================================================
  // DATI DERIVATI: SCADENZE, TIMELINE, TICKET, DOCUMENTI
  // Liste calcolate dai condomini caricati, usate nelle pagine globali
  // e nella dashboard.
  // ============================================================
  const scadenzeGlobali: ScadenzaOperativa[] = condomini
    .flatMap((condominio) =>
      (condominio.impianti ?? []).flatMap((impianto) => {
        const scadenze: ScadenzaOperativa[] = []

        if (impianto.manutenzione) {
          const dataAvviso = calcolaDataAvviso(
            impianto.manutenzione,
            impianto.avviso_manutenzione
          )

          scadenze.push({
            id: `${condominio.id}-${impianto.id}-manutenzione`,
            condominio: nomeCondominio(condominio),
            impianto: impianto.tipo,
            descrizione: impianto.nome,
            tipo: "Manutenzione",
            data: impianto.manutenzione,
            avviso: impianto.avviso_manutenzione,
            data_avviso: dataAvviso,
            stato: getStatoScadenzaDaGiorniAvviso(
              impianto.manutenzione,
              impianto.avviso_manutenzione
            ),
          })
        }

        if (impianto.contratto_manutenzione) {
          const dataAvviso = calcolaDataAvviso(
            impianto.contratto_manutenzione,
            impianto.avviso_contratto_manutenzione
          )

          scadenze.push({
            id: `${condominio.id}-${impianto.id}-contratto`,
            condominio: nomeCondominio(condominio),
            impianto: impianto.tipo,
            descrizione: impianto.nome,
            tipo: "Contratto manutenzione",
            data: impianto.contratto_manutenzione,
            avviso: impianto.avviso_contratto_manutenzione,
            data_avviso: dataAvviso,
            stato: getStatoScadenzaDaGiorniAvviso(
              impianto.contratto_manutenzione,
              impianto.avviso_contratto_manutenzione
            ),
          })
        }

        return scadenze
      })
    )
    .sort(
      (a, b) =>
        giorniAllaScadenza(a.data_avviso || a.data) -
        giorniAllaScadenza(b.data_avviso || b.data)
    )

  const timelineGlobale = condomini
    .flatMap((condominio) =>
      (condominio.timeline ?? []).map((evento) => ({
        ...evento,
        condominio: nomeCondominio(condominio),
        indirizzo: condominio.indirizzo,
      }))
    )
    .filter((evento) => {
      const testo =
        `${evento.tipo} ${evento.titolo} ${evento.descrizione} ${evento.condominio} ${evento.indirizzo}`.toLowerCase()

      return testo.includes(ricercaTimeline.toLowerCase())
    })
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  const ticketGlobali = condomini
    .flatMap((condominio) =>
      (condominio.ticket ?? []).map((ticket) => ({
        ...ticket,
        condominio_id: condominio.id,
        condominio: nomeCondominio(condominio),
        indirizzo: condominio.indirizzo,
      }))
    )
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  const documentiGlobali = condomini
    .flatMap((condominio) =>
      (condominio.documenti ?? []).map((documento) => ({
        ...documento,
        condominio_id: condominio.id,
        condominio: nomeCondominio(condominio),
        indirizzo: condominio.indirizzo,
      }))
    )
    .sort(
      (a, b) =>
        new Date(b.data || "").getTime() - new Date(a.data || "").getTime()
    )

  

  const documentiFiltrati = documentiGlobali.filter((documento) => {
  const testo = `
    ${documento.titolo}
    ${documento.note}
    ${documento.categoria}
    ${documento.condominio}
    ${documento.indirizzo}
    ${documento.file_name}
    ${documento.ocr_text}
    ${documento.ai_summary}
    ${documento.ai_category}
    ${(documento.ai_extracted_dates ?? []).join(" ")}
    ${(documento.ai_extracted_amounts ?? []).join(" ")}
  `.toLowerCase()

  const matchRicerca = testo.includes(ricercaDocumenti.toLowerCase())

  const matchCategoria =
    categoriaDocumenti === "Tutte" || documento.categoria === categoriaDocumenti

  return matchRicerca && matchCategoria
})

  const condominiFiltrati = condomini.filter((condominio: Condominio) => {
    const testo =
      `${nomeCondominio(condominio)} ${condominio.indirizzo} ${condominio.comune}`.toLowerCase()

    return testo.includes(ricercaCondomini.toLowerCase())
  })

  const fornitoriFiltrati = fornitori.filter((fornitore) => {
    const condominio = condomini.find(
      (item) => item.id === fornitore.condominio_id
    )
    const testo = `
      ${fornitore.nome}
      ${fornitore.cognome}
      ${fornitore.partita_iva}
      ${fornitore.telefono}
      ${fornitore.iban}
      ${fornitore.mansione}
      ${nomeCondominio(condominio, "")}
    `.toLowerCase()

    return testo.includes(ricercaFornitori.toLowerCase())
  })

  const risultatiRicercaGlobale = ricercaGlobale.trim()
    ? [
        ...condomini.map((condominio) => ({
          id: `condominio-${condominio.id}`,
          tipo: "Condominio",
          titolo: nomeCondominio(condominio),
          descrizione: `${condominio.indirizzo} · ${condominio.comune}`,
        })),

        ...ticketGlobali.map((ticket) => ({
          id: `ticket-${ticket.condominio}-${ticket.id}`,
          tipo: "Ticket",
          titolo: ticket.titolo,
          descrizione: `${ticket.condominio} · ${ticket.stato} · ${ticket.priorita}`,
        })),

        ...documentiGlobali.map((documento) => ({
          id: `documento-${documento.condominio}-${documento.id}`,
          tipo: "Documento",
          titolo: documento.titolo,
          descrizione: `${documento.condominio} · ${documento.categoria}`,
        })),

        ...fornitori.map((fornitore) => ({
          id: `fornitore-${fornitore.id}`,
          tipo: "Fornitore",
          titolo: `${fornitore.nome} ${fornitore.cognome}`,
          descrizione: `${fornitore.mansione} · ${nomeCondominio(
            condomini.find((c) => c.id === fornitore.condominio_id),
            "Nessun condominio"
          )}`,
        })),

        ...timelineGlobale.map((evento) => ({
          id: `timeline-${evento.condominio}-${evento.id}`,
          tipo: evento.tipo,
          titolo: evento.titolo,
          descrizione: `${evento.condominio} · ${evento.descrizione}`,
        })),
      ].filter((risultato) => {
        const testo =
          `${risultato.tipo} ${risultato.titolo} ${risultato.descrizione}`.toLowerCase()

        return testo.includes(ricercaGlobale.toLowerCase())
      })
    : []

  // ============================================================
  // RENDER: DETTAGLIO CONDOMINIO
  // Vista operativa con impianti, documenti, timeline e ticket.
  // ============================================================
  if (selectedCondominio) {
    return renderSaasLayout(
      <section className="page-view">
        <button
          className="back-button"
          onClick={() => setSelectedCondominio(null)}
        >
          ← Torna ai condomìni
        </button>

        <p className="eyebrow">Condominio</p>
        <h1>{nomeCondominio(selectedCondominio)}</h1>

        <p className="subtitle">
          {selectedCondominio.indirizzo} – {selectedCondominio.comune}
        </p>

        <div className="detail-grid">
          <div className="detail-card impianti-card">
            <h2>Impianti</h2>
            <p>Gestione impianti del fabbricato</p>

            <div className="impianti-form">
              <label className="inline-field">
                <span>Tipo impianto</span>
                <select
                  value={nuovoImpianto.tipo}
                  onChange={(e) =>
                    setNuovoImpianto({
                      ...nuovoImpianto,
                      tipo: e.target.value,
                    })
                  }
                >
                  <option value="">Seleziona impianto</option>
                  {impiantiDisponibili.map((impianto) => (
                    <option key={impianto} value={impianto}>
                      {impianto}
                    </option>
                  ))}
                </select>
              </label>

              <label className="inline-field">
                <span>Nome o descrizione</span>
                <input
                  placeholder="Es. Ascensore scala A"
                  value={nuovoImpianto.nome}
                  onChange={(e) =>
                    setNuovoImpianto({
                      ...nuovoImpianto,
                      nome: e.target.value,
                    })
                  }
                />
              </label>

              <label className="inline-field">
                <span>Manutenzione periodica</span>
                <input
                  type="date"
                  value={nuovoImpianto.manutenzione}
                  onChange={(e) =>
                    setNuovoImpianto({
                      ...nuovoImpianto,
                      manutenzione: e.target.value,
                    })
                  }
                />
              </label>

              <label className="inline-field">
                <span>Avviso manutenzione (giorni)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="30"
                  value={nuovoImpianto.avviso_manutenzione}
                  onChange={(e) =>
                    setNuovoImpianto({
                      ...nuovoImpianto,
                      avviso_manutenzione: normalizzaGiorniAvviso(
                        e.target.value
                      ),
                    })
                  }
                />
              </label>

              <label className="inline-field">
                <span>Fine contratto</span>
                <input
                  type="date"
                  value={nuovoImpianto.contratto_manutenzione}
                  onChange={(e) =>
                    setNuovoImpianto({
                      ...nuovoImpianto,
                      contratto_manutenzione: e.target.value,
                    })
                  }
                />
              </label>

              <label className="inline-field">
                <span>Avviso contratto (giorni)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="30"
                  value={nuovoImpianto.avviso_contratto_manutenzione}
                  onChange={(e) =>
                    setNuovoImpianto({
                      ...nuovoImpianto,
                      avviso_contratto_manutenzione: normalizzaGiorniAvviso(
                        e.target.value
                      ),
                    })
                  }
                />
              </label>

              <button className="impianti-submit" onClick={aggiungiImpianto}>
                Aggiungi impianto
              </button>
            </div>

            <div className="impianti-list">
              {(selectedCondominio.impianti ?? []).map((impianto) => (
                <div
                  className={`impianto-row ${statoImpianto(impianto)}`}
                  key={impianto.id}
                >
                  {editingImpiantoId === impianto.id ? (
                    <>
                      <input
                        value={impianto.tipo}
                        onChange={(e) => {
                          const aggiornato = {
                            ...selectedCondominio,
                            impianti: (selectedCondominio.impianti ?? []).map(
                              (i) =>
                                i.id === impianto.id
                                  ? { ...i, tipo: e.target.value }
                                  : i
                            ),
                          }
                          setSelectedCondominio(aggiornato)
                        }}
                      />

                      <input
                        value={impianto.nome}
                        onChange={(e) => {
                          const aggiornato = {
                            ...selectedCondominio,
                            impianti: (selectedCondominio.impianti ?? []).map(
                              (i) =>
                                i.id === impianto.id
                                  ? { ...i, nome: e.target.value }
                                  : i
                            ),
                          }
                          setSelectedCondominio(aggiornato)
                        }}
                      />

                      <input
                        type="date"
                        value={impianto.manutenzione || ""}
                        onChange={(e) => {
                          const aggiornato = {
                            ...selectedCondominio,
                            impianti: (selectedCondominio.impianti ?? []).map(
                              (i) =>
                                i.id === impianto.id
                                  ? { ...i, manutenzione: e.target.value }
                                  : i
                            ),
                          }
                          setSelectedCondominio(aggiornato)
                        }}
                      />

                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={3}
                        placeholder="Giorni"
                        value={impianto.avviso_manutenzione || ""}
                        onChange={(e) => {
                          const aggiornato = {
                            ...selectedCondominio,
                            impianti: (selectedCondominio.impianti ?? []).map(
                              (i) =>
                                i.id === impianto.id
                                  ? {
                                      ...i,
                                      avviso_manutenzione:
                                        normalizzaGiorniAvviso(e.target.value),
                                    }
                                  : i
                            ),
                          }
                          setSelectedCondominio(aggiornato)
                        }}
                      />

                      <input
                        type="date"
                        value={impianto.contratto_manutenzione || ""}
                        onChange={(e) => {
                          const aggiornato = {
                            ...selectedCondominio,
                            impianti: (selectedCondominio.impianti ?? []).map(
                              (i) =>
                                i.id === impianto.id
                                  ? {
                                      ...i,
                                      contratto_manutenzione: e.target.value,
                                    }
                                  : i
                            ),
                          }
                          setSelectedCondominio(aggiornato)
                        }}
                      />

                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={3}
                        placeholder="Giorni"
                        value={impianto.avviso_contratto_manutenzione || ""}
                        onChange={(e) => {
                          const aggiornato = {
                            ...selectedCondominio,
                            impianti: (selectedCondominio.impianti ?? []).map(
                              (i) =>
                                i.id === impianto.id
                                  ? {
                                      ...i,
                                      avviso_contratto_manutenzione:
                                        normalizzaGiorniAvviso(e.target.value),
                                    }
                                  : i
                            ),
                          }
                          setSelectedCondominio(aggiornato)
                        }}
                      />

                      <button onClick={() => modificaImpianto(impianto)}>
                        Salva
                      </button>
                    </>
                  ) : (
                    <>
                      <strong>{impianto.tipo}</strong>
                      <span>{impianto.nome || "Nessuna descrizione"}</span>
                      <small>Manutenzione: {impianto.manutenzione || "—"}</small>
                      <small>
                        Avviso manutenzione:{" "}
                        {impianto.avviso_manutenzione
                          ? `${impianto.avviso_manutenzione} giorni prima`
                          : "—"}
                      </small>
                      <small>
                        Fine contratto: {impianto.contratto_manutenzione || "—"}
                      </small>
                      <small>
                        Avviso contratto:{" "}
                        {impianto.avviso_contratto_manutenzione
                          ? `${impianto.avviso_contratto_manutenzione} giorni prima`
                          : "—"}
                      </small>

                      <button
                        className="secondary small"
                        onClick={() => setEditingImpiantoId(impianto.id)}
                      >
                        Modifica
                      </button>

                      <button
                        className="danger-button small"
                        onClick={() => eliminaImpianto(impianto.id)}
                      >
                        Elimina
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="detail-card documenti-card">
            <h2>Documenti</h2>
            <p>Archivio digitale del condominio</p>

            <div className="documenti-form">
              <input
                placeholder="Titolo documento"
                value={nuovoDocumento.titolo}
                onChange={(e) =>
                  setNuovoDocumento({
                    ...nuovoDocumento,
                    titolo: e.target.value,
                  })
                }
              />

              <select
                value={nuovoDocumento.categoria}
                onChange={(e) =>
                  setNuovoDocumento({
                    ...nuovoDocumento,
                    categoria: e.target.value,
                  })
                }
              >
                <option value="Contratto">Contratto</option>
                <option value="Verbale">Verbale</option>
                <option value="Fattura">Fattura</option>
                <option value="Rapportino">Rapportino</option>
                <option value="Certificazione">Certificazione</option>
                <option value="Altro">Altro</option>
              </select>

              <input
                type="date"
                value={nuovoDocumento.data}
                onChange={(e) =>
                  setNuovoDocumento({ ...nuovoDocumento, data: e.target.value })
                }
              />

              <textarea
                placeholder="Note documento"
                value={nuovoDocumento.note}
                onChange={(e) =>
                  setNuovoDocumento({ ...nuovoDocumento, note: e.target.value })
                }
              />

              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => {
                  selezionaFileDocumento(e.target.files?.[0] ?? null)
                }}
              />

              <button onClick={aggiungiDocumento}>Aggiungi documento</button>
            </div>

            <div className="documenti-list">
              {(selectedCondominio.documenti ?? []).length === 0 ? (
                <div className="empty-state">
                  Nessun documento caricato per questo condominio.
                </div>
              ) : (
                (selectedCondominio.documenti ?? []).map((documento) => (
                  <div className="documento-row" key={documento.id}>
                    {editingDocumentoId === documento.id ? (
                      <>
                        <select
                          value={documento.categoria}
                          onChange={(e) => {
                            const aggiornato = {
                              ...selectedCondominio,
                              documenti: (
                                selectedCondominio.documenti ?? []
                              ).map((doc) =>
                                doc.id === documento.id
                                  ? { ...doc, categoria: e.target.value }
                                  : doc
                              ),
                            }

                            setSelectedCondominio(aggiornato)
                          }}
                        >
                          <option value="Contratto">Contratto</option>
                          <option value="Verbale">Verbale</option>
                          <option value="Fattura">Fattura</option>
                          <option value="Rapportino">Rapportino</option>
                          <option value="Certificazione">Certificazione</option>
                          <option value="Altro">Altro</option>
                        </select>

                        <div>
                          <input
                            value={documento.titolo}
                            onChange={(e) => {
                              const aggiornato = {
                                ...selectedCondominio,
                                documenti: (
                                  selectedCondominio.documenti ?? []
                                ).map((doc) =>
                                  doc.id === documento.id
                                    ? { ...doc, titolo: e.target.value }
                                    : doc
                                ),
                              }

                              setSelectedCondominio(aggiornato)
                            }}
                          />

                          <input
                            type="date"
                            value={documento.data}
                            onChange={(e) => {
                              const aggiornato = {
                                ...selectedCondominio,
                                documenti: (
                                  selectedCondominio.documenti ?? []
                                ).map((doc) =>
                                  doc.id === documento.id
                                    ? { ...doc, data: e.target.value }
                                    : doc
                                ),
                              }

                              setSelectedCondominio(aggiornato)
                            }}
                          />

                          <textarea
                            value={documento.note}
                            onChange={(e) => {
                              const aggiornato = {
                                ...selectedCondominio,
                                documenti: (
                                  selectedCondominio.documenti ?? []
                                ).map((doc) =>
                                  doc.id === documento.id
                                    ? { ...doc, note: e.target.value }
                                    : doc
                                ),
                              }

                              setSelectedCondominio(aggiornato)
                            }}
                          />

                          <button
                            className="secondary small"
                            onClick={() => modificaDocumento(documento)}
                          >
                            Salva
                          </button>

                          <button
                            className="danger-button small"
                            onClick={() => setEditingDocumentoId(null)}
                          >
                            Annulla
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span>{documento.categoria}</span>

                        <div>
                          <strong>{documento.titolo}</strong>
                          <p>{documento.note || "Nessuna nota"}</p>
                          <small>{documento.data || "Data non indicata"}</small>

                          <div className="document-actions">
                            {documento.file_path ? (
                              <>
                                <button
                                  className="secondary small"
                                  onClick={() =>
                                    apriDocumento(documento.file_path!)
                                  }
                                >
                                  Apri
                                </button>

                                <button
                                  className="secondary small"
                                  onClick={() =>
                                    scaricaDocumento(
                                      documento.file_path!,
                                      documento.file_name
                                    )
                                  }
                                >
                                  Scarica
                                </button>
                              </>
                            ) : null}

                            <button
                              className="secondary small"
                              onClick={() => setEditingDocumentoId(documento.id)}
                            >
                              Modifica
                            </button>

                            <button
                              className="danger-button small"
                              onClick={() => eliminaDocumento(documento)}
                            >
                              Elimina
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="detail-card timeline-card">
            <h2>Timeline comunicazioni</h2>
            <p>Storico operativo del condominio</p>

            <div className="timeline-form">
              <select
                value={nuovoEvento.tipo}
                onChange={(e) =>
                  setNuovoEvento({ ...nuovoEvento, tipo: e.target.value })
                }
              >
                <option value="Nota">Nota</option>
                <option value="Telefonata">Telefonata</option>
                <option value="Email">Email</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="PEC">PEC</option>
                <option value="Intervento">Intervento</option>
              </select>

              <input
                placeholder="Titolo evento"
                value={nuovoEvento.titolo}
                autoFocus
                onChange={(e) =>
                  setNuovoEvento({ ...nuovoEvento, titolo: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    aggiungiEventoTimeline()
                  }
                }}
              />

              <textarea
                placeholder="Descrizione comunicazione o attività"
                value={nuovoEvento.descrizione}
                onChange={(e) =>
                  setNuovoEvento({
                    ...nuovoEvento,
                    descrizione: e.target.value,
                  })
                }
              />

              <button onClick={aggiungiEventoTimeline}>
                Aggiungi alla timeline
              </button>
            </div>

            <div className="timeline-list">
              {[...(selectedCondominio.timeline ?? [])]
                .sort(
                  (a, b) =>
                    new Date(b.data).getTime() - new Date(a.data).getTime()
                )
                .map((evento) => (
                  <div
                    className={`timeline-row ${evento.tipo.toLowerCase()}`}
                    key={evento.id}
                  >
                    {editingEventoId === evento.id ? (
                      <>
                        <select
                          value={evento.tipo}
                          onChange={(e) => {
                            const aggiornato = {
                              ...selectedCondominio,
                              timeline: (selectedCondominio.timeline ?? []).map(
                                (ev) =>
                                  ev.id === evento.id
                                    ? { ...ev, tipo: e.target.value }
                                    : ev
                              ),
                            }
                            setSelectedCondominio(aggiornato)
                          }}
                        >
                          <option value="Nota">Nota</option>
                          <option value="Telefonata">Telefonata</option>
                          <option value="Email">Email</option>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="PEC">PEC</option>
                          <option value="Intervento">Intervento</option>
                        </select>

                        <div>
                          <input
                            value={evento.titolo}
                            onChange={(e) => {
                              const aggiornato = {
                                ...selectedCondominio,
                                timeline: (
                                  selectedCondominio.timeline ?? []
                                ).map((ev) =>
                                  ev.id === evento.id
                                    ? { ...ev, titolo: e.target.value }
                                    : ev
                                ),
                              }
                              setSelectedCondominio(aggiornato)
                            }}
                          />

                          <textarea
                            value={evento.descrizione}
                            onChange={(e) => {
                              const aggiornato = {
                                ...selectedCondominio,
                                timeline: (
                                  selectedCondominio.timeline ?? []
                                ).map((ev) =>
                                  ev.id === evento.id
                                    ? { ...ev, descrizione: e.target.value }
                                    : ev
                                ),
                              }
                              setSelectedCondominio(aggiornato)
                            }}
                          />

                          <button onClick={() => modificaEventoTimeline(evento)}>
                            Salva
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span>{evento.tipo}</span>

                        <div>
                          <strong>{evento.titolo}</strong>
                          <p>{evento.descrizione || "Nessuna descrizione"}</p>
                          <small>
                            {new Date(evento.data).toLocaleString("it-IT")}
                          </small>

                          <button
                            className="secondary small"
                            onClick={() => setEditingEventoId(evento.id)}
                          >
                            Modifica
                          </button>

                          <button
                            className="danger-button small"
                            onClick={() => eliminaEventoTimeline(evento.id)}
                          >
                            Elimina
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
            </div>
          </div>

          <div className="detail-card ticket-card">
            <h2>Ticket</h2>
            <p>Segnalazioni e interventi del condominio</p>

            <div className="ticket-form">
              <input
                placeholder="Titolo segnalazione"
                value={nuovoTicket.titolo}
                onChange={(e) =>
                  setNuovoTicket({ ...nuovoTicket, titolo: e.target.value })
                }
              />

              <textarea
                placeholder="Descrizione problema o intervento"
                value={nuovoTicket.descrizione}
                onChange={(e) =>
                  setNuovoTicket({
                    ...nuovoTicket,
                    descrizione: e.target.value,
                  })
                }
              />

              <select
                value={nuovoTicket.priorita}
                onChange={(e) =>
                  setNuovoTicket({ ...nuovoTicket, priorita: e.target.value })
                }
              >
                <option value="Bassa">Bassa</option>
                <option value="Media">Media</option>
                <option value="Alta">Alta</option>
              </select>

              <button onClick={aggiungiTicket}>Aggiungi ticket</button>
            </div>

            <div className="ticket-list">
              {(selectedCondominio.ticket ?? []).map((ticket) => (
                <div
                  className={`ticket-row ${ticket.stato
                    .toLowerCase()
                    .replace(" ", "-")}`}
                  key={ticket.id}
                >
                  {editingTicketId === ticket.id ? (
                    <>
                      <select
                        value={ticket.priorita}
                        onChange={(e) => {
                          const aggiornato = {
                            ...selectedCondominio,
                            ticket: (selectedCondominio.ticket ?? []).map((t) =>
                              t.id === ticket.id
                                ? {
                                    ...t,
                                    priorita: e.target.value as Ticket["priorita"],
                                  }
                                : t
                            ),
                          }

                          setSelectedCondominio(aggiornato)
                        }}
                      >
                        <option value="Bassa">Bassa</option>
                        <option value="Media">Media</option>
                        <option value="Alta">Alta</option>
                      </select>

                      <div>
                        <input
                          value={ticket.titolo}
                          onChange={(e) => {
                            const aggiornato = {
                              ...selectedCondominio,
                              ticket: (selectedCondominio.ticket ?? []).map(
                                (t) =>
                                  t.id === ticket.id
                                    ? { ...t, titolo: e.target.value }
                                    : t
                              ),
                            }

                            setSelectedCondominio(aggiornato)
                          }}
                        />

                        <textarea
                          value={ticket.descrizione}
                          onChange={(e) => {
                            const aggiornato = {
                              ...selectedCondominio,
                              ticket: (selectedCondominio.ticket ?? []).map(
                                (t) =>
                                  t.id === ticket.id
                                    ? { ...t, descrizione: e.target.value }
                                    : t
                              ),
                            }

                            setSelectedCondominio(aggiornato)
                          }}
                        />

                        <select
                          value={ticket.stato}
                          onChange={(e) => {
                            const aggiornato = {
                              ...selectedCondominio,
                              ticket: (selectedCondominio.ticket ?? []).map(
                                (t) =>
                                  t.id === ticket.id
                                    ? {
                                        ...t,
                                        stato: e.target.value as Ticket["stato"],
                                      }
                                    : t
                              ),
                            }

                            setSelectedCondominio(aggiornato)
                          }}
                        >
                          <option value="Aperto">Aperto</option>
                          <option value="In lavorazione">In lavorazione</option>
                          <option value="Chiuso">Chiuso</option>
                        </select>

                        <button
                          className="secondary small"
                          onClick={() => modificaTicket(ticket)}
                        >
                          Salva
                        </button>

                        <button
                          className="danger-button small"
                          onClick={() => setEditingTicketId(null)}
                        >
                          Annulla
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span>{ticket.priorita}</span>

                      <div>
                        <strong>{ticket.titolo}</strong>
                        <p>{ticket.descrizione || "Nessuna descrizione"}</p>
                        <small>
                          {ticket.stato} ·{" "}
                          {new Date(ticket.data).toLocaleString("it-IT")}
                        </small>

                        <div className="document-actions">
                          <button
                            className="secondary small"
                            onClick={() => setEditingTicketId(ticket.id)}
                          >
                            Modifica
                          </button>

                          <button
                            className="danger-button small"
                            onClick={() => eliminaTicket(ticket.id)}
                          >
                            Elimina
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    )
  }

  // ============================================================
  // RENDER: PAGINE GLOBALI
  // Ogni blocco sotto gestisce una sezione selezionabile dalla sidebar.
  // ============================================================
  if (page === "scadenze") {
    return renderSaasLayout(
      <section className="page-view">
        <p className="eyebrow">Modulo operativo</p>
        <h1>Scadenze</h1>
        <p className="subtitle">
          Vista globale delle scadenze impianti ordinate dalla più urgente.
        </p>

        <div className="scadenze-list">
          {scadenzeGlobali.length === 0 ? (
            <div className="empty-state">Nessuna scadenza presente.</div>
          ) : (
            scadenzeGlobali.map((scadenza) => (
              <div
                className={`scadenza-row ${scadenza.stato}`}
                key={scadenza.id}
              >
                <div>
                  <strong>{scadenza.impianto}</strong>
                  <span>{scadenza.descrizione || "Nessuna descrizione"}</span>
                </div>

                <div>
                  <strong>{scadenza.condominio}</strong>
                  <span>{scadenza.tipo}</span>
                </div>

                <div>
                  <strong>{scadenza.data}</strong>
                  <span>
                    Avviso:{" "}
                    {scadenza.avviso
                      ? `${scadenza.avviso} giorni prima`
                      : "Non impostato"}
                  </span>
                  {scadenza.data_avviso ? (
                    <span>Data avviso: {scadenza.data_avviso}</span>
                  ) : null}
                  <span>
                    {giorniAllaScadenza(scadenza.data_avviso || scadenza.data)} giorni
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    )
  }

  if (page === "timelineGlobale") {
    return renderSaasLayout(
      <section className="page-view">
        <p className="eyebrow">Memoria operativa</p>
        <h1>Timeline globale</h1>
        <p className="subtitle">
          Tutte le comunicazioni e attività operative ordinate dalla più recente.
        </p>

        <input
          className="search-input"
          placeholder="Cerca per condominio, comunicazione, tipo evento..."
          value={ricercaTimeline}
          onChange={(e) => setRicercaTimeline(e.target.value)}
        />

        <div className="timeline-list">
          {timelineGlobale.length === 0 ? (
            <div className="empty-state">
              Nessun evento presente nella timeline.
            </div>
          ) : (
            timelineGlobale.map((evento) => (
              <div
                className={`timeline-row ${evento.tipo.toLowerCase()}`}
                key={`${evento.condominio}-${evento.id}`}
              >
                <span>{evento.tipo}</span>

                <div>
                  <strong>{evento.titolo}</strong>
                  <p>{evento.descrizione || "Nessuna descrizione"}</p>
                  <small>
                    {evento.condominio} · {evento.indirizzo} ·{" "}
                    {new Date(evento.data).toLocaleString("it-IT")}
                  </small>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    )
  }

  if (page === "ticket") {
    return renderSaasLayout(
      <section className="page-view">
        <p className="eyebrow">Modulo operativo</p>
        <h1>Ticket</h1>
        <p className="subtitle">
          Vista globale di tutte le segnalazioni e interventi aperti nei condomìni.
        </p>

        <div className="ticket-list">
          {ticketGlobali.length === 0 ? (
            <div className="empty-state">Nessun ticket presente.</div>
          ) : (
            ticketGlobali.map((ticket) => {
              const ticketKey = ticketGlobaleKey(ticket)

              return (
              <div
                className={`ticket-row ${ticket.stato
                  .toLowerCase()
                  .replace(" ", "-")}`}
                key={ticketKey}
              >
                {editingGlobalTicketKey === ticketKey ? (
                  <>
                    <select
                      value={ticket.priorita}
                      onChange={(e) =>
                        aggiornaTicketGlobaleDraft(ticket, {
                          priorita: e.target.value as Ticket["priorita"],
                        })
                      }
                    >
                      <option value="Bassa">Bassa</option>
                      <option value="Media">Media</option>
                      <option value="Alta">Alta</option>
                    </select>

                    <div>
                      <input
                        value={ticket.titolo}
                        onChange={(e) =>
                          aggiornaTicketGlobaleDraft(ticket, {
                            titolo: e.target.value,
                          })
                        }
                      />

                      <textarea
                        value={ticket.descrizione}
                        onChange={(e) =>
                          aggiornaTicketGlobaleDraft(ticket, {
                            descrizione: e.target.value,
                          })
                        }
                      />

                      <select
                        value={ticket.stato}
                        onChange={(e) =>
                          aggiornaTicketGlobaleDraft(ticket, {
                            stato: e.target.value as Ticket["stato"],
                          })
                        }
                      >
                        <option value="Aperto">Aperto</option>
                        <option value="In lavorazione">In lavorazione</option>
                        <option value="Chiuso">Chiuso</option>
                      </select>

                      <div className="document-actions">
                        <button
                          className="secondary small"
                          onClick={() => modificaTicketGlobale(ticket)}
                        >
                          Salva
                        </button>

                        <button
                          className="danger-button small"
                          onClick={() => setEditingGlobalTicketKey(null)}
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <span>{ticket.priorita}</span>

                    <div>
                      <strong>{ticket.titolo}</strong>
                      <p>{ticket.descrizione || "Nessuna descrizione"}</p>
                      <small>
                        {ticket.stato} · {ticket.condominio} · {ticket.indirizzo} ·{" "}
                        {new Date(ticket.data).toLocaleString("it-IT")}
                      </small>

                      <div className="document-actions">
                        <button
                          className="secondary small"
                          onClick={() => setEditingGlobalTicketKey(ticketKey)}
                        >
                          Modifica
                        </button>

                        <button
                          className="danger-button small"
                          onClick={() => eliminaTicketGlobale(ticket)}
                        >
                          Elimina
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              )
            })
          )}
        </div>
      </section>
    )
  }

  if (page === "fornitori") {
    return renderSaasLayout(
      <section className="page-view fornitori-page">
        <div className="fornitori-hero">
          <div>
            <p className="eyebrow">Anagrafiche</p>
            <h1>Fornitori</h1>
            <p className="subtitle">
              Rubrica operativa dei fornitori dello studio, con mansione e
              condominio seguito.
            </p>
          </div>
        </div>

        <div className="dashboard-card fornitori-form-card">
          <span className="eyebrow">Nuovo fornitore</span>
          <div className="fornitori-form">
            <input
              placeholder="Nome"
              value={fornitoreForm.nome}
              onChange={(e) =>
                setFornitoreForm({ ...fornitoreForm, nome: e.target.value })
              }
            />

            <input
              placeholder="Cognome"
              value={fornitoreForm.cognome}
              onChange={(e) =>
                setFornitoreForm({ ...fornitoreForm, cognome: e.target.value })
              }
            />

            <input
              placeholder="Partita IVA es. 01234567890"
              inputMode="numeric"
              maxLength={11}
              pattern="[0-9]{0,11}"
              value={fornitoreForm.partita_iva}
              onChange={(e) =>
                setFornitoreForm({
                  ...fornitoreForm,
                  partita_iva: normalizzaPartitaIva(e.target.value),
                })
              }
            />

            <input
              placeholder="Telefono es. 3470000000"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              pattern="[0-9]{0,11}"
              value={fornitoreForm.telefono}
              onChange={(e) =>
                setFornitoreForm({
                  ...fornitoreForm,
                  telefono: normalizzaTelefonoItalia(e.target.value),
                })
              }
            />

            <input
              placeholder="IBAN es. IT60X0542811101000000123456"
              inputMode="text"
              maxLength={27}
              pattern="IT[0-9]{2}[A-Z][0-9]{10}[A-Z0-9]{12}"
              value={fornitoreForm.iban}
              onChange={(e) =>
                setFornitoreForm({
                  ...fornitoreForm,
                  iban: normalizzaIbanItalia(e.target.value),
                })
              }
            />

            <input
              placeholder="Mansione es. Idraulico"
              value={fornitoreForm.mansione}
              onChange={(e) =>
                setFornitoreForm({
                  ...fornitoreForm,
                  mansione: e.target.value,
                })
              }
            />

            <select
              value={fornitoreForm.condominio_id}
              onChange={(e) =>
                setFornitoreForm({
                  ...fornitoreForm,
                  condominio_id: e.target.value ? Number(e.target.value) : "",
                })
              }
            >
              <option value="">Condominio seguito</option>
              {condomini.map((condominio) => (
                <option key={condominio.id} value={condominio.id}>
                  {nomeCondominio(condominio)}
                </option>
              ))}
            </select>

            <button type="button" onClick={creaFornitore}>
              Salva fornitore
            </button>
          </div>
        </div>

        <input
          className="search-input"
          placeholder="Cerca fornitore per nome, mansione, partita IVA o condominio..."
          value={ricercaFornitori}
          onChange={(e) => setRicercaFornitori(e.target.value)}
        />

        <div className="fornitori-grid">
          {fornitoriFiltrati.length === 0 ? (
            <div className="empty-state">Nessun fornitore presente.</div>
          ) : (
            fornitoriFiltrati.map((fornitore) => {
              const condominio = condomini.find(
                (item) => item.id === fornitore.condominio_id
              )

              return (
                <div className="fornitore-card" key={fornitore.id}>
                  {editingFornitoreId === fornitore.id ? (
                    <>
                      <div className="fornitori-form">
                        <input
                          placeholder="Nome"
                          value={fornitore.nome}
                          onChange={(e) =>
                            setFornitori((prev) =>
                              prev.map((item) =>
                                item.id === fornitore.id
                                  ? { ...item, nome: e.target.value }
                                  : item
                              )
                            )
                          }
                        />

                        <input
                          placeholder="Cognome"
                          value={fornitore.cognome}
                          onChange={(e) =>
                            setFornitori((prev) =>
                              prev.map((item) =>
                                item.id === fornitore.id
                                  ? { ...item, cognome: e.target.value }
                                  : item
                              )
                            )
                          }
                        />

                        <input
                          placeholder="Partita IVA es. 01234567890"
                          inputMode="numeric"
                          maxLength={11}
                          pattern="[0-9]{0,11}"
                          value={fornitore.partita_iva}
                          onChange={(e) =>
                            setFornitori((prev) =>
                              prev.map((item) =>
                                item.id === fornitore.id
                                  ? {
                                      ...item,
                                      partita_iva: normalizzaPartitaIva(
                                        e.target.value
                                      ),
                                    }
                                  : item
                              )
                            )
                          }
                        />

                        <input
                          placeholder="Telefono es. 3470000000"
                          type="tel"
                          inputMode="numeric"
                          maxLength={11}
                          pattern="[0-9]{0,11}"
                          value={fornitore.telefono}
                          onChange={(e) =>
                            setFornitori((prev) =>
                              prev.map((item) =>
                                item.id === fornitore.id
                                  ? {
                                      ...item,
                                      telefono: normalizzaTelefonoItalia(
                                        e.target.value
                                      ),
                                    }
                                  : item
                              )
                            )
                          }
                        />

                        <input
                          placeholder="IBAN es. IT60X0542811101000000123456"
                          inputMode="text"
                          maxLength={27}
                          pattern="IT[0-9]{2}[A-Z][0-9]{10}[A-Z0-9]{12}"
                          value={fornitore.iban}
                          onChange={(e) =>
                            setFornitori((prev) =>
                              prev.map((item) =>
                                item.id === fornitore.id
                                  ? {
                                      ...item,
                                      iban: normalizzaIbanItalia(e.target.value),
                                    }
                                  : item
                              )
                            )
                          }
                        />

                        <input
                          placeholder="Mansione es. Idraulico"
                          value={fornitore.mansione}
                          onChange={(e) =>
                            setFornitori((prev) =>
                              prev.map((item) =>
                                item.id === fornitore.id
                                  ? { ...item, mansione: e.target.value }
                                  : item
                              )
                            )
                          }
                        />

                        <select
                          value={fornitore.condominio_id ?? ""}
                          onChange={(e) =>
                            setFornitori((prev) =>
                              prev.map((item) =>
                                item.id === fornitore.id
                                  ? {
                                      ...item,
                                      condominio_id: e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    }
                                  : item
                              )
                            )
                          }
                        >
                          <option value="">Nessun condominio</option>
                          {condomini.map((condominio) => (
                            <option key={condominio.id} value={condominio.id}>
                              {nomeCondominio(condominio)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="document-actions">
                        <button
                          className="secondary small"
                          type="button"
                          onClick={() => modificaFornitore(fornitore)}
                        >
                          Salva
                        </button>

                        <button
                          className="danger-button small"
                          type="button"
                          onClick={() => setEditingFornitoreId(null)}
                        >
                          Annulla
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="fornitore-card-header">
                        <div>
                          <span className="eyebrow">Fornitore</span>
                          <h2>
                            {fornitore.nome} {fornitore.cognome}
                          </h2>
                        </div>

                        <strong>{fornitore.mansione || "Mansione non indicata"}</strong>
                      </div>

                      <div className="fornitore-details">
                        <span>Partita IVA: {fornitore.partita_iva || "—"}</span>
                        <span>Telefono: {fornitore.telefono || "—"}</span>
                        <span>IBAN: {fornitore.iban || "—"}</span>
                        <span>
                          Condominio:{" "}
                          {nomeCondominio(condominio, "Non assegnato")}
                        </span>
                      </div>

                      <div className="document-actions">
                        <button
                          className="secondary small"
                          type="button"
                          onClick={() => setEditingFornitoreId(fornitore.id)}
                        >
                          Modifica
                        </button>

                        <button
                          className="danger-button small"
                          type="button"
                          onClick={() => eliminaFornitore(fornitore.id)}
                        >
                          Elimina
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </section>
    )
  }

  if (page === "documenti") {
    return renderSaasLayout(
      <section className="page-view documentale-page">
        <div className="documentale-hero">
          <div>
            <p className="eyebrow">Archivio studio</p>
            <h1>Documentale intelligente</h1>
            <p className="subtitle">
              Archivio centralizzato di contratti, verbali, fatture, certificazioni e file operativi.
            </p>
          </div>

          <button
            className="primary"
            onClick={() => setShowUploadDocumentoModal(true)}
          >
            + Carica documento
          </button>
        </div>

        <div className="documentale-stats">
          <div className="stat-card">
            <span>Documenti totali</span>
          <strong>{documentiFiltrati.length}</strong>          
          </div>
          <div className="stat-card">
            <span>Condomìni collegati</span>
            <strong>
              {new Set(documentiGlobali.map((doc) => doc.condominio)).size}
            </strong>
          </div>

          <div className="stat-card">
            <span>Archivio AI</span>
            <strong>Ready</strong>
          </div>
        </div>

        <div className="documentale-section-header">
          <div>
            <h2>Archivio documenti</h2>
            <p>Tutti i documenti caricati nei condomìni.</p>
          </div>
        </div>

        <div className="documentale-filters">
          <input
            className="search-input"
            placeholder="Cerca per titolo, condominio, categoria o note..."
            value={ricercaDocumenti}
            onChange={(e) => setRicercaDocumenti(e.target.value)}
          />

          <select
            value={categoriaDocumenti}
            onChange={(e) => setCategoriaDocumenti(e.target.value)}
          >
            <option value="Tutte">Tutte le categorie</option>
            <option value="Contratto">Contratti</option>
            <option value="Verbale">Verbali</option>
            <option value="Fattura">Fatture</option>
            <option value="Rapportino">Rapportini</option>
            <option value="Certificazione">Certificazioni</option>
            <option value="Altro">Altro</option>
          </select>
        </div>

        <div className="documenti-premium-grid">
          {documentiFiltrati.length === 0 ? (
            <div className="empty-state documentale-empty">
              <strong>Nessun documento presente.</strong>
              <p>Carica il primo documento per iniziare a costruire l’archivio intelligente dello studio.</p>
            </div>
          ) : (
            documentiFiltrati.map((documento) => (
              <div
                className="documento-premium-card"
                key={`${documento.condominio}-${documento.id}`}
              >
                <div className="documento-premium-header">
                  <span className="documento-badge">{documento.categoria}</span>
                  {documento.ocr_status ? (
                    <span className={`documento-ocr-badge ${documento.ocr_status}`}>
                      OCR {documento.ocr_status}
                    </span>
                  ) : null}
                  <span className="documento-file-type">
                    {documento.file_name?.split(".").pop()?.toUpperCase() || "FILE"}
                  </span>
                </div>

                <div className="documento-premium-body">
                  <strong>{documento.titolo}</strong>
                  <p>{documento.note || "Nessuna nota"}</p>

                  <small>
                    {documento.condominio} · {documento.indirizzo}
                  </small>

                  <small>
                    {documento.data || "Data non indicata"}
                  </small>

                  {documento.file_size ? (
                    <small className="documento-size">
                      {(documento.file_size / 1024 / 1024).toFixed(2)} MB
                    </small>
                  ) : null}
                  {documento.ai_summary ? (
                    <div className="documento-ai-summary">
                      <strong>AI Summary</strong>
                      <p>{documento.ai_summary}</p>
                    </div>
                  ) : null}
                  {documento.ocr_text ? (
                  <details className="documento-ocr-details">
                    <summary>Testo OCR rilevato</summary>
                    <p>{documento.ocr_text}</p>
                  </details>
                ) : null}
                </div>

                {documento.file_path ? (
                  <div className="document-actions">
                    <button
                      className="secondary small"
                      onClick={() => analizzaDocumentoMock(documento)}
                      disabled={documento.ocr_status === "processing"}
                    >
                      {documento.ocr_status === "processing" ? "Analisi..." : "Analizza AI"}
                    </button>
                    <button
                      className="secondary small"
                      onClick={() => apriPreviewDocumento(documento)}
                    >
                      Anteprima
                    </button>

                    <button
                      className="secondary small"
                      onClick={() => apriDocumento(documento.file_path!)}
                    >
                      Apri
                    </button>

                    <button
                      className="secondary small"
                      onClick={() =>
                        scaricaDocumento(documento.file_path!, documento.file_name)
                      }
                    >
                      Scarica
                    </button>
                  </div>
                ) : null}
              </div>
            )
          )
          )}
        </div>
      </section>
      
    )
  }

  if (page === "condomini") {
    return renderSaasLayout(
      <section className="page-view">
        <div className="condomini-header">
          <div>
            <p className="eyebrow">Modulo</p>
            <h1>Condomìni</h1>
            <p className="subtitle">
              Gestione completa dei fabbricati amministrati.
            </p>
          </div>

          <button onClick={() => setShowModal(true)}>+ Nuovo condominio</button>

          <label className="import-excel-button">
            Importa Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]

                if (file) {
                  await preparaAnteprimaImportCondomini(file)
                  e.target.value = ""
                }
              }}
            />
          </label>

          {anteprimaImport.length > 0 && (
            <div className="premium-import-card">
              <h3>Anteprima importazione</h3>

              <p>
                Condomini validi trovati: <strong>{anteprimaImport.length}</strong>
              </p>

              <div className="premium-import-table">
                {anteprimaImport.map((condominio, index) => (
                  <div
                    key={index}
                    className="premium-import-row premium-import-row-wide"
                  >
                    <span>{condominio.tipo || "Condominio"}</span>
                    <span>{condominio.nome_condominio}</span>
                    <span>{condominio.cod_fiscale || "—"}</span>
                    <span>{condominio.indirizzo}</span>
                    <span>{condominio.cap || "—"}</span>
                    <span>{condominio.comune}</span>
                    <span>{condominio.provincia || "—"}</span>
                    <span>{condominio.dati_catastali || "—"}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="premium-save-button"
                onClick={confermaImportCondomini}
                disabled={importInCorso}
              >
                {importInCorso
                  ? "Importazione in corso..."
                  : "Conferma importazione"}
              </button>
            </div>
          )}
        </div>

        <input
          className="search-input"
          placeholder="Cerca condominio per nome, indirizzo o comune..."
          value={ricercaCondomini}
          onChange={(e) => setRicercaCondomini(e.target.value)}
        />

        <div className="condomini-list">
          {condominiFiltrati.map((condominio) => (
            <div
              className="condominio-card"
              key={condominio.id}
              onClick={() => {
                if (editingCondominioId !== condominio.id) {
                  setSelectedCondominio(condominio)
                }
              }}
            >
              {editingCondominioId === condominio.id ? (
                <>
                  <input
                    value={nomeCondominio(condominio)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setCondomini((prev) =>
                        prev.map((c) =>
                          c.id === condominio.id
                            ? {
                                ...c,
                                nome: e.target.value,
                                nome_condominio: e.target.value,
                              }
                            : c
                        )
                      )
                    }
                  />

                  <input
                    value={condominio.indirizzo}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setCondomini((prev) =>
                        prev.map((c) =>
                          c.id === condominio.id
                            ? { ...c, indirizzo: e.target.value }
                            : c
                        )
                      )
                    }
                  />

                  <input
                    value={condominio.comune}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setCondomini((prev) =>
                        prev.map((c) =>
                          c.id === condominio.id
                            ? { ...c, comune: e.target.value }
                            : c
                        )
                      )
                    }
                  />

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      modificaCondominio(condominio)
                    }}
                  >
                    Salva
                  </button>
                </>
              ) : (
                <>
                  <h2>{nomeCondominio(condominio)}</h2>
                  <p>{condominio.indirizzo}</p>
                  <p>{condominio.comune}</p>

                  <button
                    className="secondary small"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingCondominioId(condominio.id)
                    }}
                  >
                    Modifica
                  </button>

                  <button
                    className="danger-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      eliminaCondominio(condominio.id)
                    }}
                  >
                    Elimina
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {showImportReport && (
          <div className="premium-modal">
            <div className="premium-import-report">
              <div className="modal-header">
                <h2>Report importazione</h2>

                <button
                  className="icon-button"
                  onClick={() => setShowImportReport(false)}
                >
                  ×
                </button>
              </div>

              {duplicatiImport.length > 0 && (
                <div className="report-section warning">
                  <h3>Duplicati rilevati</h3>

                  {duplicatiImport.map((duplicato, index) => (
                    <div key={index} className="report-row">
                      Riga {duplicato.riga}: {duplicato.nome_condominio} —{" "}
                      {duplicato.motivo}
                    </div>
                  ))}
                </div>
              )}

              {erroriImport.length > 0 && (
                <div className="report-section danger">
                  <h3>Righe escluse</h3>

                  {erroriImport.map((errore, index) => (
                    <div key={index} className="report-row">
                      Riga {errore.riga}: {errore.motivo}
                    </div>
                  ))}
                </div>
              )}

              <button
                className="premium-save-button"
                onClick={() => setShowImportReport(false)}
              >
                Ho capito
              </button>
            </div>
          </div>
        )}

        {showModal && (
          <div className="premium-modal">
            <div className="premium-modal-card">
              <div className="modal-header">
                <h2>Nuovo condominio</h2>

                <button
                  className="icon-button"
                  onClick={() => setShowModal(false)}
                >
                  ×
                </button>
              </div>

              <div className="premium-form-grid">
                <label>
                  Tipo
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  >
                    <option value="Condominio">Condominio</option>
                    <option value="Supercondominio">Supercondominio</option>
                    <option value="Residence">Residence</option>
                    <option value="Centro commerciale">Centro commerciale</option>
                  </select>
                </label>

                <label>
                  Nome condominio
                  <input
                    value={form.nome_condominio}
                    onChange={(e) =>
                      setForm({ ...form, nome_condominio: e.target.value })
                    }
                    placeholder="Es. Condominio Via Roma 12"
                  />
                </label>

                <label>
                  Codice fiscale
                  <input
                    value={form.cod_fiscale}
                    onChange={(e) =>
                      setForm({ ...form, cod_fiscale: e.target.value })
                    }
                    placeholder="Es. 01234567890"
                  />
                </label>

                <label>
                  Indirizzo
                  <input
                    value={form.indirizzo}
                    onChange={(e) =>
                      setForm({ ...form, indirizzo: e.target.value })
                    }
                    placeholder="Es. Via Roma 12"
                  />
                </label>

                <label>
                  CAP
                  <input
                    value={form.cap}
                    onChange={(e) => setForm({ ...form, cap: e.target.value })}
                    placeholder="Es. 40100"
                  />
                </label>

                <label>
                  Comune
                  <input
                    value={form.comune}
                    onChange={(e) =>
                      setForm({ ...form, comune: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        creaCondominio()
                      }
                    }}
                    placeholder="Es. Bologna"
                  />
                </label>

                <label>
                  Provincia
                  <input
                    value={form.provincia}
                    onChange={(e) =>
                      setForm({ ...form, provincia: e.target.value })
                    }
                    placeholder="Es. BO"
                  />
                </label>

                <label>
                  Dati catastali
                  <textarea
                    value={form.dati_catastali}
                    onChange={(e) =>
                      setForm({ ...form, dati_catastali: e.target.value })
                    }
                    placeholder="Foglio, particella, subalterno..."
                  />
                </label>

                <label>
                  Email notifiche
                  <input
                    type="email"
                    value={form.email_notifiche}
                    onChange={(e) =>
                      setForm({ ...form, email_notifiche: e.target.value })
                    }
                    placeholder="Es. studio@email.it"
                  />
                </label>
              </div>

              <button className="premium-save-button" onClick={creaCondominio}>
                Salva condominio
              </button>
            </div>
          </div>
        )}
      </section>
    )
  }

  if (page === "comunicazioni") {
    return renderSaasLayout(
      <section className="page-view">
        <p className="eyebrow">Connessioni</p>
        <h1>Comunicazioni</h1>

        <div className="dashboard-card">
          <div>
            <span className="eyebrow">Communication Engine</span>
            <h2>Timeline comunicazioni</h2>
            <p>Motore centrale per email, PEC, WhatsApp e comunicazioni AI.</p>
            <p>Eventi salvati: {communicationEvents.length}</p>
          </div>

          <div className="communication-timeline">
            {communicationEvents.length === 0 ? (
              <div className="empty-state">
                Nessuna comunicazione registrata.
              </div>
            ) : (
              communicationEvents.slice(0, 8).map((evento) => (
                <div className="communication-row" key={evento.id}>
                  {editingCommunicationId === evento.id ? (
                    <>
                      <select
                        value={evento.channel}
                        onChange={(e) =>
                          setCommunicationEvents((prev) =>
                            prev.map((item) =>
                              item.id === evento.id
                                ? { ...item, channel: e.target.value }
                                : item
                            )
                          )
                        }
                      >
                        <option value="email">Email</option>
                        <option value="pec">PEC</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="phone">Telefono</option>
                      </select>

                      <div>
                        <input
                          value={evento.sender || ""}
                          onChange={(e) =>
                            setCommunicationEvents((prev) =>
                              prev.map((item) =>
                                item.id === evento.id
                                  ? { ...item, sender: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Mittente"
                        />

                        <input
                          value={evento.subject || ""}
                          onChange={(e) =>
                            setCommunicationEvents((prev) =>
                              prev.map((item) =>
                                item.id === evento.id
                                  ? { ...item, subject: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Oggetto"
                        />

                        <textarea
                          value={evento.body || ""}
                          onChange={(e) =>
                            setCommunicationEvents((prev) =>
                              prev.map((item) =>
                                item.id === evento.id
                                  ? { ...item, body: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Contenuto comunicazione"
                        />

                        <select
                          value={evento.priority || "media"}
                          onChange={(e) =>
                            setCommunicationEvents((prev) =>
                              prev.map((item) =>
                                item.id === evento.id
                                  ? { ...item, priority: e.target.value }
                                  : item
                              )
                            )
                          }
                        >
                          <option value="bassa">Bassa</option>
                          <option value="media">Media</option>
                          <option value="alta">Alta</option>
                        </select>

                        <div className="communication-actions">
                          <button
                            className="secondary small"
                            onClick={() => modificaCommunicationEvent(evento)}
                          >
                            Salva
                          </button>

                          <button
                            className="danger-button small"
                            onClick={() => setEditingCommunicationId(null)}
                          >
                            Annulla
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="communication-top-row">
                        <span className={`communication-channel ${evento.channel}`}>
                          {evento.channel === "email" && "EMAIL"}
                          {evento.channel === "pec" && "PEC"}
                          {evento.channel === "whatsapp" && "WHATSAPP"}
                          {evento.channel === "phone" && "TELEFONO"}
                        </span>

                        <span
                          className={`communication-priority ${
                            evento.priority || "media"
                          }`}
                        >
                          {evento.priority === "alta" && "Alta priorità"}
                          {evento.priority === "media" && "Media priorità"}
                          {evento.priority === "bassa" && "Bassa priorità"}
                        </span>
                      </div>

                      <div>
                        <h3 className="communication-title">
                          {evento.subject || "Senza oggetto"}
                        </h3>

                        {(evento.status === "ticket_created" ||
                          evento.linked_ticket_id) && (
                          <span className="communication-managed-badge">
                            Ticket creato
                          </span>
                        )}

                        <p className="communication-body">
                          {evento.body || "Nessun contenuto disponibile."}
                        </p>

                        <small>
                          {evento.sender || "Mittente sconosciuto"} ·{" "}
                          {nomeCondominio(
                            condomini.find((c) => c.id === evento.condominio_id),
                            "Nessun condominio associato"
                          )}{" "}
                          · {new Date(evento.created_at).toLocaleString("it-IT")}
                        </small>

                        <div className="communication-actions">
                          {evento.status !== "ticket_created" &&
                            !evento.linked_ticket_id && (
                              <button
                                className="secondary small"
                                onClick={() =>
                                  creaTicketDaCommunicationEvent(evento)
                                }
                              >
                                Crea ticket
                              </button>
                            )}

                          <button
                            className="secondary small"
                            onClick={() => setEditingCommunicationId(evento.id)}
                          >
                            Modifica
                          </button>

                          <button
                            className="danger-button small"
                            onClick={() => eliminaCommunicationEvent(evento)}
                          >
                            Elimina
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <button
            className="premium-save-button"
            onClick={creaCommunicationEventTest}
          >
            Genera evento test
          </button>
        </div>
      </section>
    )
  }

    if (page === "impostazioni") {
    return renderSaasLayout(
      <section className="page-view">
        <div className="settings-hero">
          <div>
            <p className="eyebrow">Control Center</p>

            <h1>Impostazioni studio</h1>

            <p className="subtitle">
              Configura il gestionale, le integrazioni operative,
              il tema dell’interfaccia e i moduli premium.
            </p>
          </div>

          <div className="settings-status-badge">
            Sistema operativo attivo
          </div>
        </div>

        <div className="settings-grid">
          <div className="dashboard-card settings-card">
            <span className="eyebrow">Aspetto</span>
            <h2>Tema interfaccia</h2>
            <p>Scegli la modalità visiva del gestionale.</p>

            <div className="settings-actions">
              <button
                className={`secondary small ${temaInterfaccia === "dark" ? "active-setting" : ""}`}
                onClick={() => setTemaInterfaccia("dark")}
              >
                Tema scuro
              </button>

              <button
                className={`secondary small ${temaInterfaccia === "light" ? "active-setting" : ""}`}
                onClick={() => setTemaInterfaccia("light")}
              >
                Tema chiaro
              </button>
            </div>

            <small className="settings-note">
              Il tema chiaro usa contrasto alto, accenti arancio e hover
              dedicati.
            </small>
          </div>

          <div className="dashboard-card settings-card">
            <span className="eyebrow">Integrazioni</span>
            <h2>Gestionale principale</h2>

            <p>
              {gestionaleAttivo
                ? `Gestionale collegato: ${
                    gestionaleAttivo.provider === "danea"
                      ? "Danea Domustudio"
                      : gestionaleAttivo.provider.toUpperCase()
                  }`
                : "Nessun gestionale collegato."}
            </p>

            <p>
              Ultima sincronizzazione:{" "}
              {gestionaleAttivo?.last_sync_at
                ? new Date(gestionaleAttivo.last_sync_at).toLocaleString("it-IT")
                : "Mai eseguita"}
            </p>

            <div className="settings-actions">
              <button
                className="premium-save-button"
                onClick={() => {
                  setGestionaleSelezionato("danea")
                  setApiKeyGestionale("")
                  setShowGestionaleModal(true)
                }}
              >
                {gestionaleAttivo ? "Modifica Danea" : "Collega Danea"}
              </button>

              {gestionaleAttivo && (
                <button
                  className="secondary"
                  onClick={sincronizzaGestionaleAttivo}
                >
                  Sincronizza ora
                </button>
              )}

              {gestionaleAttivo && (
                <button className="danger-button" onClick={scollegaGestionale}>
                  Scollega
                </button>
              )}
            </div>
          </div>

          <div className="dashboard-card settings-card">
            <span className="eyebrow">Abbonamento</span>
            <h2>Piano attuale</h2>
            <p>
              Piano Free / Demo attivo. In futuro qui verranno gestiti upgrade,
              limiti, fatturazione e moduli premium.
            </p>

            <div className="subscription-plan-card">
              <div>
                <strong>Studio Base</strong>
                <span>Funzioni MVP abilitate</span>
              </div>

              <div className="subscription-badge">
                ATTIVO
              </div>
            </div>

            <div className="settings-actions">
              <button className="premium-save-button">
                Gestisci abbonamento
              </button>

              <button className="secondary">
                Vedi piani
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (page !== "home") {
    return renderSaasLayout(
      <section className="page-view">
        <p className="eyebrow">Modulo</p>
        <h1>{modules.find((module) => module.page === page)?.title}</h1>
        <p className="subtitle">
          Questa sarà la sezione operativa dedicata a{" "}
          {modules.find((module) => module.page === page)?.title}.
        </p>
      </section>
    )
  }

  // ============================================================
  // RENDER: DASHBOARD
  // Pagina iniziale con KPI, ricerca globale e notifiche operative.
  // ============================================================
  return renderSaasLayout(
    <Dashboard
      setPage={(nuovaPagina) => {
        setSelectedCondominio(null)
        setPage(nuovaPagina)
      }}
      ticketAperti={ticketGlobali.filter((t) => t.stato !== "Chiuso").length}
      urgenze={
        scadenzeGlobali.filter(
          (s) => s.stato === "rosso" || s.stato === "arancione"
        ).length
      }
      scadenzeTotali={scadenzeGlobali.length}
      scadenzeGlobali={scadenzeGlobali}
      ricercaGlobale={ricercaGlobale}
      setRicercaGlobale={setRicercaGlobale}
      risultatiRicercaGlobale={risultatiRicercaGlobale}
    />
  )
}

export default App
