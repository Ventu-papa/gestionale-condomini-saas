import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const DANEA_API_BASE = "https://domustudioapi.danea.it"

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]

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
  }
}

function originConsentita(req: Request) {
  const origin = req.headers.get("Origin")
  return !origin || allowedOrigins().includes(origin)
}

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string>
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      ...securityHeaders,
      "Content-Type": "application/json",
    },
  })
}

function deniedOriginResponse(headers: Record<string, string>) {
  return jsonResponse(
    403,
    {
      success: false,
      message: "Origine non autorizzata.",
    },
    headers
  )
}

const noStoreHeaders = {
  "Cache-Control": "no-store",
}

function mergeHeaders(...headersList: Record<string, string>[]) {
  return Object.assign({}, ...headersList)
}

type DaneaCondominio = {
  id?: number
  intestazione?: string | null
  indirizzo?: string | null
  cap?: string | null
  citta?: string | null
  prov?: string | null
  codFisc?: string | null
}

type CondominioEsistente = {
  nome_condominio?: string | null
  indirizzo?: string | null
  comune?: string | null
  cod_fiscale?: string | null
}

function normalizza(valore: unknown) {
  return String(valore ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

function chiaveCondominio(condominio: CondominioEsistente) {
  const codiceFiscale = normalizza(condominio.cod_fiscale)

  if (codiceFiscale) {
    return `cf:${codiceFiscale}`
  }

  return [
    normalizza(condominio.nome_condominio),
    normalizza(condominio.indirizzo),
    normalizza(condominio.comune),
  ].join("|")
}

Deno.serve(async (req) => {
  const headers = mergeHeaders(corsHeaders(req), noStoreHeaders)
  const json = (status: number, body: Record<string, unknown>) =>
    jsonResponse(status, body, headers)

  if (req.method === "OPTIONS") {
    if (!originConsentita(req)) {
      return deniedOriginResponse(headers)
    }

    return new Response("ok", {
      headers,
    })
  }

  if (!originConsentita(req)) {
    return deniedOriginResponse(headers)
  }

  if (req.method !== "POST") {
    return json(405, {
      success: false,
      message: "Metodo non consentito.",
    })
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, {
        success: false,
        message: "Variabili Supabase mancanti.",
      })
    }

    const authHeader = req.headers.get("Authorization")

    if (!authHeader) {
      return json(401, {
        success: false,
        message: "Utente non autenticato.",
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace("Bearer ", "")

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return json(401, {
        success: false,
        message: "Sessione non valida.",
      })
    }

    const { data: connessione, error: connectionError } = await supabase
      .from("gestionale_connections")
      .select("id, api_key")
      .eq("user_id", user.id)
      .eq("provider", "danea")
      .eq("is_primary", true)
      .maybeSingle()

    if (connectionError) {
      return json(500, {
        success: false,
        message: connectionError.message,
      })
    }

    const apiKey = String(connessione?.api_key ?? "").trim()

    if (!apiKey) {
      return json(200, {
        success: false,
        message:
          "Danea Domustudio non e' ancora collegato. Inserisci una APIKey valida.",
      })
    }

    const daneaResponse = await fetch(`${DANEA_API_BASE}/api/external/condominio`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-version": "1.0",
        "X-DANEA-API-KEY": apiKey,
      },
    })

    if (!daneaResponse.ok) {
      await supabase
        .from("gestionale_connections")
        .update({ status: "error" })
        .eq("id", connessione.id)

      return json(200, {
        success: false,
        message:
          daneaResponse.status === 401
            ? "APIKey Danea non valida o non autorizzata."
            : `Errore Danea ${daneaResponse.status}. Riprova piu' tardi.`,
      })
    }

    const condominiDanea = (await daneaResponse.json()) as DaneaCondominio[]

    if (!Array.isArray(condominiDanea)) {
      return json(200, {
        success: false,
        message: "Risposta Danea non valida.",
      })
    }

    const { data: condominiEsistenti, error: existingError } = await supabase
      .from("condomini")
      .select("nome_condominio, indirizzo, comune, cod_fiscale")
      .eq("user_id", user.id)

    if (existingError) {
      return json(500, {
        success: false,
        message: existingError.message,
      })
    }

    const chiaviEsistenti = new Set(
      (condominiEsistenti ?? []).map((condominio: CondominioEsistente) =>
        chiaveCondominio(condominio)
      )
    )
    const chiaviImport = new Set<string>()

    const nuoviCondomini = condominiDanea
      .map((condominio) => ({
        tipo: "Condominio",
        nome:
          condominio.intestazione?.trim() ||
          `Condominio Danea ${condominio.id ?? ""}`.trim(),
        nome_condominio:
          condominio.intestazione?.trim() ||
          `Condominio Danea ${condominio.id ?? ""}`.trim(),
        cod_fiscale: condominio.codFisc?.trim() ?? "",
        indirizzo: condominio.indirizzo?.trim() ?? "",
        cap: condominio.cap?.trim() ?? "",
        comune: condominio.citta?.trim() ?? "",
        provincia: condominio.prov?.trim() ?? "",
        dati_catastali: "",
        email_notifiche: "",
        user_id: user.id,
      }))
      .filter((condominio) => {
        const chiave = chiaveCondominio(condominio)
        const duplicato = chiaviEsistenti.has(chiave) || chiaviImport.has(chiave)

        if (!duplicato) {
          chiaviImport.add(chiave)
        }

        return !duplicato
      })

    if (nuoviCondomini.length > 0) {
      const { error: insertError } = await supabase
        .from("condomini")
        .insert(nuoviCondomini)

      if (insertError) {
        return json(500, {
          success: false,
          message: insertError.message,
        })
      }
    }

    await supabase
      .from("gestionale_connections")
      .update({
        status: "connected",
        last_sync_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("id", connessione.id)

    return json(200, {
      success: true,
      message: "Danea Domustudio sincronizzato correttamente.",
      importedCount: nuoviCondomini.length,
      skippedCount: condominiDanea.length - nuoviCondomini.length,
      totalRemoteCount: condominiDanea.length,
    })
  } catch (error) {
    return json(500, {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Errore sconosciuto nella funzione sync-danea.",
    })
  }
})
