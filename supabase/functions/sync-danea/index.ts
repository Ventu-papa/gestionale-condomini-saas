import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Variabili Supabase mancanti", { status: 500 })
  }

  const authHeader = req.headers.get("Authorization")

  if (!authHeader) {
    return new Response("Utente non autenticato", { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const token = authHeader.replace("Bearer ", "")

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token)

  if (userError || !user) {
    return new Response("Sessione non valida", { status: 401 })
  }

  const { data: settings, error } = await supabase
    .from("studio_settings")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (error || !settings?.danea_enabled || !settings?.danea_api_key) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Danea non è ancora collegato.",
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: "Danea collegato correttamente. Sincronizzazione pronta.",
    }),
    { headers: { "Content-Type": "application/json" } }
  )
})