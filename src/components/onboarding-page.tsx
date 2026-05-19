import { useState } from "react"

type OnboardingPageProps = {
  onComplete: () => void
  onConnectGestionale: (provider: string, apiKey: string) => Promise<boolean>
}

export default function OnboardingPage({
  onComplete,
  onConnectGestionale,
}: OnboardingPageProps) {
  const [apiKey, setApiKey] = useState("")
  const [showGestionaleModal, setShowGestionaleModal] = useState(false)
  const [gestionaleSelezionato, setGestionaleSelezionato] = useState<
    "danea" | "excel" | ""
  >("")

  async function collegaGestionale(provider: "danea" | "excel") {
    const collegato = await onConnectGestionale(provider, apiKey)

    if (!collegato) return

    setShowGestionaleModal(false)
    onComplete()
  }

  return (
    <main className="onboarding-page" translate="no">
      <section className="onboarding-card">
        <p className="eyebrow">Configurazione iniziale</p>

        <h1>Imposta il tuo studio</h1>

        <p className="subtitle">
          Collega Danea Domustudio oppure inizia manualmente.
        </p>

        <div className="onboarding-grid">
          <div
            className="onboarding-option onboarding-option-clickable"
            onClick={() => setShowGestionaleModal(true)}
          >
            <span>Integrazione</span>

            <strong>Collega Danea Domustudio</strong>

            <p>
              Usa la APIKey di Domustudio Cloud Pro per importare e sincronizzare
              i condomini dello studio.
            </p>

            <div className="gestionali-preview">
              <div className="gestionale-badge">Danea Domustudio</div>
              <div className="gestionale-badge">Excel / CSV</div>
            </div>

            <button className="onboarding-connect">
              Configura integrazione
            </button>
          </div>

          <button
            className="onboarding-option onboarding-manual-card"
            onClick={onComplete}
          >
            <span>Setup manuale</span>
            <strong>Inizia senza collegamenti</strong>
            <p>
              Crea il primo studio e aggiungi condomini, impianti e scadenze
              manualmente.
            </p>
          </button>
        </div>
      </section>

      {showGestionaleModal && (
        <div className="premium-modal">
          <div className="premium-modal-card">
            <div className="modal-header">
              <h2>Scegli come partire</h2>

              <button
                className="icon-button"
                onClick={() => setShowGestionaleModal(false)}
              >
                x
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
                <p>Connessione API ufficiale per Domustudio Cloud Pro.</p>
              </div>

              <div
                className={`gestionale-card ${
                  gestionaleSelezionato === "excel" ? "active" : ""
                }`}
                onClick={() => setGestionaleSelezionato("excel")}
              >
                <strong>Excel / CSV</strong>
                <p>Importazione manuale dei dati gia' esportati.</p>
              </div>
            </div>

            {gestionaleSelezionato && (
              <div className="gestionale-config-section">
                <h3>
                  {gestionaleSelezionato === "danea"
                    ? "Configurazione Danea"
                    : "Import manuale"}
                </h3>

                {gestionaleSelezionato === "danea" ? (
                  <>
                    <p className="settings-note">
                      Inserisci la APIKey creata in Domustudio Cloud Pro.
                    </p>

                    <input
                      className="onboarding-input"
                      placeholder="APIKey Domustudio"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />

                    <button
                      className="premium-save-button"
                      onClick={() => collegaGestionale("danea")}
                    >
                      Collega e sincronizza
                    </button>
                  </>
                ) : (
                  <div className="excel-import-info">
                    <p>
                      Potrai importare condomini, anagrafiche e impianti tramite
                      file Excel o CSV.
                    </p>

                    <button
                      className="premium-save-button"
                      onClick={() => collegaGestionale("excel")}
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
