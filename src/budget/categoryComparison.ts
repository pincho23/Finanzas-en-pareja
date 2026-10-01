export type AllocationForComparison = { category: string; amount: number; month: string };
export type MovementForComparison = { amount: number; occurredAt: string; category: string | null };

const movementMonth = (occurredAt: string) => {
  const date = new Date(occurredAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
};

export function monthlyIncomeTotal(movements: MovementForComparison[], month: string) {
  return movements.filter((movement) => movement.amount > 0 && movementMonth(movement.occurredAt) === month).reduce((sum, movement) => sum + movement.amount, 0);
}

export function summarizeMonthlyCategories(movements: MovementForComparison[], allocations: AllocationForComparison[], month: string) {
  const assigned = new Map<string, number>();
  const spent = new Map<string, number>();

  allocations.filter((allocation) => allocation.month === month).forEach((allocation) => {
    assigned.set(allocation.category, (assigned.get(allocation.category) ?? 0) + allocation.amount);
  });

  movements.forEach((movement) => {
    if (movement.amount < 0 && movementMonth(movement.occurredAt) === month) {
      const category = movement.category ?? "Sin clasificar";
      spent.set(category, (spent.get(category) ?? 0) + Math.abs(movement.amount));
    }
  });

  return Array.from(new Set([...assigned.keys(), ...spent.keys()])).map((category) => {
    const income = assigned.get(category) ?? 0;
    const expense = spent.get(category) ?? 0;
    return { category, income, expense, balance: income - expense };
  }).sort((a, b) => (a.balance >= 0 ? 1 : 0) - (b.balance >= 0 ? 1 : 0) || b.expense - a.expense);
}
