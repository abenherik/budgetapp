export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  createdAt: string;
};

export type AppState = {
  bankBalance: number;
  goals: Goal[];
};

export type GoalEvaluation = Goal & {
  monthsRemaining: number;
  monthlyNeed: number;
  allocatedAmount: number;
  paceDelta: number;
  fundingRatio: number;
  progressPercent: number;
  shortfall: number;
  status: "ahead" | "on-track" | "behind";
};

export type PortfolioSummary = {
  totalMonthlyNeed: number;
  totalAllocated: number;
  remainingReserve: number;
  aheadCount: number;
  onTrackCount: number;
  behindCount: number;
};

export type FixedReserveSummary = {
  mortgageReserve: number;
  mortgageMonthsReserved: number;
  groceryReserve: number;
  groceryDaysRemaining: number;
  total: number;
};

export const MORTGAGE_MONTHLY_AMOUNT = 13_000;
export const GROCERY_DAILY_AMOUNT = 350;

export const STORAGE_KEY = "budgetapp:savings-state";

export const EMPTY_STATE: AppState = {
  bankBalance: 0,
  goals: [],
};

const currencyFormatter = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
});

export function sanitizeState(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") {
    return EMPTY_STATE;
  }

  const candidate = raw as Partial<AppState> & { goals?: unknown };
  const goals = Array.isArray(candidate.goals)
    ? candidate.goals
        .map((item) => sanitizeGoal(item))
        .filter((goal): goal is Goal => goal !== null)
    : [];

  return {
    bankBalance: toMoney(candidate.bankBalance),
    goals,
  };
}

export function createGoal(input: {
  name: string;
  targetAmount: number;
  targetDate: string;
}): Goal {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    targetAmount: normalizeMoney(input.targetAmount),
    targetDate: input.targetDate,
    createdAt: now,
  };
}

export function duplicateGoalForNextYear(goal: Goal): Goal {
  const target = new Date(`${goal.targetDate}T00:00:00`);
  target.setFullYear(target.getFullYear() + 1);

  return {
    ...goal,
    id: crypto.randomUUID(),
    targetDate: target.toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
}

export function evaluatePortfolio(
  state: AppState,
  referenceDate = new Date(),
): {
  goals: GoalEvaluation[];
  summary: PortfolioSummary;
} {
  const sanitizedBalance = Math.max(0, state.bankBalance);
  const goals = state.goals.map((goal) => {
    const monthsRemaining = getMonthsUntilTarget(goal.targetDate, referenceDate);
    const monthlyNeed =
      goal.targetAmount > 0 && monthsRemaining > 0
        ? goal.targetAmount / monthsRemaining
        : 0;

    return {
      ...goal,
      monthsRemaining,
      monthlyNeed,
      allocatedAmount: 0,
      paceDelta: 0,
      fundingRatio: 0,
      progressPercent: 0,
      shortfall: 0,
      status: "on-track" as const,
    };
  });

  const allocations = distributeBalance(
    sanitizedBalance,
    goals.map((goal) => ({
      id: goal.id,
      monthlyNeed: goal.monthlyNeed,
      targetAmount: goal.targetAmount,
    })),
  );

  const evaluatedGoals = goals.map((goal) => {
    const allocatedAmount = allocations.get(goal.id) ?? 0;
    const paceDelta = allocatedAmount - goal.monthlyNeed;
    const fundingRatio = goal.monthlyNeed > 0 ? allocatedAmount / goal.monthlyNeed : 1;
    const progressPercent =
      goal.targetAmount > 0
        ? Math.min(100, (allocatedAmount / goal.targetAmount) * 100)
        : 100;
    const shortfall = Math.max(0, goal.monthlyNeed - allocatedAmount);

    let status: GoalEvaluation["status"] = "on-track";
    if (goal.monthlyNeed > 0) {
      if (paceDelta < -0.5) {
        status = "behind";
      } else if (paceDelta > 0.5) {
        status = "ahead";
      }
    }

    return {
      ...goal,
      allocatedAmount,
      paceDelta,
      fundingRatio,
      progressPercent,
      shortfall,
      status,
    };
  });

  const summary = evaluatedGoals.reduce<PortfolioSummary>(
    (accumulator, goal) => {
      accumulator.totalMonthlyNeed += goal.monthlyNeed;
      accumulator.totalAllocated += goal.allocatedAmount;

      if (goal.status === "behind") {
        accumulator.behindCount += 1;
      } else if (goal.status === "ahead") {
        accumulator.aheadCount += 1;
      } else {
        accumulator.onTrackCount += 1;
      }

      return accumulator;
    },
    {
      totalMonthlyNeed: 0,
      totalAllocated: 0,
      remainingReserve: Math.max(0, sanitizedBalance),
      aheadCount: 0,
      onTrackCount: 0,
      behindCount: 0,
    },
  );

  summary.remainingReserve = Math.max(
    0,
    sanitizedBalance - summary.totalAllocated,
  );

  return {
    goals: evaluatedGoals,
    summary,
  };
}

export function formatAmount(amount: number): string {
  return currencyFormatter.format(normalizeMoney(amount));
}

export function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

export function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateFormatter.format(date);
}

