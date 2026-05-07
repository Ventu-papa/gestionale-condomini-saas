// Componente schermata login / registrazione

import { supabase } from "../supabase"

type LoginPageProps = {
  form: {
    nome: string
    indirizzo: string
    comune: string
    email_notifiche: string
    email: string
    password: string
  }
  setForm: React.Dispatch<React.SetStateAction<{
    nome: string
    indirizzo: string
    comune: string
    email_notifiche: string
    email: string
    password: string
  }>>
}

function LoginPage({ form, setForm }: LoginPageProps) {
  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">Gestionale Studio</p>
        <h1>Accedi alla piattaforma</h1>
        <p className="login-subtitle">
          Gestisci condomìni, comunicazioni, documenti e scadenze in un unico ambiente operativo.
        </p>

        <div className="login-form">
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <input
            placeholder="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                supabase.auth.signInWithPassword({
                  email: form.email,
                  password: form.password,
                })
              }
            }}
          />

          <div className="login-actions">
            <button
              onClick={async () => {
                await supabase.auth.signInWithPassword({
                  email: form.email,
                  password: form.password,
                })
              }}
            >
              Accedi
            </button>

            <button
              className="secondary"
              onClick={async () => {
                await supabase.auth.signUp({
                  email: form.email,
                  password: form.password,
                })
              }}
            >
              Registrati
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default LoginPage