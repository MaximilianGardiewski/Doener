import type { ShopStatusInput } from "../../core/src/shop-status.ts";
import type { MenuProduct } from "../../menu-engine/src/model.ts";
import type { CatalogReader, ShopStateReader, SlotReader } from "../../ordering/src/checkout.ts";
import type { RpcClient } from "./rest-rpc.ts";

export class SupabaseCatalogReader implements CatalogReader {
  private readonly rpcClient: RpcClient;

  constructor(rpcClient: RpcClient) {
    this.rpcClient = rpcClient;
  }

  async getProduct(productId: string): Promise<MenuProduct | null> {
    return this.rpcClient.rpc<MenuProduct | null>("server_get_checkout_product", {
      _product_id: productId,
    });
  }

  async isProductAvailable(productId: string, at: string): Promise<boolean> {
    return this.rpcClient.rpc<boolean>("server_is_product_available", {
      _product_id: productId,
      _at: at,
    });
  }
}

export class SupabaseShopStateReader implements ShopStateReader {
  private readonly rpcClient: RpcClient;

  constructor(rpcClient: RpcClient) {
    this.rpcClient = rpcClient;
  }

  async getShopState(locationId: string, at: string): Promise<ShopStatusInput> {
    return this.rpcClient.rpc<ShopStatusInput>("server_get_shop_state", {
      _location_id: locationId,
      _at: at,
    });
  }
}

export class SupabaseSlotReader implements SlotReader {
  private readonly rpcClient: RpcClient;

  constructor(rpcClient: RpcClient) {
    this.rpcClient = rpcClient;
  }

  async getSlotCapacity(locationId: string, pickupAt: string): Promise<{
    capacity: number;
    acceptedOrderCount: number;
  }> {
    return this.rpcClient.rpc("server_get_slot_capacity", {
      _location_id: locationId,
      _pickup_at: pickupAt,
    });
  }
}
