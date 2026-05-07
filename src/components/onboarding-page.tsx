import { useState } from "react"

type OnboardingPageProps = {
  onComplete: () => void
  onConnectGestionale: (provider: string, apiKey: string) => void
}

export default function OnboardingPage({
  onComplete,
  onConnectGestionale,
}: OnboardingPageProps) {
    const [apiKey, setApiKey] = useState("")
    const [showGestionaleModal, setShowGestionaleModal] = useState(false)
    const [gestionaleSelezionato, setGestionaleSelezionato] = useState("")
  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <p className="eyebrow">Configurazione iniziale</p>

        <h1>Imposta il tuo studio</h1>

        <p className="subtitle">
          Collega il gestionale già in uso oppure inizia manualmente.
        </p>

        <div className="onboarding-grid">
            <div
                className="onboarding-option onboarding-option-clickable"
                onClick={() => setShowGestionaleModal(true)}
            >
                <span>Integrazione</span>

                <strong>Collega il tuo gestionale</strong>

                <p>
                Connetti Danea, TeamSystem, Zucchetti oppure importa dati Excel/CSV.
                </p>

                <div className="gestionali-preview">
                <div className="gestionale-badge">Danea</div>
                <div className="gestionale-badge">TeamSystem</div>
                <div className="gestionale-badge">Zucchetti</div>
                <div className="gestionale-badge">Excel</div>
                </div>

                <button className="onboarding-connect">
                Configura integrazione
                </button>
            </div>

          <button className="onboarding-option onboarding-manual-card" onClick={onComplete}>
            <span>Setup manuale</span>
            <strong>Inizia senza collegamenti</strong>
            <p>
              Crea il primo studio e aggiungi condomìni, impianti e scadenze manualmente.
            </p>
          </button>
        </div>
      </section>
      {showGestionaleModal && (
        <div className="premium-modal">
            <div className="premium-modal-card">
            <div className="modal-header">
                <h2>Scegli il tuo gestionale</h2>

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

                <div
                className={`gestionale-card ${
                    gestionaleSelezionato === "excel" ? "active" : ""
                }`}
                onClick={() => setGestionaleSelezionato("excel")}
                >
                <strong>Excel / CSV</strong>
                <p>Importazione manuale avanzata</p>
                </div>
            </div>

            {gestionaleSelezionato && (
                <div className="gestionale-config-section">
                <h3>Configurazione</h3>

                {(gestionaleSelezionato === "danea" ||
                    gestionaleSelezionato === "teamsystem" ||
                    gestionaleSelezionato === "zucchetti") && (
                    <>
                    <input
                        className="onboarding-input"
                        placeholder="Inserisci API Key"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                    />

                    <button
                        className="premium-save-button"
                        onClick={() => onConnectGestionale(gestionaleSelezionato, apiKey)}
                    >
                        Collega gestionale
                    </button>
                    </>
                )}

                {gestionaleSelezionato === "excel" && (
                    <div className="excel-import-info">
                    <p>
                        Potrai importare condomìni, anagrafiche e impianti tramite
                        file Excel o CSV.
                    </p>

                    <button
                      className="premium-save-button"
                      onClick={() => onConnectGestionale("excel", "")}
                    >
                      Continua con Excel / CSV
                    </button>
                    </div>
                )}
                </div>
            )}
            </div>
        </div>
    )}
    </main>
  )
}