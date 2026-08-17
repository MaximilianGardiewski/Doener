import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseRestRpcClient, SupabaseRpcError, type RpcClient } from "../src/rest-rpc.ts";
import { SupabaseOrderWriter, SupabasePublicOrderStatusReader } from "../src/order-repository.ts";
import { SupabaseKdsOperations, subscribeToKdsOrders } from "../src/kds.ts";

const dbOrder = {
  id: "order-1",
  public_token: "token-1",
  order_number: 42,
  location_id: "location-1",
  source: "web" as const,
  fulfillment: "pickup" as const,
  state: "waiting_for_acceptance" as const,
  customer_first_name: "Maxi",
  mobile: "+491701234567",
  total_cents: 900,
  submitted_at: "2026-08-14T18:00:00.000Z",
};

test("REST RPC client sends apikey and optional bearer token", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const client = new SupabaseRestRpcClient({
    baseUrl: "http://127.0.0.1:54321/",
    apiKey: "publishable",
    authorizationToken: "staff-jwt",
    fetchImpl: async (url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  const result = await client.rpc<{ ok: boolean }>("hello", { value: 1 });
  assert.equal(result.ok, true);
  assert.equal(seenUrl, "http://127.0.0.1:54321/rest/v1/rpc/hello");
  const headers = seenInit?.headers as Record<string, string>;
  assert.equal(headers.apikey, "publishable");
  assert.equal(headers.authorization, "Bearer staff-jwt");
  assert.equal(seenInit?.body, JSON.stringify({ value: 1 }));
});

test("REST RPC client surfaces PostgREST error payload", async () => {
  const client = new SupabaseRestRpcClient({
    baseUrl: "http://localhost:54321",
    apiKey: "key",
    fetchImpl: async () => new Response(
      JSON.stringify({ code: "23514", message: "order total does not match line totals" }),
      { status: 400 },
    ),
  });

  await assert.rejects(client.rpc("server_create_verified_order"), (error: unknown) => {
    assert.equal(error instanceof SupabaseRpcError, true);
    assert.equal((error as SupabaseRpcError).status, 400);
    assert.match((error as Error).message, /order total/);
    return true;
  });
});

test("order writer persists through the server-only atomic RPC", async () => {
  let call: { name: string; args?: Record<string, unknown> } | undefined;
  const rpc: RpcClient = {
    async rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
      call = { name, args };
      return dbOrder as T;
    },
  };
  const writer = new SupabaseOrderWriter(rpc);
  const order = await writer.create({
    locationId: "location-1",
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    customerFirstName: "Maxi",
    mobile: "+491701234567",
    requestedPickupAt: null,
    totalCents: 900,
    submittedAt: "2026-08-14T18:00:00.000Z",
    items: [{
      productId: "product-1",
      productNameSnapshot: "Test",
      quantity: 1,
      unitPriceCentsSnapshot: 900,
      lineTotalCents: 900,
      selections: [],
    }],
  });

  assert.equal(call?.name, "server_create_verified_order");
  assert.equal(order.publicToken, "token-1");
  assert.equal(order.orderNumber, 42);
  assert.equal(order.state, "waiting_for_acceptance");
});

test("public reader only needs the random public token", async () => {
  const calls: string[] = [];
  const rpc: RpcClient = {
    async rpc<T>(name: string): Promise<T> {
      calls.push(name);
      return {
        id: "order-1",
        orderNumber: 42,
        state: "waiting_for_acceptance",
        customerFirstName: "Maxi",
        totalCents: 900,
        items: [],
      } as T;
    },
  };
  const reader = new SupabasePublicOrderStatusReader(rpc);
  assert.equal((await reader.get("token-1"))?.orderNumber, 42);
  assert.equal((await reader.cancelPending("token-1")).state, "waiting_for_acceptance");
  assert.deepEqual(calls, ["get_public_order_status", "customer_cancel_pending_order"]);
});

test("KDS operations use narrow staff RPCs", async () => {
  let functionName = "";
  const rpc: RpcClient = {
    async rpc<T>(name: string): Promise<T> {
      functionName = name;
      return { ...dbOrder, state: "preparing" } as T;
    },
  };
  const kds = new SupabaseKdsOperations(rpc);
  const order = await kds.accept("order-1", "2026-08-14T18:20:00.000Z");
  assert.equal(functionName, "staff_accept_order");
  assert.equal(order.state, "preparing");
});

test("KDS realtime subscription is location-scoped", async () => {
  let seenName = "";
  let seenFilter = "";
  let unsubscribed = false;
  const channel = {
    on(_type: "postgres_changes", filter: { filter?: string }) {
      seenFilter = filter.filter ?? "";
      return this;
    },
    subscribe() { return this; },
    async unsubscribe() { unsubscribed = true; },
  };
  const client = {
    channel(name: string) {
      seenName = name;
      return channel;
    },
  };

  const stop = subscribeToKdsOrders({
    client,
    locationId: "location-1",
    onChange() {},
  });
  assert.equal(seenName, "kds:location-1");
  assert.equal(seenFilter, "location_id=eq.location-1");
  await stop();
  assert.equal(unsubscribed, true);
});
