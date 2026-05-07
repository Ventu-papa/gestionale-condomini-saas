import type { Page } from "../types"

type SidebarProps = {
  page: Page
  setPage: (page: Page) => void
  userEmail?: string
  onLogout: () => void
  mobileOpen?: boolean
  onCloseMobile?: () => void
}

const items = [
  { id: "home", label: "Dashboard" },
  { id: "condomini", label: "Condomìni" },
  { id: "ticket", label: "Ticket" },
  { id: "documenti", label: "Documenti" },
  { id: "timelineGlobale", label: "Timeline" },
  { id: "scadenze", label: "Scadenze" },
]

export default function Sidebar({
  page,
  setPage,
  userEmail,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  return (
   <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
    <button
      className="sidebar-mobile-close"
      onClick={onCloseMobile}
    >
      ×
    </button>
      {/* ===============================
          BRAND SOFTWARE
      =============================== */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">GV</div>

        <div>
          <strong>Studio Ventura</strong>
          <p>Operational Platform</p>
        </div>
      </div>

      {/* ===============================
          NAVIGAZIONE PRINCIPALE
      =============================== */}
      <nav className="sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${page === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id as Page)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* ===============================
          PROFILO UTENTE + LOGOUT
      =============================== */}
      <div className="sidebar-profile">
        <span>{userEmail}</span>

        <button onClick={onLogout}>
          Esci
        </button>
      </div>
    </aside>
  )
}