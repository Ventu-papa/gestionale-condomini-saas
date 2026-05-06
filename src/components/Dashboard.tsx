import type { Page } from "../types"
import { modules } from "../data/constants"

type DashboardProps = {
  setPage: (page: Page) => void
  userEmail?: string
  ticketAperti: number
  scadenzeUrgenti: number
}

export default function Dashboard({
  setPage,
  userEmail,
  ticketAperti,
  scadenzeUrgenti,
}: DashboardProps) {
  return (
  <section className="dashboard-premium">
        {/* ===============================
            HEADER PREMIUM DASHBOARD
        =============================== */}
        <header className="dashboard-header-pro">
          <div className="brand-area">
            <div className="brand-logo-pro">
              <span>GV</span>
            </div>

            <div>
              <p>Gestionale Studio Ventura</p>
              <h1>Bentornato Pietro</h1>
            </div>
          </div>

          <div className="header-right-pro">
            <span>{userEmail}</span>

            <div className="header-stats-pro">
              <strong>{ticketAperti}</strong>
              <small>ticket aperti</small>
            </div>

            <div className="header-stats-pro urgent">
              <strong>{scadenzeUrgenti}</strong>
              <small>scadenze urgenti</small>
            </div>
          </div>
        </header>

        {/* ===============================
            CARD MODULI DASHBOARD
        =============================== */}
        <div className="dashboard-grid">
          {modules.map((module) => (
            <button
              key={module.page}
              className="dashboard-card"
              onClick={() => setPage(module.page)}
            >
              <span>{module.status}</span>
              <h2>{module.title}</h2>
              <p>{module.description}</p>
            </button>
          ))}
        </div>
      </section>
  )
}