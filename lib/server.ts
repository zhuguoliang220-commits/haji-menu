import { createClient } from "@supabase/supabase-js";

export const appAccessCode = process.env.APP_ACCESS_CODE || "haji-love";

export function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function isAuthorized(request: Request) {
  return request.headers.get("x-app-code") === appAccessCode;
}

export function unauthorized() {
  return Response.json({ error: "访问码不正确" }, { status: 401 });
}

export function missingSupabase() {
  return Response.json(
    {
      error: "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    },
    { status: 503 }
  );
}
