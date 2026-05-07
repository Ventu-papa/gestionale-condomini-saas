import { useState } from "react"

type OnboardingPageProps = {
  onComplete: () => void
  onConnectDanea: (apiKey: string) => void
  onImportExcel: (file: File) => void
}

export default function OnboardingPage({
  onComplete,
  onConnectDanea,
  onImportExcel,
}: OnboardingPageProps) {
    const [apiKey, setApiKey] = useState("")
  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <p className="eyebrow">Configurazione iniziale</p>

        <h1>Imposta il tuo studio</h1>

        <p className="subtitle">
          Collega il gestionale già in uso oppure inizia manualmente.
        </p>

        <div className="onboarding-grid">
          <div className="onboarding-option">
            <span>Integrazione</span>

            <strong>Collega Danea</strong>

            <p>
                Importa automaticamente condomìni, anagrafiche e dati disponibili.
            </p>

            <input
                className="onboarding-input"
                placeholder="Inserisci API Key Danea"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
            />

            <button
                className="onboarding-connect"
                onClick={() => onConnectDanea(apiKey)}
            >
                Collega gestionale
            </button>
            </div>

         <div className="onboarding-option">
            <span>Importazione</span>

            <strong>Importa Excel / CSV</strong>

            <p>
                Carica un file con colonne: nome, indirizzo, comune, email_notifiche.
            </p>

            <input
                className="onboarding-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                const file = e.target.files?.[0]

                if (file) {
                    onImportExcel(file)
                }
                }}
            />
            </div>

          <button className="onboarding-option" onClick={onComplete}>
            <span>Manuale</span>
            <strong>Continua manualmente</strong>
            <p>Crea i condomìni a mano e configura lo studio più avanti.</p>
          </button>
        </div>
      </section>
    </main>
  )
}