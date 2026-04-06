import { createClient } from "@supabase/supabase-js";
import { config, requireConfig } from "./config.mjs";

let client;

export function getSupabaseAdmin() {
  if (!client) {
    requireConfig(["supabaseUrl", "supabaseServiceRoleKey"]);
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return client;
}