export function getMonthsUntilTarget(
  targetDate: string,
  referenceDate = new Date(),
): number {
  const target = new Date(`${targetDate}T00:00:00`);

  if (Number.isNaN(target.getTime())) {
    return 0;
  }

  const monthDifference =
    (target.getFullYear() - referenceDate.getFullYear()) * 12 +
    (target.getMonth() - referenceDate.getMonth());

  return Math.max(1, monthDifference);
}

function distributeBalance(
  balance: number,
  goals: Array<{ id: string; monthlyNeed: number; targetAmount: number }>,
) {
  const allocations = new Map<string, number>();
  const activeIndexes = goals.map((_, index) => index);
  let remainingBalance = Math.max(0, balance);

  while (remainingBalance > 0.01 && activeIndexes.length > 0) {
    const totalWeight = activeIndexes.reduce(
      (sum, index) => sum + goals[index].monthlyNeed,
      0,
    );

    if (totalWeight <= 0) {
      break;
    }

    let consumed = 0;
    const nextActiveIndexes: number[] = [];

    for (const index of activeIndexes) {
      const goal = goals[index];
      const currentAllocation = allocations.get(goal.id) ?? 0;
      const remainingCapacity = Math.max(0, goal.targetAmount - currentAllocation);

      if (remainingCapacity <= 0.01) {
        continue;
      }

      const share = remainingBalance * (goal.monthlyNeed / totalWeight);
      const applied = Math.min(share, remainingCapacity);

      allocations.set(goal.id, currentAllocation + applied);
      consumed += applied;

      if (remainingCapacity - applied > 0.01) {
        nextActiveIndexes.push(index);
      }
    }

    if (consumed <= 0.01) {
      break;
    }

    remainingBalance = Math.max(0, remainingBalance - consumed);
    activeIndexes.splice(0, activeIndexes.length, ...nextActiveIndexes);
  }

  return allocations;
}

function sanitizeGoal(value: unknown): Goal | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Goal>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.targetDate !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name.trim(),
    targetAmount: normalizeMoney(candidate.targetAmount),
    targetDate: candidate.targetDate,
    createdAt:
      typeof candidate.createdAt === "string"
        ? candidate.createdAt
        : new Date().toISOString(),
  };
}

function normalizeMoney(value: unknown) {
  return Math.max(
    0,
    Math.round(typeof value === "number" && Number.isFinite(value) ? value : 0),
  );
}

function toMoney(value: unknown) {
  if (typeof value === "number") {
    return normalizeMoney(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return normalizeMoney(parsed);
  }

  return 0;
}

export function getFixedReserveSummary(referenceDate = new Date()): FixedReserveSummary {
  const mortgageMonthsReserved = (referenceDate.getMonth() % 3) + 1;
  const groceryDaysRemaining = getDaysRemainingInMonth(referenceDate);

  const mortgageReserve = MORTGAGE_MONTHLY_AMOUNT * mortgageMonthsReserved;
  const groceryReserve = GROCERY_DAILY_AMOUNT * groceryDaysRemaining;

  return {
    mortgageReserve,
    mortgageMonthsReserved,
    groceryReserve,
    groceryDaysRemaining,
    total: mortgageReserve + groceryReserve,
  };
}

function getDaysRemainingInMonth(referenceDate: Date) {
  const endOfMonth = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    0,
  );

  return Math.max(0, endOfMonth.getDate() - referenceDate.getDate());
}