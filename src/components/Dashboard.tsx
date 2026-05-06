// Componente dashboard principale dopo il login

import type { Page } from "../types"
import { modules } from "../data/constants"
type DashboardProps = {
  setPage: React.Dispatch<React.SetStateAction<Page>>
}

function Dashboard({ setPage }: DashboardProps) {
  return (
    <main className="app-shell">
      <section className="dashboard">
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