import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

export const hasSupabaseConfig =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
