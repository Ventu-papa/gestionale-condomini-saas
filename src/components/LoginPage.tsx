// Componente schermata login

import { supabase } from "../supabase"
import { useToast } from "../hooks/useToast"

type LoginPageProps = {
  form: {
    email: string
    password: string
  }
  setForm: React.Dispatch<
    React.SetStateAction<{
      email: string
      password: string
    }>
  >
}

function LoginPage({ form, setForm }: LoginPageProps) {
  const { showError } = useToast()

  async function accedi() {
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password,
    })

    if (error) {
      showError("Accesso non riuscito. Controlla email e password.")
    }
  }

  return (
    <main className="login-page" translate="no">
      <section className="login-card">
        <p className="eyebrow">Gestionale Studio</p>
        <h1>Accedi alla piattaforma</h1>
        <p className="login-subtitle">
          Gestisci condomìni, comunicazioni, documenti e scadenze in un unico ambiente operativo.
        </p>
        <p className="login-access-note">
          L'accesso è riservato agli account abilitati dallo studio.
        </p>

        <div className="login-form">
          <input
            placeholder="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <input
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                accedi()
              }
            }}
          />

          <div className="login-actions">
            <button
              onClick={accedi}
              disabled={!form.email.trim() || !form.password}
            >
              Accedi
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default LoginPage
