import { useState, useEffect } from "react"
import { supabase } from "./supabase"
import "./App.css"
import type { Page, Condominio, Impianto, TimelineEvent, Documento } from "./types"
import { getStatoScadenza, giorniAllaScadenza } from "./utils/scadenze"
import { modules, impiantiDisponibili } from "./data/constants"
import LoginPage from "./components/LoginPage"
import Dashboard from "./components/Dashboard"

function App() {
 
  // ===============================
  // STATI PRINCIPALI APP
  // ===============================

  const [user, setUser] = useState<any>(null)
  const [ricercaTimeline, setRicercaTimeline] = useState("")
  const [ricercaCondomini, setRicercaCondomini] = useState("")
  const [page, setPage] = useState<Page>("home")
  const [showModal, setShowModal] = useState(false)
  const [editingCondominioId, setEditingCondominioId] = useState<number | null>(null)
  const [editingImpiantoId, setEditingImpiantoId] = useState<number | null>(null)
  const [editingEventoId, setEditingEventoId] = useState<number | null>(null)
  // Stato che indica quale documento è in modifica
  const [editingDocumentoId, setEditingDocumentoId] = useState<number | null>(null) 
  const [selectedCondominio, setSelectedCondominio] = useState<Condominio | null>(null)
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
  const [fileDocumento, setFileDocumento] = useState<File | null>(null)
  const [nuovoDocumento, setNuovoDocumento] = useState({
    titolo: "",
    categoria: "Contratto",
    data: "",
    note: "",
  })
  const [condomini, setCondomini] = useState<Condominio[]>([
    {
      id: 1,
      nome: "Condominio Via Roma 12",
      indirizzo: "Via Roma 12",
      comune: "Bologna",
    },
    {
      id: 2,
      nome: "Condominio Via Mazzini 45",
      indirizzo: "Via Mazzini 45",
      comune: "Bologna",
    },
  ])

  const [form, setForm] = useState({
  nome: "",
  indirizzo: "",
  comune: "",
  email: "",
  password: "",
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
  
  // ===============================
  // CARICAMENTO CONDOMINI DA SUPABASE
  // ===============================

useEffect(() => {
  async function caricaCondomini() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from("condomini")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (!error && data) {
      setCondomini(data)
    }
  }

  caricaCondomini()
}, [])

useEffect(() => {
  localStorage.setItem("condomini", JSON.stringify(condomini))
}, [condomini])

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

  async function creaCondominio() {
  if (!form.nome || !form.indirizzo || !form.comune) return

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("condomini")
    .insert([
      {
        nome: form.nome,
        indirizzo: form.indirizzo,
        comune: form.comune,
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
    nome: "",
    indirizzo: "",
    comune: "",
    email: form.email,
    password: form.password,
  })

  setShowModal(false)
}
  if (!user) {
  return <LoginPage form={form} setForm={setForm} />
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

const condominiFiltrati = condomini.filter((condominio) => {
  const testo = `${condominio.nome} ${condominio.indirizzo} ${condominio.comune}`.toLowerCase()

  return testo.includes(ricercaCondomini.toLowerCase())
})

  // ===============================
  // PAGINA DETTAGLIO CONDOMINIO
  // ===============================

  if (selectedCondominio) {
  return (
    <main className="app-shell">
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
  {(selectedCondominio.documenti ?? []).map((documento) => (
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
                    scaricaDocumento(documento.file_path!, documento.file_name)
                  }
                >
                  Scarica
                </button>

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
            ) : null}
          </div>
        </>
      )}
    </div>
  ))}
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

          <div className="detail-card">
            <h2>Ticket</h2>
            <p>Segnalazioni e interventi</p>
          </div>
        </div>
      </section>
    </main>
  )
}

  // ===============================
  // PAGINA SCADENZE GLOBALI
  // ===============================

if (page === "scadenze") {
  return (
    <main className="app-shell">
      <section className="page-view">
        <button className="back-button" onClick={() => setPage("home")}>
          ← Torna alla dashboard
        </button>

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
    </main>
  )
}

// ===============================
// PAGINA TIMELINE GLOBALE
// ===============================

if (page === "timelineGlobale") {
  return (
    <main className="app-shell">
      <section className="page-view">
        <button className="back-button" onClick={() => setPage("home")}>
          ← Torna alla dashboard
        </button>

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
    </main>
  )
}

// ===============================
// PAGINA CONDOMINI
// ===============================

  if (page === "condomini") {
    return (
      <main className="app-shell">
        <section className="page-view">
          <button className="back-button" onClick={() => setPage("home")}>
            ← Torna alla dashboard
          </button>

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

          {showModal && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-header">
                  <h2>Nuovo condominio</h2>
                  <button className="icon-button" onClick={() => setShowModal(false)}>
                    ×
                  </button>
                </div>

                <label>
                  Nome condominio
                  <input
                    value={form.nome}
                    onChange={(e) =>
                      setForm({ ...form, nome: e.target.value })
                    }
                    placeholder="Es. Condominio Via Roma 12"
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

                <button className="full-button" onClick={creaCondominio}>
                  Salva condominio
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    )
  }

  if (page !== "home") {
    return (
      <main className="app-shell">
        <section className="page-view">
          <button className="back-button" onClick={() => setPage("home")}>
            ← Torna alla dashboard
          </button>

          <p className="eyebrow">Modulo</p>
          <h1>{modules.find((module) => module.page === page)?.title}</h1>
          <p className="subtitle">
            Questa sarà la sezione operativa dedicata a{" "}
            {modules.find((module) => module.page === page)?.title}.
          </p>
        </section>
      </main>
    )
  }

  return <Dashboard setPage={setPage} />
}

export default App