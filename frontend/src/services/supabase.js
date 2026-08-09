import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://dplzsinymsoyudtlabhd.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwbHpzaW55bXNveXVkdGxhYmhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNDU0MDIsImV4cCI6MjEwMTgyMTQwMn0.o77vKrX3HJF7b5qJmizA3-1VScwVj5om6zbPhYTrNyM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});
