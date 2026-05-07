import type { Page } from "../types"

type ScadenzaDashboard = {
  id: string
  condominio: string
  impianto: string
  descrizione: string
  tipo: string
  data: string
}

type AttivitaDashboard = {
  id: string
  tipo: string
  titolo: string
  descrizione: string
  condominio: string
  data: string
}

type RisultatoRicercaDashboard = {
  id: string
  tipo: string
  titolo: string
  descrizione: string
}

type NotificaDashboard = {
  id: string
  tipo: string
  titolo: string
  descrizione: string
  livello: string
}

type DashboardProps = {
  setPage: (page: Page) => void
  ticketAperti: number
  scadenzeUrgenti: number
  condominiTotali: number
  documentiTotali: number
  scadenzeTotali: number
  scadenzeProssime: ScadenzaDashboard[]
  attivitaRecenti: AttivitaDashboard[]
  ricercaGlobale: string
  setRicercaGlobale: (value: string) => void
  risultatiRicercaGlobale: RisultatoRicercaDashboard[]
  notificheOperative: NotificaDashboard[]
  onSyncDanea: () => void
  onOpenGestionaleModal: () => void
}

function giorniAllaScadenzaDashboard(data: string) {
  const oggi = new Date()
  const scadenza = new Date(data)

  oggi.setHours(0, 0, 0, 0)
  scadenza.setHours(0, 0, 0, 0)

  const differenza = scadenza.getTime() - oggi.getTime()
  return Math.ceil(differenza / (1000 * 60 * 60 * 24))
}

export default function Dashboard({
  setPage,
  ticketAperti,
  scadenzeUrgenti,
  condominiTotali,
  documentiTotali,
  scadenzeTotali,
  scadenzeProssime,
  attivitaRecenti,
  ricercaGlobale,
  setRicercaGlobale,
  risultatiRicercaGlobale,
  notificheOperative,
  onSyncDanea: _onSyncDanea,
  onOpenGestionaleModal,
}: DashboardProps) {
  return (
    <section className="dashboard-premium">
      <section className="global-search-panel">
        <div>
          <span>Ricerca globale</span>
          <h2>Cerca nello studio</h2>
          <p>
            Trova rapidamente condomìni, ticket, documenti e comunicazioni.
          </p>
        </div>

        <input
          placeholder="Cerca es. ascensore, verbale, perdita acqua..."
          value={ricercaGlobale}
          onChange={(e) => setRicercaGlobale(e.target.value)}
        />

        {ricercaGlobale.trim() && (
          <div className="global-search-results">
            {risultatiRicercaGlobale.length === 0 ? (
              <div className="empty-state">
                Nessun risultato trovato.
              </div>
            ) : (
              risultatiRicercaGlobale.slice(0, 8).map((risultato) => (
                <div className="global-search-row" key={risultato.id}>
                  <span>{risultato.tipo}</span>

                  <div>
                    <strong>{risultato.titolo}</strong>
                    <p>{risultato.descrizione}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <section className="integration-panel">
        <div className="dashboard-card integration-card">
          <div>
            <span className="eyebrow">Integrazioni</span>

            <h2>Gestionale principale</h2>

            <p>
              Collega Danea, TeamSystem o Zucchetti per sincronizzare condomìni,
              anagrafiche e documenti.
            </p>
          </div>

          <button
            className="premium-save-button integration-button"
            onClick={onOpenGestionaleModal}
          >
            Configura gestionale
          </button> 
        </div>
      </section> 

      <div className="analytics-grid">
        <button className="analytics-card" onClick={() => setPage("scadenze")}>
          <span>Urgenze</span>
          <strong>{scadenzeUrgenti}</strong>
          <p>Scadenze entro 30 giorni</p>
        </button>

        <button className="analytics-card" onClick={() => setPage("ticket")}>
          <span>Ticket</span>
          <strong>{ticketAperti}</strong>
          <p>Ticket ancora aperti</p>
        </button>

        <button className="analytics-card" onClick={() => setPage("documenti")}>
          <span>Archivio</span>
          <strong>{documentiTotali}</strong>
          <p>Documenti caricati</p>
        </button>

        <button className="analytics-card" onClick={() => setPage("condomini")}>
          <span>Studio</span>
          <strong>{condominiTotali}</strong>
          <p>Condomìni gestiti</p>
        </button>
      </div>

      <div className="dashboard-operational-grid">
        <section className="dashboard-panel">
          <div className="panel-header">
            <div>
              <span>Priorità operative</span>
              <h2>Prossime scadenze</h2>
            </div>

            <button className="secondary small" onClick={() => setPage("scadenze")}>
              Vedi tutte
            </button>
          </div>

          <div className="dashboard-deadlines">
            {scadenzeProssime.length === 0 ? (
              <div className="empty-state">
                Nessuna scadenza presente.
              </div>
            ) : (
              scadenzeProssime.map((scadenza) => {
                const giorni = giorniAllaScadenzaDashboard(scadenza.data)

                return (
                  <div className="deadline-mini-row" key={scadenza.id}>
                    <div>
                      <strong>{scadenza.impianto}</strong>
                      <p>{scadenza.condominio}</p>
                    </div>

                    <div>
                      <span>{scadenza.tipo}</span>
                      <small>{scadenza.data}</small>
                    </div>

                    <strong className={giorni <= 30 ? "urgent-days" : ""}>
                      {giorni} gg
                    </strong>
                  </div>
                )
              })
            )}
          </div>
        </section>



        <section className="dashboard-panel">
          <div className="panel-header">
            <div>
              <span>Panoramica</span>
              <h2>Stato studio</h2>
            </div>
          </div>        

          <div className="studio-summary">
            <div>
              <span>Scadenze totali</span>
              <strong>{scadenzeTotali}</strong>
            </div>

            <div>
              <span>Ticket aperti</span>
              <strong>{ticketAperti}</strong>
            </div>

            <div>
              <span>Documenti</span>
              <strong>{documentiTotali}</strong>
            </div>

            <div>
              <span>Condomìni</span>
              <strong>{condominiTotali}</strong>
            </div>
          </div>
        </section>

        <section className="dashboard-panel notifications-panel">
              <div className="panel-header">
                <div>
                  <span>Centro operativo</span>
                  <h2>Notifiche</h2>
                </div>
              </div>

              <div className="notifications-list">
                {notificheOperative.length === 0 ? (
                  <div className="empty-state">
                    Nessuna notifica operativa.
                  </div>
                ) : (
                  notificheOperative.map((notifica) => (
                    <div
                      className={`notification-row ${notifica.livello}`}
                      key={notifica.id}
                    >
                      <div>
                        <span>{notifica.tipo}</span>

                        <strong>{notifica.titolo}</strong>

                        <p>{notifica.descrizione}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

        <section className="dashboard-panel activity-panel">
          <div className="panel-header">
            <div>
              <span>Memoria operativa</span>
              <h2>Attività recenti</h2>
            </div>
          </div>

          <div className="activity-feed">
            {attivitaRecenti.length === 0 ? (
              <div className="empty-state">
                Nessuna attività recente.
              </div>
            ) : (
              attivitaRecenti.map((attivita) => (
                <div className="activity-row" key={attivita.id}>
                  <span>{attivita.tipo}</span>

                  <div>
                    <strong>{attivita.titolo}</strong>
                    <p>{attivita.descrizione || "Nessuna descrizione"}</p>
                    <small>
                      {attivita.condominio} ·{" "}
                      {new Date(attivita.data).toLocaleString("it-IT")}
                    </small>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  )
}