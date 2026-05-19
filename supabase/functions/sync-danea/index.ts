import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const DANEA_API_BASE = "https://domustudioapi.danea.it"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
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
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    })
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        success: false,
        message: "Variabili Supabase mancanti.",
      })
    }

    const authHeader = req.headers.get("Authorization")

    if (!authHeader) {
      return jsonResponse(401, {
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
      return jsonResponse(401, {
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
      return jsonResponse(500, {
        success: false,
        message: connectionError.message,
      })
    }

    const apiKey = String(connessione?.api_key ?? "").trim()

    if (!apiKey) {
      return jsonResponse(200, {
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

      return jsonResponse(200, {
        success: false,
        message:
          daneaResponse.status === 401
            ? "APIKey Danea non valida o non autorizzata."
            : `Errore Danea ${daneaResponse.status}. Riprova piu' tardi.`,
      })
    }

    const condominiDanea = (await daneaResponse.json()) as DaneaCondominio[]

    if (!Array.isArray(condominiDanea)) {
      return jsonResponse(200, {
        success: false,
        message: "Risposta Danea non valida.",
      })
    }

    const { data: condominiEsistenti, error: existingError } = await supabase
      .from("condomini")
      .select("nome_condominio, indirizzo, comune, cod_fiscale")
      .eq("user_id", user.id)

    if (existingError) {
      return jsonResponse(500, {
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
        return jsonResponse(500, {
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
      .eq("id", connessione.id)

    return jsonResponse(200, {
      success: true,
      message: "Danea Domustudio sincronizzato correttamente.",
      importedCount: nuoviCondomini.length,
      skippedCount: condominiDanea.length - nuoviCondomini.length,
      totalRemoteCount: condominiDanea.length,
    })
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Errore sconosciuto nella funzione sync-danea.",
    })
  }
})
