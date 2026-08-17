import type { RpcClient } from "./rest-rpc.ts";

export interface MaintenanceItem {
  orderId: string;
  orderNumber: number;
  publicToken?: string;
  mobile?: string;
  kind: string;
}

export interface OrderMaintenanceResult {
  processedAt: string;
  warnings: MaintenanceItem[];
  rejected: MaintenanceItem[];
  activated: MaintenanceItem[];
}

export class SupabaseOrderMaintenance {
  private readonly rpcClient: RpcClient;

  constructor(rpcClient: RpcClient) {
    this.rpcClient = rpcClient;
  }

  run(at = new Date().toISOString()): Promise<OrderMaintenanceResult> {
    return this.rpcClient.rpc<OrderMaintenanceResult>("server_process_order_maintenance", {
      _now: at,
    });
  }
}
