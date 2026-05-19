import type { Page } from "../types"

type SidebarProps = {
  page: Page
  setPage: (page: Page) => void
  userEmail?: string
  onLogout: () => void
  mobileOpen?: boolean
  onCloseMobile?: () => void
}

const items: { id: Page; label: string }[] = [
  { id: "home", label: "Dashboard" },
  { id: "condomini", label: "Condomini" },
  { id: "fornitori", label: "Fornitori" },
  { id: "ticket", label: "Ticket" },
  { id: "documenti", label: "Documenti" },
  { id: "timelineGlobale", label: "Timeline" },
  { id: "scadenze", label: "Scadenze" },
  { id: "comunicazioni", label: "Comunicazioni" },
  { id: "impostazioni", label: "Impostazioni" },
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
        type="button"
        onClick={onCloseMobile}
        aria-label="Chiudi menu"
      >
        x
      </button>

      <div className="sidebar-brand">
        <div className="sidebar-logo">GV</div>

        <div>
          <strong>Studio Ventura</strong>
          <p>Piattaforma operativa</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${page === item.id ? "active" : ""}`}
            type="button"
            onClick={() => setPage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-profile">
        <span>{userEmail}</span>

        <button type="button" onClick={onLogout}>
          Esci
        </button>
      </div>
    </aside>
  )
}
