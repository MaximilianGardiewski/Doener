export interface SlotCapacityInput {
  capacity: number;
  acceptedOrderCount: number;
}

export function hasSlotCapacity(input: SlotCapacityInput): boolean {
  return input.acceptedOrderCount < input.capacity;
}

export interface CapacityPreparation {
  slotMinutes: 15;
  effortWeight?: number;
}

export const defaultCapacityPreparation: CapacityPreparation = {
  slotMinutes: 15,
};
