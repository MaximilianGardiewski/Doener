import type { OAuthPort } from "@business-web/auth";
import {
  createLovableOAuthAdapter,
  type LovableOAuthBrokerLike,
} from "./lovable-oauth-adapter.ts";
import {
  createNativeSupabaseOAuthPort,
  type SupabaseOAuthClientLike,
} from "./native-supabase-oauth.ts";

export interface LebtigOAuthAdapters {
  supabase: SupabaseOAuthClientLike;
  lovableBroker?: LovableOAuthBrokerLike;
  /** Transitional escape hatch only while the Lovable-hosted source is being migrated. */
  useLegacyLovableBroker?: boolean;
}

export function createLebtigOAuthPort(adapters: LebtigOAuthAdapters): OAuthPort {
  if (adapters.useLegacyLovableBroker) {
    if (!adapters.lovableBroker) {
      throw new Error("Legacy Lovable OAuth broker requested but not provided");
    }
    return createLovableOAuthAdapter(adapters.lovableBroker);
  }

  return createNativeSupabaseOAuthPort(adapters.supabase);
}
