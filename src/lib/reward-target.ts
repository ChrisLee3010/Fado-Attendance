export const COFFEE_COST = 40;
export const LUNCH_COST = 75;

export function nextRewardTarget(hasCoffeeVoucher: boolean) {
  return hasCoffeeVoucher
    ? { name: "Bữa trưa cho hai người", icon: "🍱", cost: LUNCH_COST }
    : { name: "Voucher cà phê", icon: "☕", cost: COFFEE_COST };
}
