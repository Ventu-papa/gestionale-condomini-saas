import { useState, useEffect } from "react"
import type { ReactNode } from "react"
import { supabase } from "./supabase"
import "./App.css"
import type { Page, Condominio, Impianto, TimelineEvent, Documento, Ticket } from "./types"
import { getStatoScadenza, giorniAllaScadenza } from "./utils/scadenze"
import { modules, impiantiDisponibili } from "./data/constants"
import LoginPage from "./components/LoginPage"
import Dashboard from "./components/Dashboard"
import Sidebar from "./components/sidebar"

import * as XLSX from "xlsx"
import OnboardingPage from "./components/onboarding-page"

function App() {
 
  // ===============================
  // STATI PRINCIPALI APP
  // ===============================
  const [user, setUser] = useState<any>(null)
  const [ricercaTimeline, setRicercaTimeline] = useState("")
  const [ricercaCondomini, setRicercaCondomini] = useState("")
  const [showImportReport, setShowImportReport] = useState(false)
  // Ricerca globale usata nella dashboard
  const [ricercaGlobale, setRicercaGlobale] = useState("")
  const [page, setPage] = useState<Page>("home")
  const [showGestionaleModal, setShowGestionaleModal] = useState(false)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [gestionaleSelezionato, setGestionaleSelezionato] = useState("")
  const [apiKeyGestionale, setApiKeyGestionale] = useState("")
  const [anteprimaImport, setAnteprimaImport] = useState<any[]>([])
  const [erroriImport, setErroriImport] = useState<any[]>([])
  const [importInCorso, setImportInCorso] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingCondominioId, setEditingCondominioId] = useState<number | null>(null)
  const [editingImpiantoId, setEditingImpiantoId] = useState<number | null>(null)
  const [editingEventoId, setEditingEventoId] = useState<number | null>(null)
  // Stato che indica quale documento è in modifica
  const [editingDocumentoId, setEditingDocumentoId] = useState<number | null>(null) 
  // Stato che indica quale ticket è in modifica
  const [editingTicketId, setEditingTicketId] = useState<number | null>(null)
  const [selectedCondominio, setSelectedCondominio] = useState<Condominio | null>(null)
  const [onboardingCompletato, setOnboardingCompletato] = useState(false)
  const [caricamentoOnboarding, setCaricamentoOnboarding] = useState(true)
  const [duplicatiImport, setDuplicatiImport] = useState<any[]>([])
  const [nuovoImpianto, setNuovoImpianto] = useState({
    tipo: "",
    nome: "",
    manutenzione: "",
    contratto_manutenzione: "",
  })
  const [nuovoEvento, setNuovoEvento] = useState({
    tipo: "Nota",
    titolo: "",
    descrizione: "",
  })
  // Stato del nuovo ticket da creare
  const [nuovoTicket, setNuovoTicket] = useState({
    titolo: "",
    descrizione: "",
    stato: "Aperto",
    priorita: "Media",
  })
  const [fileDocumento, setFileDocumento] = useState<File | null>(null)
  const [nuovoDocumento, setNuovoDocumento] = useState({
    titolo: "",
    categoria: "Contratto",
    data: "",
    note: "",
  })
  // Lista condomìni caricata da Supabase.
  // Deve partire vuota per evitare che utenti diversi vedano dati finti o dati di altri.
  const [condomini, setCondomini] = useState<Condominio[]>([])

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

  // ===============================
  // LOGIN E CONTROLLO UTENTE
  // ===============================

  useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    setUser(data.user)
  })

  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null)
  })

  return () => {
    listener.subscription.unsubscribe()
  }
}, [])

useEffect(() => {
  setAnteprimaImport([])
  setErroriImport([])
  setDuplicatiImport([])
}, [user?.id])

// ===============================
// CARICAMENTO CONFIGURAZIONE STUDIO
// ===============================

// Controlla se l'utente ha già completato l'onboarding iniziale
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
      alert(error.message)
      setCaricamentoOnboarding(false)
      return
    }

    setOnboardingCompletato(data?.onboarding_completed ?? false)
    setCaricamentoOnboarding(false)
  }

  caricaStudioSettings()
}, [user])

// ===============================
// DANEA: TEST SINCRONIZZAZIONE
// ===============================

async function sincronizzaDanea() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      alert("Sessione non valida")
      return
    }

    const response = await fetch(
      "https://weqgdvmcoxftsjdhjgbc.supabase.co/functions/v1/sync-danea",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      }
    )

    const text = await response.text()

    if (!response.ok) {
      alert(`Errore funzione: ${response.status} - ${text}`)
      return
    }

    try {
      const data = JSON.parse(text)
      alert(data?.message ?? "Risposta ricevuta dalla funzione")
    } catch {
      alert(text || "Risposta ricevuta dalla funzione")
    }
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Errore sconosciuto durante la sincronizzazione"
    )
  }
}

// ===============================
// DANEA: COLLEGAMENTO GESTIONALE
// ===============================

