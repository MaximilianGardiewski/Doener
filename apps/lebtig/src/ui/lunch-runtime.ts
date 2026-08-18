import type { LebtigLunchCmsPort } from "../cms/lunch.ts";
import { createSupabaseLunchCmsPort } from "../cms/supabase-lunch.ts";
import {
  createLebtigAnonymousSupabaseClient,
  getLebtigSessionSupabaseClient,
} from "./supabase-browser.ts";

export interface LebtigLunchRuntime {
  configured: boolean;
  port: LebtigLunchCmsPort | null;
}

export function createLebtigPublicLunchRuntime(): LebtigLunchRuntime {
  const client = createLebtigAnonymousSupabaseClient();
  return {
    configured: Boolean(client),
    port: client ? createSupabaseLunchCmsPort(client) : null,
  };
}

export function createLebtigStaffLunchRuntime(): LebtigLunchRuntime {
  const client = getLebtigSessionSupabaseClient();
  return {
    configured: Boolean(client),
    port: client ? createSupabaseLunchCmsPort(client) : null,
  };
}
