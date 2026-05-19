import type { Page } from "../types"

type ScadenzaDashboard = {
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

type RisultatoRicercaDashboard = {
  id: string
  tipo: string
  titolo: string
  descrizione: string
}

type DashboardProps = {
  setPage: (page: Page) => void
  ticketAperti: number
  urgenze: number
  scadenzeTotali: number
  scadenzeGlobali: ScadenzaDashboard[]
  ricercaGlobale: string
  setRicercaGlobale: (value: string) => void
  risultatiRicercaGlobale: RisultatoRicercaDashboard[]
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
  urgenze,
  scadenzeTotali,
  scadenzeGlobali,
  ricercaGlobale,
  setRicercaGlobale,
  risultatiRicercaGlobale,
}: DashboardProps) {
  return (
    <section className="dashboard-premium">
      <section className="global-search-panel">
        <div>
          <span>Ricerca globale</span>
          <h2>Cerca nello studio</h2>
          <p>
            Trova rapidamente condomini, fornitori, ticket, documenti e
            comunicazioni.
          </p>
        </div>

        <input
          placeholder="Cerca es. ascensore, verbale, fornitore, perdita acqua..."
          value={ricercaGlobale}
          onChange={(e) => setRicercaGlobale(e.target.value)}
        />

        {ricercaGlobale.trim() && (
          <div className="global-search-results">
            {risultatiRicercaGlobale.length === 0 ? (
              <div className="empty-state">Nessun risultato trovato.</div>
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

      <div className="analytics-grid dashboard-core-grid">
        <button className="analytics-card" onClick={() => setPage("scadenze")}>
          <span>Scadenze globali</span>
          <strong>{scadenzeTotali}</strong>
          <p>Scadenze impianti nello studio</p>
        </button>

        <button className="analytics-card" onClick={() => setPage("ticket")}>
          <span>Ticket aperti</span>
          <strong>{ticketAperti}</strong>
          <p>Segnalazioni ancora da chiudere</p>
        </button>

        <button className="analytics-card" onClick={() => setPage("scadenze")}>
          <span>Urgenze</span>
          <strong>{urgenze}</strong>
          <p>Avvisi in rosso o arancione</p>
        </button>
      </div>

      <div className="dashboard-operational-grid dashboard-operational-grid-single">
        <section className="dashboard-panel">
          <div className="panel-header">
            <div>
              <span>Agenda globale</span>
              <h2>Scadenze impianti</h2>
            </div>

            <button className="secondary small" onClick={() => setPage("scadenze")}>
              Vedi tutte
            </button>
          </div>

          <div className="dashboard-deadlines">
            {scadenzeGlobali.length === 0 ? (
              <div className="empty-state">Nessuna scadenza presente.</div>
            ) : (
              scadenzeGlobali.slice(0, 8).map((scadenza) => {
                const dataRiferimento = scadenza.data_avviso || scadenza.data
                const giorni = giorniAllaScadenzaDashboard(dataRiferimento)

                return (
                  <div
                    className={`deadline-mini-row ${scadenza.stato}`}
                    key={scadenza.id}
                  >
                    <div>
                      <strong>{scadenza.impianto}</strong>
                      <p>{scadenza.condominio}</p>
                    </div>

                    <div>
                      <span>{scadenza.tipo}</span>
                      <small>Scadenza: {scadenza.data}</small>
                      <small>
                        Avviso:{" "}
                        {scadenza.avviso
                          ? `${scadenza.avviso} giorni prima`
                          : "Non impostato"}
                      </small>
                      {scadenza.data_avviso ? (
                        <small>Data avviso: {scadenza.data_avviso}</small>
                      ) : null}
                    </div>

                    <strong
                      className={
                        scadenza.stato === "rosso" ? "urgent-days" : ""
                      }
                    >
                      {giorni} gg
                    </strong>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
