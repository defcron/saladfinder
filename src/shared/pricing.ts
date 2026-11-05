export const PLANS = {
  standard: {
    name: "Standard",
    monthlyCents: 0,
    posterBps: 1490,
    workerBps: 790,
    fixedCents: 100,
    posterMinimum: 300,
  },
  economy: {
    name: "Economy",
    monthlyCents: 1000,
    posterBps: 890,
    workerBps: 540,
    fixedCents: 50,
    posterMinimum: 150,
  },
  premium: {
    name: "Premium",
    monthlyCents: 2500,
    posterBps: 390,
    workerBps: 390,
    fixedCents: 130,
    posterMinimum: 130,
  },
} as const;
export type Plan = keyof typeof PLANS;
export type FeePlan = Plan | "legacy";
export const PRICING_VERSION = "2026-11-05-subscriptions-v1";
export function transactionFee(
  amount: number,
  role: "poster" | "worker",
  plan: FeePlan,
): number {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 500000)
    throw new Error("Invalid milestone amount");
  if (plan === "legacy")
    return role === "worker"
      ? 0
      : Math.max(300, Math.round(amount * 0.12) + 100);
  const rate = PLANS[plan];
  return Math.max(
    role === "poster" ? rate.posterMinimum : 0,
    Math.round(
      (amount * (role === "poster" ? rate.posterBps : rate.workerBps)) / 10000,
    ) + rate.fixedCents,
  );
}
export function milestoneQuote(
  amount: number,
  poster: FeePlan,
  worker: FeePlan,
) {
  const posterFee = transactionFee(amount, "poster", poster);
  const workerFee = transactionFee(amount, "worker", worker);
  return {
    grossCents: amount,
    posterFeeCents: posterFee,
    workerFeeCents: workerFee,
    clientTotalCents: amount + posterFee,
    workerNetCents: amount - workerFee,
    applicationFeeCents: posterFee + workerFee,
  };
}
