import type { RpcClient } from "./rest-rpc.ts";

export interface PickupSlot {
  startsAt: string;
  localDate: string;
  localTime: string;
  capacity: number;
  occupied: number;
  remaining: number;
}

export interface PickupSlotSnapshot {
  locationId: string;
  timezone?: string;
  slotMinutes: number | null;
  generatedAt?: string;
  slots: PickupSlot[];
}

export class SupabasePickupSlotReader {
  private readonly rpcClient: RpcClient;

  constructor(rpcClient: RpcClient) {
    this.rpcClient = rpcClient;
  }

  getAvailable(locationId: string, from = new Date().toISOString(), days = 7): Promise<PickupSlotSnapshot> {
    return this.rpcClient.rpc<PickupSlotSnapshot>("get_available_pickup_slots", {
      _location_id: locationId,
      _from: from,
      _days: days,
    });
  }
}
