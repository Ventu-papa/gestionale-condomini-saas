// ===============================
// EDGE FUNCTION: INVIO SCADENZE VIA EMAIL
// ===============================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]

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

function allowedOrigins() {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? ""
  const origins = allowedOrigins()
  const allowedOrigin = origins.includes(origin) ? origin : origins[0] ?? ""

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  }
}

function originConsentita(req: Request) {
  const origin = req.headers.get("Origin")
  return !origin || allowedOrigins().includes(origin)
}

function textResponse(
  status: number,
  message: string,
  headers: Record<string, string>
) {
  return new Response(message, {
    status,
    headers: {
      ...headers,
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
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

Deno.serve(async (req) => {
  const headers = corsHeaders(req)

  if (req.method === "OPTIONS") {
    if (!originConsentita(req)) {
      return textResponse(403, "Origine non autorizzata", headers)
    }

    return new Response("ok", { headers })
  }

  if (!originConsentita(req)) {
    return textResponse(403, "Origine non autorizzata", headers)
  }

  if (req.method !== "POST") {
    return textResponse(405, "Metodo non consentito", headers)
  }

  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return textResponse(500, "Variabili ambiente mancanti", headers)
  }

  const authHeader = req.headers.get("Authorization")

  if (!authHeader) {
    return textResponse(401, "Utente non autenticato", headers)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const token = authHeader.replace("Bearer ", "")

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token)

  if (userError || !user) {
    return textResponse(401, "Sessione non valida", headers)
  }

  const { data: condomini, error } = await supabase
    .from("condomini")
    .select("*")
    .eq("user_id", user.id)

  if (error) {
    return textResponse(500, error.message, headers)
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
    return textResponse(200, "Nessuna scadenza urgente da notificare", headers)
  }

  const gruppiPerEmail = scadenzeUrgenti.reduce<
    Record<string, ScadenzaUrgente[]>
  >((acc, scadenza) => {
    acc[scadenza.email] = acc[scadenza.email] || []
    acc[scadenza.email].push(scadenza)
    return acc
  }, {})

  const emailFallite: string[] = []

  for (const email of Object.keys(gruppiPerEmail)) {
    const righe = gruppiPerEmail[email]
      .map(
        (s) => `
          <li>
            <strong>${escapeHtml(s.condominio)}</strong> - ${escapeHtml(
              s.impianto
            )}<br/>
            ${escapeHtml(s.tipo)}: ${escapeHtml(s.data)} (${s.giorni} giorni)
          </li>
        `
      )
      .join("")

    const resendResponse = await fetch("https://api.resend.com/emails", {
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

    if (!resendResponse.ok) {
      emailFallite.push(email)
    }
  }

  if (emailFallite.length > 0) {
    return textResponse(
      502,
      `Email non inviate per: ${emailFallite.join(", ")}`,
      headers
    )
  }

  return textResponse(200, "Email inviate correttamente", headers)
})