// Salva API key Danea e abilita integrazione
//async function collegaDanea(apiKey: string) {
//  if (!user || !apiKey) return

//  const { error } = await supabase
//    .from("studio_settings")
//     .upsert({
//      user_id: user.id,
//      danea_enabled: true,
//      danea_api_key: apiKey,
//      onboarding_completed: true,
//    })

//  if (error) {
//    alert(error.message)
//    return
//  }

//  setOnboardingCompletato(true)
//}

// ===============================
// ONBOARDING: COMPLETAMENTO
// ===============================

// Salva su Supabase che l'utente ha completato la configurazione iniziale
async function completaOnboarding() {
  if (!user) return

  const { error } = await supabase
    .from("studio_settings")
    .upsert({
      user_id: user.id,
      onboarding_completed: true,
    })

  if (error) {
    alert(error.message)
    return
  }

  setOnboardingCompletato(true)
}

// ===============================
// LAYOUT SAAS GLOBALE
// ===============================

// Avvolge ogni pagina autenticata con sidebar + contenuto principale
function renderSaasLayout(contenuto: ReactNode) {
  return (
    <main className="app-shell saas-layout">
      <button
        className="mobile-menu-button"
        onClick={() => setSidebarMobileOpen(true)}
      >
        ☰
      </button>
      <Sidebar
        page={page}
        setPage={(nuovaPagina) => {
          setPage(nuovaPagina)
          setSidebarMobileOpen(false)
        }}
        userEmail={user?.email}
        mobileOpen={sidebarMobileOpen}
        onCloseMobile={() => setSidebarMobileOpen(false)}
        onLogout={async () => {
          await supabase.auth.signOut()
          setUser(null)
          setCondomini([])
          setSelectedCondominio(null)
          setPage("home")
        }}
      />

      <section className="saas-content">
        {contenuto}
      </section>

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
                <p>Import e sincronizzazione automatica</p>
              </div>

              <div
                className={`gestionale-card ${
                  gestionaleSelezionato === "teamsystem" ? "active" : ""
                }`}
                onClick={() => setGestionaleSelezionato("teamsystem")}
              >
                <strong>TeamSystem</strong>
                <p>Gestione professionale enterprise</p>
              </div>

              <div
                className={`gestionale-card ${
                  gestionaleSelezionato === "zucchetti" ? "active" : ""
                }`}
                onClick={() => setGestionaleSelezionato("zucchetti")}
              >
                <strong>Zucchetti</strong>
                <p>Sincronizzazione studi strutturati</p>
              </div>
            </div>

            {gestionaleSelezionato && (
              <div className="gestionale-config-section">
                <h3>Configurazione</h3>

                <input
                  className="onboarding-input"
                  placeholder="Inserisci API Key"
                  value={apiKeyGestionale}
                  onChange={(e) => setApiKeyGestionale(e.target.value)}
                />

                <button
                  className="premium-save-button"
                  onClick={async () => {
                    await salvaCollegamentoGestionale(
                      gestionaleSelezionato,
                      apiKeyGestionale
                    )

                    setShowGestionaleModal(false)
                  }}
                >
                  Collega gestionale
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
  
  // ===============================
  // CARICAMENTO CONDOMINI DA SUPABASE
  // ===============================

// ===============================
// CARICAMENTO CONDOMINI UTENTE
// ===============================

  // Carica solo i condomìni dell'utente loggato.
  // Quando cambia utente, svuota prima i dati vecchi.
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
          alert(error.message)
          return
        }

        setCondomini(data ?? [])
        setSelectedCondominio(null)
      }

      caricaCondominiUtente()
    }, [user])

  // ===============================
  // TIMELINE: AGGIUNTA / MODIFICA / ELIMINA EVENTI
  // ===============================
  
  async function eliminaEventoTimeline(idEvento: number) {
  if (!selectedCondominio) return

  const timelineAggiornata = (selectedCondominio.timeline ?? []).filter(
    (evento) => evento.id !== idEvento
  )

  const { error } = await supabase
    .from("condomini")
    .update({ timeline: timelineAggiornata })
    .eq("id", selectedCondominio.id)

  if (error) {
    alert(error.message)
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

async function apriDocumento(filePath: string) {
  const { data, error } = await supabase.storage
    .from("documenti")
    .createSignedUrl(filePath, 60)

  if (error || !data?.signedUrl) {
    alert("Errore apertura documento")
    return
  }

  window.open(data.signedUrl, "_blank")
}

async function scaricaDocumento(filePath: string, nomeFile?: string) {
  const { data, error } = await supabase.storage
    .from("documenti")
    .download(filePath)

  if (error || !data) {
    alert("Errore download documento")
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

// ===============================
// DOCUMENTI: ELIMINAZIONE FILE
// ===============================

// Elimina documento da storage + database
async function eliminaDocumento(documento: Documento) {

  // Controllo sicurezza
  if (!selectedCondominio) return

  // Conferma utente
  const conferma = confirm("Vuoi eliminare questo documento?")
  if (!conferma) return

  // Se il documento ha un file salvato nello storage
  // lo eliminiamo da Supabase Storage
  if (documento.file_path) {

    const { error: storageError } = await supabase.storage
      .from("documenti")
      .remove([documento.file_path])

    // Gestione errore storage
    if (storageError) {
      alert(storageError.message)
      return
    }
  }

  // Rimuove documento dalla lista locale
  const documentiAggiornati =
    (selectedCondominio.documenti ?? []).filter(
      (doc) => doc.id !== documento.id
    )

  // Aggiorna il condominio nel database
  const { error } = await supabase
    .from("condomini")
    .update({
      documenti: documentiAggiornati,
    })
    .eq("id", selectedCondominio.id)

  // Gestione errore database
  if (error) {
    alert(error.message)
    return
  }

  // Aggiorna stato locale frontend
  const aggiornato = {
    ...selectedCondominio,
    documenti: documentiAggiornati,
  }

  setSelectedCondominio(aggiornato)

  // Aggiorna lista condomini globale
  setCondomini((prev) =>
    prev.map((c) =>
      c.id === aggiornato.id ? aggiornato : c
    )
  )
}

// ===============================
// DOCUMENTI: AGGIUNTA + UPLOAD FILE
// ===============================

async function aggiungiDocumento() {
  if (!selectedCondominio || !nuovoDocumento.titolo) return

  let filePath = ""
  let fileName = ""

  if (fileDocumento) {
    fileName = fileDocumento.name
    filePath = `${selectedCondominio.id}/${Date.now()}-${fileDocumento.name}`

    const { error: uploadError } = await supabase.storage
      .from("documenti")
      .upload(filePath, fileDocumento)

    if (uploadError) {
      alert(uploadError.message)
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
    },
    ...documentiAttuali,
  ]

  const { error } = await supabase
    .from("condomini")
    .update({ documenti: documentiAggiornati })
    .eq("id", selectedCondominio.id)

  if (error) {
    alert(error.message)
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

// ===============================
// DOCUMENTI: MODIFICA DATI DOCUMENTO
// ===============================

// Modifica titolo, categoria, data e note di un documento
async function modificaDocumento(documentoAggiornato: Documento) {
  // Controllo sicurezza: serve un condominio selezionato
  if (!selectedCondominio) return

  // Crea una nuova lista documenti sostituendo solo quello modificato
  const documentiAggiornati = (selectedCondominio.documenti ?? []).map(
    (documento) =>
      documento.id === documentoAggiornato.id ? documentoAggiornato : documento
  )

  // Salva la lista aggiornata su Supabase
  const { error } = await supabase
    .from("condomini")
    .update({ documenti: documentiAggiornati })
    .eq("id", selectedCondominio.id)

  // Gestione errore database
  if (error) {
    alert(error.message)
    return
  }

  // Aggiorna il condominio selezionato nel frontend
  const aggiornato = {
    ...selectedCondominio,
    documenti: documentiAggiornati,
  }

  setSelectedCondominio(aggiornato)

  // Aggiorna anche la lista globale dei condomìni
  setCondomini((prev) =>
    prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
  )

  // Esce dalla modalità modifica
  setEditingDocumentoId(null)
}

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
    alert(error.message)
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

// ===============================
// TICKET: AGGIUNTA SEGNALAZIONE
// ===============================

// Aggiunge un nuovo ticket al condominio selezionato
async function aggiungiTicket() {
  // Controllo sicurezza: serve un condominio selezionato e un titolo
  if (!selectedCondominio || !nuovoTicket.titolo) return

  // Recupera i ticket già esistenti
  const ticketAttuali = selectedCondominio.ticket ?? []

  // Crea la nuova lista ticket
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

  // Salva i ticket aggiornati su Supabase
  const { error } = await supabase
    .from("condomini")
    .update({ ticket: ticketAggiornati })
    .eq("id", selectedCondominio.id)

  // Gestione errore database
  if (error) {
    alert(error.message)
    return
  }

  // Aggiorna il condominio selezionato nel frontend
  const aggiornato = {
    ...selectedCondominio,
    ticket: ticketAggiornati,
  }

  setSelectedCondominio(aggiornato)

  // Aggiorna anche la lista globale condomìni
  setCondomini((prev) =>
    prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
  )

  // Reset form ticket
  setNuovoTicket({
    titolo: "",
    descrizione: "",
    stato: "Aperto",
    priorita: "Media",
  })
}

// ===============================
// TICKET: MODIFICA SEGNALAZIONE
// ===============================

// Modifica titolo, descrizione, stato e priorità di un ticket
async function modificaTicket(ticketAggiornato: Ticket) {
  // Controllo sicurezza
  if (!selectedCondominio) return

  // Sostituisce solo il ticket modificato
  const ticketAggiornati = (selectedCondominio.ticket ?? []).map((ticket) =>
    ticket.id === ticketAggiornato.id ? ticketAggiornato : ticket
  )

  // Salva su Supabase
  const { error } = await supabase
    .from("condomini")
    .update({ ticket: ticketAggiornati })
    .eq("id", selectedCondominio.id)

  if (error) {
    alert(error.message)
    return
  }

  // Aggiorna frontend
  const aggiornato = {
    ...selectedCondominio,
    ticket: ticketAggiornati,
  }

  setSelectedCondominio(aggiornato)

  setCondomini((prev) =>
    prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
  )

  // Esce dalla modalità modifica
  setEditingTicketId(null)
}

// ===============================
// TICKET: ELIMINAZIONE SEGNALAZIONE
// ===============================

// Elimina un ticket dal condominio selezionato
async function eliminaTicket(idTicket: number) {
  // Controllo sicurezza
  if (!selectedCondominio) return

  const conferma = confirm("Vuoi eliminare questo ticket?")
  if (!conferma) return

  // Rimuove il ticket dalla lista
  const ticketAggiornati = (selectedCondominio.ticket ?? []).filter(
    (ticket) => ticket.id !== idTicket
  )

  // Salva su Supabase
  const { error } = await supabase
    .from("condomini")
    .update({ ticket: ticketAggiornati })
    .eq("id", selectedCondominio.id)

  if (error) {
    alert(error.message)
    return
  }

  // Aggiorna frontend
  const aggiornato = {
    ...selectedCondominio,
    ticket: ticketAggiornati,
  }

  setSelectedCondominio(aggiornato)

  setCondomini((prev) =>
    prev.map((c) => (c.id === aggiornato.id ? aggiornato : c))
  )
}

  // ===============================
  // IMPIANTI: AGGIUNTA / MODIFICA / ELIMINA
  // ===============================
  
  async function eliminaImpianto(idImpianto: number) {
  if (!selectedCondominio) return

  const impiantiAggiornati = (selectedCondominio.impianti ?? []).filter(
    (impianto) => impianto.id !== idImpianto
  )

  const { error } = await supabase
    .from("condomini")
    .update({ impianti: impiantiAggiornati })
    .eq("id", selectedCondominio.id)

  if (error) {
    alert(error.message)
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

async function aggiungiImpianto() {
  if (!selectedCondominio || !nuovoImpianto.tipo) return

  const impiantiAttuali = selectedCondominio.impianti ?? []

  const impiantiAggiornati = [
    ...impiantiAttuali,
    {
      id: Date.now(),
      ...nuovoImpianto,
    },
  ]

  const { error } = await supabase
    .from("condomini")
    .update({ impianti: impiantiAggiornati })
    .eq("id", selectedCondominio.id)

  if (error) {
    alert(error.message)
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
    contratto_manutenzione: "",
  })
}

  // ===============================
// SALVA GESTIONALE PRINCIPALE
// ===============================
// Ogni studio può avere un solo gestionale principale attivo:
// Danea, TeamSystem, Zucchetti oppure Excel/manuale.
async function salvaCollegamentoGestionale(provider: string, apiKey: string) {
  if (!user) return

  // Prima disattiva eventuali gestionali già impostati come principali
  const { error: resetError } = await supabase
    .from("gestionale_connections")
    .update({ is_primary: false })
    .eq("user_id", user.id)

  if (resetError) {
    alert(resetError.message)
    return
  }

  // Poi salva o aggiorna il gestionale scelto come principale
  const { error } = await supabase
    .from("gestionale_connections")
    .upsert(
      {
        user_id: user.id,
        provider,
        api_key: apiKey,
        connection_mode: provider === "excel" ? "file" : "api",
        status: apiKey || provider === "excel" ? "connected" : "not_connected",
        is_primary: true,
        last_sync_at: null,
      },
      {
        onConflict: "user_id,provider",
      }
    )

  if (error) {
    alert(error.message)
    return
  }

  alert("Gestionale principale salvato correttamente.")
}

  // ===============================
  // CONDOMINI: CREA / MODIFICA / ELIMINA
  // ===============================

  async function modificaCondominio(condominio: Condominio) {
  const { error } = await supabase
    .from("condomini")
    .update({
      nome: condominio.nome,
      indirizzo: condominio.indirizzo,
      comune: condominio.comune,
    })
    .eq("id", condominio.id)

  if (error) {
    alert(error.message)
    return
  }

  setEditingCondominioId(null)
}

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
    alert(error.message)
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

async function modificaEventoTimeline(eventoAggiornato: TimelineEvent) {
  if (!selectedCondominio) return

  const timelineAggiornata = (selectedCondominio.timeline ?? []).map((evento) =>
    evento.id === eventoAggiornato.id ? eventoAggiornato : evento
  )

  const { error } = await supabase
    .from("condomini")
    .update({ timeline: timelineAggiornata })
    .eq("id", selectedCondominio.id)

  if (error) {
    alert(error.message)
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

  async function eliminaCondominio(id: number) {
  const conferma = confirm("Vuoi eliminare questo condominio?")
  if (!conferma) return

  const { error } = await supabase
    .from("condomini")
    .delete()
    .eq("id", id)

  if (error) {
    alert(error.message)
    return
  }

  setCondomini((prev) => prev.filter((c) => c.id !== id))
}

// ===============================
// LETTURA EXCEL / CSV CON MERGE ANTI-DUPLICATI
// ===============================
// Legge il file, prepara anteprima e separa:
// - condomìni nuovi
// - duplicati già presenti nel database
// - duplicati interni allo stesso file
async function preparaAnteprimaImportCondomini(file: File) {
  if (!user) return

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)

  const primoFoglio = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[primoFoglio]

  // ===============================
  // RICERCA AUTOMATICA HEADER EXCEL
  // ===============================

  const righeGreze = XLSX.utils.sheet_to_json<any[]>(worksheet, {
    header: 1,
    defval: "",
  })

  const indiceHeader = righeGreze.findIndex((riga) => {
    const valori = riga.map((cella) =>
      String(cella).toLowerCase().trim()
    )

    return (
      valori.includes("nome") &&
      valori.includes("indirizzo") &&
      (
        valori.includes("città") ||
        valori.includes("citta") ||
        valori.includes("comune")
      )
    )
  })

  if (indiceHeader === -1) {
    alert("Impossibile trovare le intestazioni corrette nel file Excel.")
    return
  }

  const righe = XLSX.utils.sheet_to_json<any>(worksheet, {
    range: indiceHeader,
    defval: "",
  })

  const validi: any[] = []
  const errori: any[] = []
  const duplicati: any[] = []

  // Recupera i condomìni già presenti nello studio dell'utente
  const { data: condominiEsistenti, error } = await supabase
    .from("condomini")
    .select("id, nome, nome_condominio, indirizzo, comune")
    .eq("user_id", user.id)

  if (error) {
    alert(error.message)
    return
  }

  // Normalizza testo per confrontare bene i duplicati
  const normalizzaTesto = (valore: string) =>
    String(valore || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")

  // Crea una chiave unica basata su nome + indirizzo + comune
  const creaChiaveDuplicato = (condominio: any) => {
    const nome = condominio.nome || condominio.nome_condominio || ""
    return `${normalizzaTesto(nome)}|${normalizzaTesto(condominio.indirizzo)}|${normalizzaTesto(
      condominio.comune
    )}`
  }

  const chiaviDatabase = new Set(
    (condominiEsistenti || []).map((condominio) =>
      creaChiaveDuplicato(condominio)
    )
  )

  const chiaviFile = new Set<string>()

  righe.forEach((riga, index) => {
    const condominio = {
      nome:
        riga.nome ||
        riga.Nome ||
        riga.condominio ||
        riga.Condominio ||
        riga["Nome condominio"] ||
        riga["Nome Condominio"] ||
        "",

      indirizzo:
        riga.indirizzo ||
        riga.Indirizzo ||
        riga.via ||
        riga.Via ||
        "",

      comune:
        riga.comune ||
        riga.Comune ||
        riga.citta ||
        riga.Citta ||
        riga["Città"] ||
        "",

      email_notifiche:
        riga.email_notifiche ||
        riga.Email_notifiche ||
        riga.email ||
        riga.Email ||
        riga.mail ||
        riga.Mail ||
        "",

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
    alert("Nessun nuovo condominio valido da importare.")
  }
}

// ===============================
// IMPORT DEFINITIVO CONDOMINI
// ===============================
// Salva nel database solo i condomìni già validati nell'anteprima
async function confermaImportCondomini() {
  if (!user) return

  if (anteprimaImport.length === 0) {
    alert("Non ci sono condomìni validi da importare.")
    return
  }

  setImportInCorso(true)

  const { data, error } = await supabase
    .from("condomini")
    .insert(anteprimaImport)
    .select()

  setImportInCorso(false)

  if (error) {
    alert(error.message)
    return
  }

  if (data) {
    setCondomini((prev) => [...data, ...prev])
  }

  alert(`${anteprimaImport.length} condomìni importati correttamente.`)

  setAnteprimaImport([])
  setErroriImport([])
  setDuplicatiImport([])
}

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
    alert(error.message)
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
  if (!user) {
  return <LoginPage form={loginForm} setForm={setLoginForm} />
}

if (caricamentoOnboarding) {
  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <p className="eyebrow">Caricamento</p>
        <h1>Preparazione studio...</h1>
      </section>
    </main>
  )
}

if (!onboardingCompletato) {
  return (
  <OnboardingPage
  onComplete={completaOnboarding}
  onConnectGestionale={salvaCollegamentoGestionale}
/>
)
}

  // ===============================
  // LISTE GLOBALI: SCADENZE, TIMELINE, RICERCA
  // ===============================

const scadenzeGlobali = condomini
  .flatMap((condominio) =>
    (condominio.impianti ?? []).flatMap((impianto) => {
      const scadenze = []

      if (impianto.manutenzione) {
        scadenze.push({
          id: `${condominio.id}-${impianto.id}-manutenzione`,
          condominio: condominio.nome,
          impianto: impianto.tipo,
          descrizione: impianto.nome,
          tipo: "Manutenzione",
          data: impianto.manutenzione,
        })
      }

      if (impianto.contratto_manutenzione) {
        scadenze.push({
          id: `${condominio.id}-${impianto.id}-contratto`,
          condominio: condominio.nome,
          impianto: impianto.tipo,
          descrizione: impianto.nome,
          tipo: "Contratto manutenzione",
          data: impianto.contratto_manutenzione,
        })
      }

      return scadenze
    })
  )
  .sort((a, b) => giorniAllaScadenza(a.data) - giorniAllaScadenza(b.data))

const timelineGlobale = condomini
  .flatMap((condominio) =>
    (condominio.timeline ?? []).map((evento) => ({
      ...evento,
      condominio: condominio.nome,
      indirizzo: condominio.indirizzo,
    }))
  )
  .filter((evento) => {
    const testo = `${evento.tipo} ${evento.titolo} ${evento.descrizione} ${evento.condominio} ${evento.indirizzo}`.toLowerCase()

    return testo.includes(ricercaTimeline.toLowerCase())
  })
  .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

// ===============================
// LISTA GLOBALE TICKET
// ===============================

// Unisce tutti i ticket di tutti i condomìni in una sola lista globale
const ticketGlobali = condomini
  .flatMap((condominio) =>
    (condominio.ticket ?? []).map((ticket) => ({
      ...ticket,
      condominio: condominio.nome,
      indirizzo: condominio.indirizzo,
    }))
  )
  .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

// ===============================
// LISTA GLOBALE DOCUMENTI
// ===============================

const documentiGlobali = condomini
  .flatMap((condominio) =>
    (condominio.documenti ?? []).map((documento) => ({
      ...documento,
      condominio: condominio.nome,
      indirizzo: condominio.indirizzo,
    }))
  )
  .sort((a, b) => {
    return new Date(b.data || "").getTime() - new Date(a.data || "").getTime()
  })

const condominiFiltrati = condomini.filter((condominio) => {
  const testo = `${condominio.nome} ${condominio.indirizzo} ${condominio.comune}`.toLowerCase()

  return testo.includes(ricercaCondomini.toLowerCase())
})

// ===============================
// ATTIVITÀ RECENTI DASHBOARD
// ===============================

// Crea un feed unico con ticket, documenti e timeline
const attivitaRecenti = [
  ...ticketGlobali.map((ticket) => ({
    id: `ticket-${ticket.condominio}-${ticket.id}`,
    tipo: "Ticket",
    titolo: ticket.titolo,
    descrizione: ticket.descrizione,
    condominio: ticket.condominio,
    data: ticket.data,
  })),

  ...documentiGlobali.map((documento) => ({
    id: `documento-${documento.condominio}-${documento.id}`,
    tipo: "Documento",
    titolo: documento.titolo,
    descrizione: documento.categoria,
    condominio: documento.condominio,
    data: documento.data || "",
  })),

  ...timelineGlobale.map((evento) => ({
    id: `timeline-${evento.condominio}-${evento.id}`,
    tipo: evento.tipo,
    titolo: evento.titolo,
    descrizione: evento.descrizione,
    condominio: evento.condominio,
    data: evento.data,
  })),
]
  .filter((attivita) => attivita.data)
  .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  .slice(0, 6)

  // ===============================
// RICERCA GLOBALE DASHBOARD
// ===============================

// Cerca contemporaneamente in condomìni, ticket, documenti e timeline
const risultatiRicercaGlobale = ricercaGlobale.trim()
  ? [
      ...condomini.map((condominio) => ({
        id: `condominio-${condominio.id}`,
        tipo: "Condominio",
        titolo: condominio.nome,
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

      ...timelineGlobale.map((evento) => ({
        id: `timeline-${evento.condominio}-${evento.id}`,
        tipo: evento.tipo,
        titolo: evento.titolo,
        descrizione: `${evento.condominio} · ${evento.descrizione}`,
      })),
    ].filter((risultato) => {
      const testo = `${risultato.tipo} ${risultato.titolo} ${risultato.descrizione}`.toLowerCase()

      return testo.includes(ricercaGlobale.toLowerCase())
    })
  : []

  // ===============================
// NOTIFICHE OPERATIVE
// ===============================

const notificheOperative = [
  ...scadenzeGlobali
    .filter((s) => giorniAllaScadenza(s.data) <= 30)
    .map((s) => ({
      id: `scadenza-${s.id}`,
      tipo: "Scadenza urgente",
      titolo: `${s.impianto} · ${s.condominio}`,
      descrizione: `${s.tipo} in scadenza il ${s.data}`,
      livello: "urgente",
    })),

  ...ticketGlobali
    .filter(
      (t) =>
        t.priorita === "Alta" &&
        t.stato !== "Chiuso"
    )
    .map((t) => ({
      id: `ticket-${t.id}`,
      tipo: "Ticket prioritario",
      titolo: t.titolo,
      descrizione: `${t.condominio} · ${t.stato}`,
      livello: "warning",
    })),
].slice(0, 8)


  // ===============================
  // PAGINA DETTAGLIO CONDOMINIO
  // ===============================

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
        <h1>{selectedCondominio.nome}</h1>

        <p className="subtitle">
          {selectedCondominio.indirizzo} – {selectedCondominio.comune}
        </p>

        <div className="detail-grid">
          <div className="detail-card impianti-card">
            <h2>Impianti</h2>
            <p>Gestione impianti del fabbricato</p>

            <div className="impianti-form">
              <select
                value={nuovoImpianto.tipo}
                onChange={(e) =>
                  setNuovoImpianto({ ...nuovoImpianto, tipo: e.target.value })
                }
              >
                <option value="">Seleziona impianto</option>
                {impiantiDisponibili.map((impianto) => (
                  <option key={impianto} value={impianto}>
                    {impianto}
                  </option>
                ))}
              </select>

              <input
                placeholder="Nome/descrizione"
                value={nuovoImpianto.nome}
                onChange={(e) =>
                  setNuovoImpianto({ ...nuovoImpianto, nome: e.target.value })
                }
              />

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

              <button onClick={aggiungiImpianto}>Aggiungi impianto</button>
            </div>

            <div className="impianti-list">
            {(selectedCondominio.impianti ?? []).map((impianto) => (
              <div
                className={`impianto-row ${getStatoScadenza(impianto.manutenzione)}`}
                key={impianto.id}
              >
                {editingImpiantoId === impianto.id ? (
                  <>
                    <input
                      value={impianto.tipo}
                      onChange={(e) => {
                        const aggiornato = {
                          ...selectedCondominio,
                          impianti: (selectedCondominio.impianti ?? []).map((i) =>
                            i.id === impianto.id ? { ...i, tipo: e.target.value } : i
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
                          impianti: (selectedCondominio.impianti ?? []).map((i) =>
                            i.id === impianto.id ? { ...i, nome: e.target.value } : i
                          ),
                        }
                        setSelectedCondominio(aggiornato)
                      }}
                    />

                    <input
                      type="date"
                      value={impianto.manutenzione}
                      onChange={(e) => {
                        const aggiornato = {
                          ...selectedCondominio,
                          impianti: (selectedCondominio.impianti ?? []).map((i) =>
                            i.id === impianto.id
                              ? { ...i, manutenzione: e.target.value }
                              : i
                          ),
                        }
                        setSelectedCondominio(aggiornato)
                      }}
                    />

                    <input
                      type="date"
                      value={impianto.contratto_manutenzione}
                      onChange={(e) => {
                        const aggiornato = {
                          ...selectedCondominio,
                          impianti: (selectedCondominio.impianti ?? []).map((i) =>
                            i.id === impianto.id
                              ? { ...i, contratto_manutenzione: e.target.value }
                              : i
                          ),
                        }
                        setSelectedCondominio(aggiornato)
                      }}
                    />

                    <button onClick={() => modificaImpianto(impianto)}>Salva</button>
                  </>
                ) : (
                  <>
                    <strong>{impianto.tipo}</strong>
                    <span>{impianto.nome || "Nessuna descrizione"}</span>
                    <small>Manutenzione: {impianto.manutenzione || "—"}</small>
                    <small>Contratto: {impianto.contratto_manutenzione || "—"}</small>

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
        setNuovoDocumento({ ...nuovoDocumento, titolo: e.target.value })
      }
    />

    <select
      value={nuovoDocumento.categoria}
      onChange={(e) =>
        setNuovoDocumento({ ...nuovoDocumento, categoria: e.target.value })
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
      onChange={(e) => {
        setFileDocumento(e.target.files?.[0] ?? null)
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
                  documenti: (selectedCondominio.documenti ?? []).map((doc) =>
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
                    documenti: (selectedCondominio.documenti ?? []).map((doc) =>
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
                    documenti: (selectedCondominio.documenti ?? []).map((doc) =>
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
                    documenti: (selectedCondominio.documenti ?? []).map((doc) =>
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
                      onClick={() => apriDocumento(documento.file_path!)}
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
        setNuovoEvento({ ...nuovoEvento, descrizione: e.target.value })
      }
    />

    <button onClick={aggiungiEventoTimeline}>
      Aggiungi alla timeline
    </button>
  </div>

  <div className="timeline-list">
  {[...(selectedCondominio.timeline ?? [])]
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
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
                  timeline: (selectedCondominio.timeline ?? []).map((ev) =>
                    ev.id === evento.id ? { ...ev, tipo: e.target.value } : ev
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
                    timeline: (selectedCondominio.timeline ?? []).map((ev) =>
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
                    timeline: (selectedCondominio.timeline ?? []).map((ev) =>
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
              <small>{new Date(evento.data).toLocaleString("it-IT")}</small>

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
        setNuovoTicket({ ...nuovoTicket, descrizione: e.target.value })
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

    <button onClick={aggiungiTicket}>
      Aggiungi ticket
    </button>
  </div>

  <div className="ticket-list">
    {(selectedCondominio.ticket ?? []).map((ticket) => (
  <div
    className={`ticket-row ${ticket.stato.toLowerCase().replace(" ", "-")}`}
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
                  ? { ...t, priorita: e.target.value as Ticket["priorita"] }
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
                ticket: (selectedCondominio.ticket ?? []).map((t) =>
                  t.id === ticket.id ? { ...t, titolo: e.target.value } : t
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
                ticket: (selectedCondominio.ticket ?? []).map((t) =>
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
                ticket: (selectedCondominio.ticket ?? []).map((t) =>
                  t.id === ticket.id
                    ? { ...t, stato: e.target.value as Ticket["stato"] }
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
            {ticket.stato} · {new Date(ticket.data).toLocaleString("it-IT")}
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

  // ===============================
  // PAGINA SCADENZE GLOBALI
  // ===============================

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
            <div className="empty-state">
              Nessuna scadenza presente.
            </div>
          ) : (
            scadenzeGlobali.map((scadenza) => (
              <div
                className={`scadenza-row ${getStatoScadenza(scadenza.data)}`}
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
                    {giorniAllaScadenza(scadenza.data)} giorni
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
  )
}

// ===============================
// PAGINA TIMELINE GLOBALE
// ===============================

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

// ===============================
// PAGINA TICKET GLOBALE
// ===============================

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
            <div className="empty-state">
              Nessun ticket presente.
            </div>
          ) : (
            ticketGlobali.map((ticket) => (
              <div
                className={`ticket-row ${ticket.stato
                  .toLowerCase()
                  .replace(" ", "-")}`}
                key={`${ticket.condominio}-${ticket.id}`}
              >
                <span>{ticket.priorita}</span>

                <div>
                  <strong>{ticket.titolo}</strong>
                  <p>{ticket.descrizione || "Nessuna descrizione"}</p>
                  <small>
                    {ticket.stato} · {ticket.condominio} · {ticket.indirizzo} ·{" "}
                    {new Date(ticket.data).toLocaleString("it-IT")}
                  </small>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
  )
}

// ===============================
// PAGINA DOCUMENTI GLOBALE
// ===============================

if (page === "documenti") {
  return renderSaasLayout(
    <section className="page-view">
        <p className="eyebrow">Archivio studio</p>
        <h1>Documenti</h1>

        <p className="subtitle">
          Tutti i documenti caricati nei condomìni.
        </p>

        <div className="documenti-list">
          {documentiGlobali.length === 0 ? (
            <div className="empty-state">
              Nessun documento presente.
            </div>
          ) : (
            documentiGlobali.map((documento) => (
              <div
                className="documento-row"
                key={`${documento.condominio}-${documento.id}`}
              >
                <span>{documento.categoria}</span>

                <div>
                  <strong>{documento.titolo}</strong>

                  <p>{documento.note || "Nessuna nota"}</p>

                  <small>
                    {documento.condominio} · {documento.indirizzo} ·{" "}
                    {documento.data || "Data non indicata"}
                  </small>

                  {documento.file_path ? (
                    <div className="document-actions">
                      <button
                        className="secondary small"
                        onClick={() => apriDocumento(documento.file_path!)}
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
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
  )
}

// ===============================
// PAGINA CONDOMINI
// ===============================

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

            <button onClick={() => setShowModal(true)}>
              + Nuovo condominio
            </button>
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
                  <div key={index} className="premium-import-row premium-import-row-wide">
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
                {importInCorso ? "Importazione in corso..." : "Conferma importazione"}
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
                      value={condominio.nome}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setCondomini((prev) =>
                          prev.map((c) =>
                            c.id === condominio.id ? { ...c, nome: e.target.value } : c
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
                            c.id === condominio.id ? { ...c, comune: e.target.value } : c
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
                    <h2>{condominio.nome}</h2>
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

                  <button className="icon-button" onClick={() => setShowModal(false)}>
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
                      onChange={(e) => setForm({ ...form, comune: e.target.value })}
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

// ===============================
// DASHBOARD CON LAYOUT SAAS
// ===============================

// Layout principale con sidebar laterale e contenuto dashboard
return renderSaasLayout(
  <Dashboard
  setPage={setPage}
  ticketAperti={ticketGlobali.filter((t) => t.stato !== "Chiuso").length}
  scadenzeUrgenti={
    scadenzeGlobali.filter((s) => giorniAllaScadenza(s.data) <= 30).length
  }
  condominiTotali={condomini.length}
  documentiTotali={documentiGlobali.length}
  scadenzeTotali={scadenzeGlobali.length}
  scadenzeProssime={scadenzeGlobali.slice(0, 5)}
  attivitaRecenti={attivitaRecenti}
  ricercaGlobale={ricercaGlobale}
  setRicercaGlobale={setRicercaGlobale}
  risultatiRicercaGlobale={risultatiRicercaGlobale}
  notificheOperative={notificheOperative}
  onSyncDanea={sincronizzaDanea}
  onOpenGestionaleModal={() => setShowGestionaleModal(true)}
/>
)
}

export default App