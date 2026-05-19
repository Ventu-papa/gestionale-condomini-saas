// ===============================
// EDGE FUNCTION: INVIO SCADENZE VIA EMAIL
// ===============================

// Questa funzione controlla le scadenze vicine
// e invia un riepilogo via email all'amministratore.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

type Impianto = {
  tipo?: string
  nome?: string
  manutenzione?: string
  contratto_manutenzione?: string
}

type Condominio = {
  nome?: string
  nome_condominio?: string
  email_notifiche?: string
  impianti?: Impianto[]
}

type ScadenzaUrgente = {
  condominio: string
  impianto: string
  descrizione: string
  tipo: string
  data: string
  giorni: number
  email: string
}

function nomeCondominio(condominio: Condominio) {
  return condominio.nome || condominio.nome_condominio || "Condominio"
}

function giorniAllaScadenza(data: string) {
  const oggi = new Date()
  const scadenza = new Date(data)

  oggi.setHours(0, 0, 0, 0)
  scadenza.setHours(0, 0, 0, 0)

  return Math.ceil(
    (scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
  )
}

Deno.serve(async () => {
  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Variabili ambiente mancanti", { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: condomini, error } = await supabase
    .from("condomini")
    .select("*")

  if (error) {
    return new Response(error.message, { status: 500 })
  }

  const scadenzeUrgenti =
    condomini
      ?.flatMap((condominio: Condominio) =>
        (condominio.impianti ?? []).flatMap((impianto) => {
          const scadenze: ScadenzaUrgente[] = []

          if (impianto.manutenzione) {
            scadenze.push({
              condominio: nomeCondominio(condominio),
              impianto: impianto.tipo ?? "Impianto",
              descrizione: impianto.nome ?? "",
              tipo: "Manutenzione",
              data: impianto.manutenzione,
              giorni: giorniAllaScadenza(impianto.manutenzione),
              email: condominio.email_notifiche ?? "",
            })
          }

          if (impianto.contratto_manutenzione) {
            scadenze.push({
              condominio: nomeCondominio(condominio),
              impianto: impianto.tipo ?? "Impianto",
              descrizione: impianto.nome ?? "",
              tipo: "Contratto manutenzione",
              data: impianto.contratto_manutenzione,
              giorni: giorniAllaScadenza(impianto.contratto_manutenzione),
              email: condominio.email_notifiche ?? "",
            })
          }

          return scadenze
        })
      )
      .filter(
        (s: ScadenzaUrgente) => s.giorni >= 0 && s.giorni <= 30 && s.email
      ) ?? []

  if (scadenzeUrgenti.length === 0) {
    return new Response("Nessuna scadenza urgente da notificare")
  }

  const gruppiPerEmail = scadenzeUrgenti.reduce<
    Record<string, ScadenzaUrgente[]>
  >((acc, scadenza) => {
    acc[scadenza.email] = acc[scadenza.email] || []
    acc[scadenza.email].push(scadenza)
    return acc
  }, {})

  for (const email of Object.keys(gruppiPerEmail)) {
    const righe = gruppiPerEmail[email]
      .map(
        (s) => `
          <li>
            <strong>${s.condominio}</strong> — ${s.impianto}<br/>
            ${s.tipo}: ${s.data} (${s.giorni} giorni)
          </li>
        `
      )
      .join("")

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Gestionale Studio Ventura <onboarding@resend.dev>",
        to: [email],
        subject: "Scadenze urgenti condominiali",
        html: `
          <h2>Scadenze urgenti</h2>
          <p>Queste scadenze sono entro 30 giorni:</p>
          <ul>${righe}</ul>
        `,
      }),
    })
  }

  return new Response("Email inviate correttamente")
})
