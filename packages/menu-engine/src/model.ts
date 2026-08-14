export type DietaryTag = "vegetarian" | "vegan" | "spicy";

export interface Allergen {
  id: string;
  code?: string;
  name: string;
}

export interface ModifierOption {
  id: string;
  name: string;
  priceDeltaCents: number;
  defaultSelected?: boolean;
  soldOut?: boolean;
  allergenIds?: string[];
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

export interface MenuProduct {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  basePriceCents: number;
  image?: string;
  bestseller?: boolean;
  soldOut?: boolean;
  dietaryTags?: DietaryTag[];
  allergenIds?: string[];
  modifierGroups?: ModifierGroup[];
  ownerConfirmed?: boolean;
  sourceNote?: string;
}

export interface ProductSelection {
  groupId: string;
  optionIds: string[];
}

export interface ConfigurationValidation {
  valid: boolean;
  errors: string[];
}

export function validateConfiguration(
  product: MenuProduct,
  selections: readonly ProductSelection[],
): ConfigurationValidation {
  const errors: string[] = [];
  const groups = product.modifierGroups ?? [];
  const knownGroups = new Map(groups.map((group) => [group.id, group]));
  const seenGroups = new Set<string>();

  for (const selection of selections) {
    if (!knownGroups.has(selection.groupId)) {
      errors.push(`Unbekannte Auswahlgruppe ${selection.groupId}`);
      continue;
    }
    if (seenGroups.has(selection.groupId)) {
      errors.push(`${knownGroups.get(selection.groupId)?.name}: Gruppe doppelt übermittelt`);
    }
    seenGroups.add(selection.groupId);

    if (new Set(selection.optionIds).size !== selection.optionIds.length) {
      errors.push(`${knownGroups.get(selection.groupId)?.name}: Option doppelt übermittelt`);
    }
  }

  const byGroup = new Map(selections.map((selection) => [selection.groupId, selection]));

  for (const group of groups) {
    const selection = byGroup.get(group.id);
    const optionIds = selection?.optionIds ?? [];

    if (optionIds.length < group.minSelections) {
      errors.push(`${group.name}: mindestens ${group.minSelections} Auswahl`);
    }
    if (optionIds.length > group.maxSelections) {
      errors.push(`${group.name}: maximal ${group.maxSelections} Auswahl`);
    }

    const known = new Set(group.options.map((option) => option.id));
    for (const optionId of optionIds) {
      if (!known.has(optionId)) {
        errors.push(`${group.name}: unbekannte Option ${optionId}`);
        continue;
      }
      const option = group.options.find((item) => item.id === optionId);
      if (option?.soldOut) {
        errors.push(`${group.name}: ${option.name} ist heute ausverkauft`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function calculateConfiguredPriceCents(
  product: MenuProduct,
  selections: readonly ProductSelection[],
): number {
  let total = product.basePriceCents;
  const selected = new Map(selections.map((selection) => [selection.groupId, selection.optionIds]));

  for (const group of product.modifierGroups ?? []) {
    for (const option of group.options) {
      if (selected.get(group.id)?.includes(option.id)) {
        total += option.priceDeltaCents;
      }
    }
  }
  return total;
}
