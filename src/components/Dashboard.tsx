// Componente dashboard principale dopo il login

import type { Page } from "../types"
import { modules } from "../data/constants"
import { supabase } from "../supabase"

type DashboardProps = {
  setPage: React.Dispatch<React.SetStateAction<Page>>
}

function Dashboard({ setPage }: DashboardProps) {
  return (
    <main className="app-shell">
      <section className="dashboard">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Gestionale Studio</p>
            <h1>Piattaforma operativa condominiale</h1>
            <p className="subtitle">
              Un unico centro di lavoro per condomini, comunicazioni, documenti,
              ticket e scadenze.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => setPage("condomini")}>
              Nuovo condominio
            </button>

            <button
              className="secondary"
              onClick={async () => {
                await supabase.auth.signOut()
              }}
            >
              Logout
            </button>
          </div>
        </div>

        <div className="module-grid">
          {modules.map((module) => (
            <button
              className="module-card"
              key={module.title}
              onClick={() => setPage(module.page)}
            >
              <span>{module.status}</span>
              <h2>{module.title}</h2>
              <p>{module.description}</p>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

export default Dashboard