export const COFFEE_COST = 40;
export const LUNCH_COST = 75;

export function nextRewardTarget(hasCoffeeVoucher: boolean) {
  return hasCoffeeVoucher
    ? { name: "Lunch for two", icon: "🍱", cost: LUNCH_COST }
    : { name: "Coffee voucher", icon: "☕", cost: COFFEE_COST };
}
