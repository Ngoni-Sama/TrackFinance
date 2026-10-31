import { GoalInput } from '../core/insights';
import { database } from './db';

/** The savings goal the user is working towards; defaults to becoming a dollar millionaire. */
export interface StoredGoal {
  target: number;
  /** Savings/investments held outside the tracked SMS (land, cattle, cash, shares…). */
  otherAssets: number;
  annualReturn: number;
}

export const DEFAULT_GOAL: StoredGoal = { target: 1_000_000, otherAssets: 0, annualReturn: 8 };

export async function loadGoal(): Promise<StoredGoal> {
  const raw = await database.localStorage.get<string>('goal');
  if (!raw) return DEFAULT_GOAL;
  try {
    return { ...DEFAULT_GOAL, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_GOAL;
  }
}

export async function saveGoal(goal: StoredGoal) {
  await database.localStorage.set('goal', JSON.stringify(goal));
}

export function goalInput(goal: StoredGoal, savingsBalance: number, monthlySaving: number): GoalInput {
  return {
    target: goal.target,
    current: goal.otherAssets + savingsBalance,
    monthlySaving: Math.max(0, monthlySaving),
    annualReturn: goal.annualReturn,
  };
}
