import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { ApiError, money, post } from "./api";
import { ActionFeedback, Alert, useAction } from "./components";

export type PayoutMethod = "standard" | "instant";
export type Payout = {
  id: string;
  amount_cents: number;
  status: string;
  method: string;
  arrival_date: number | null;
  created: number;
};
export type PayoutRequest = {
  amount_cents: number;
  method: PayoutMethod;
  requestId: string;
};
export type PaymentStatus = {
  configured: boolean;
  testMode?: boolean;
  accountId?: string | null;
  payoutSchedule?: "manual" | "daily" | "weekly" | "monthly" | null;
  payoutSetupRequired?: boolean;
  accountReady: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  instantPayoutsEnabled?: boolean;
  instantEligible: boolean;
  standardEligible?: boolean;
  defaultPayoutMethod?: PayoutMethod | null;
  payoutLimits?: Record<
    PayoutMethod,
    { minimum_cents: number; maximum_cents: number }
  >;
  pendingPayout?: (PayoutRequest & { retryable: boolean }) | null;
  frozen?: boolean;
  message: string;
  balance?: {
    available_cents: number;
    pending_cents: number;
    instant_available_cents: number;
    currency: string;
  };
  payouts?: Payout[];
};

function readAttempt(key: string): PayoutRequest | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!value || typeof value !== "object") return null;
    const v = value as Partial<PayoutRequest>;
    return typeof v.requestId === "string" &&
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
        v.requestId,
      ) &&
      (v.method === "instant" || v.method === "standard") &&
      Number.isSafeInteger(v.amount_cents) &&
      Number(v.amount_cents) > 0 &&
      Number(v.amount_cents) <= 999900
      ? (v as PayoutRequest)
      : null;
  } catch {
    return null;
  }
}

export function PayoutForm({
  status,
  userId,
  accountId,
  supportEmail,
  refresh,
}: {
  status: PaymentStatus;
  userId: string;
  accountId: string;
  supportEmail: string;
  refresh: () => void;
}) {
  const key = `saladfinder-payout:${userId}:${accountId}`;
  const [localAttempt, setLocalAttempt] = useState(() => readAttempt(key));
  const [amount, setAmount] = useState("");
  const [selection, setSelection] = useState<PayoutMethod | null>(null);
  const action = useAction();
  const pending = status.pendingPayout || localAttempt;
  const instantEnabled = status.instantPayoutsEnabled === true;
  const instantEligible = instantEnabled && status.instantEligible;
  const preferred = instantEligible
    ? (status.defaultPayoutMethod ?? "instant")
    : "standard";
  const method =
    pending?.method ||
    (selection === "instant" && !instantEligible ? "standard" : selection) ||
    preferred;
  const limit = status.payoutLimits?.[method] || {
    minimum_cents: method === "instant" ? 60 : 100,
    maximum_cents: 999900,
  };
  const balance =
    method === "instant"
      ? (status.balance?.instant_available_cents ?? 0)
      : (status.balance?.available_cents ?? 0);
  const maximum = Math.max(0, Math.min(balance, limit.maximum_cents));
  const eligible =
    method === "instant"
      ? instantEligible
      : (status.standardEligible ??
        (status.accountReady && maximum >= limit.minimum_cents));
  const retryable = status.pendingPayout?.retryable !== false;
  const canRequest =
    !action.busy &&
    !status.frozen &&
    status.payoutsEnabled &&
    (pending ? retryable : eligible && maximum >= limit.minimum_cents);
  const displayedAmount = pending
    ? (pending.amount_cents / 100).toFixed(2)
    : amount;
  const parsed = /^\d+(?:\.\d{1,2})?$/.test(displayedAmount)
    ? Math.round(Number(displayedAmount) * 100)
    : 0;
  const remember = (request: PayoutRequest | null) => {
    setLocalAttempt(request);
    try {
      if (request) sessionStorage.setItem(key, JSON.stringify(request));
      else sessionStorage.removeItem(key);
    } catch {
      /* Server-side pending requests remain recoverable without browser storage. */
    }
  };
  useEffect(() => {
    if (status.pendingPayout) {
      setLocalAttempt(status.pendingPayout);
      try {
        sessionStorage.setItem(key, JSON.stringify(status.pendingPayout));
      } catch {
        /* See above. */
      }
    }
  }, [status.pendingPayout, key]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canRequest) return;
    if (!pending && (parsed < limit.minimum_cents || parsed > maximum)) {
      action.setError(
        `Choose an amount from ${money(limit.minimum_cents)} to ${money(maximum)} CAD.`,
      );
      return;
    }
    void action.run(async () => {
      const request: PayoutRequest = {
        amount_cents: pending?.amount_cents ?? parsed,
        method: pending?.method ?? method,
        requestId: pending?.requestId ?? crypto.randomUUID(),
      };
      remember(request);
      try {
        await post<{ payout: Payout }>("/payments/payout", request);
        remember(null);
        setAmount("");
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.details &&
          typeof error.details === "object" &&
          "payoutRequest" in error.details
        ) {
          const outcome = error.details.payoutRequest;
          if (
            outcome &&
            typeof outcome === "object" &&
            "requestId" in outcome &&
            outcome.requestId === request.requestId &&
            "state" in outcome &&
            ["not_created", "rejected"].includes(String(outcome.state)) &&
            "safeToRetryNew" in outcome &&
            outcome.safeToRetryNew === true
          )
            remember(null);
        }
        throw error;
      } finally {
        refresh();
      }
    }, "Payout request confirmed by Stripe. Follow its status below; this does not confirm bank arrival.");
  };
  return (
    <form
      className="form-stack payout-form"
      onSubmit={submit}
      aria-busy={action.busy}
    >
      <h3>Request a payout</h3>
      <p className="small-text">
        {instantEnabled
          ? "Instant is selected when eligible. You can choose a standard bank payout instead."
          : "Instant Payouts: Coming later. Standard bank payouts are available when your funds and bank account are eligible."}{" "}
        Nothing is sent until you confirm a request.
      </p>
      <ActionFeedback {...action} />
      {pending && (
        <Alert kind="info">
          {retryable
            ? "A previous payout request needs a confirmed result. Check it using the same reference before starting another payout."
            : "This payout needs support review before another request can be made."}
          <p className="small-text">
            {money(pending.amount_cents)} CAD ·{" "}
            {pending.method === "instant" ? "Instant" : "Standard"}. The server
            checks the saved request against your account.
          </p>
          {!retryable && supportEmail && (
            <a href={`mailto:${supportEmail}`}>Contact support</a>
          )}
        </Alert>
      )}
      <label>
        Payout method
        <select
          value={method}
          disabled={!!pending || action.busy}
          onChange={(event) => {
            setSelection(event.target.value as PayoutMethod);
            action.setSuccess("");
            action.setError("");
          }}
          aria-describedby="payout-method-help"
        >
          <option value="instant" disabled={!instantEligible}>
            {instantEnabled
              ? "Instant · eligible debit card"
              : "Instant Payouts · Coming later"}
          </option>
          <option value="standard">Standard bank payout</option>
        </select>
      </label>
      <p className="small-text" id="payout-method-help">
        {method === "instant"
          ? "For supported Canadian debit cards. Eligible Instant Payouts usually arrive within 30 minutes; Stripe or bank delays can occur."
          : "Standard bank payouts use settled available funds and follow Stripe’s processing and your bank’s timing. Arrival is not guaranteed for a particular day."}
        {instantEnabled &&
          !instantEligible &&
          " Instant Payout is unavailable until Stripe confirms an eligible destination and sufficient eligible balance."}
      </p>
      <label>
        Amount (CAD)
        <input
          type="number"
          inputMode="decimal"
          min={pending ? undefined : limit.minimum_cents / 100}
          max={pending ? undefined : maximum / 100}
          step="0.01"
          required
          value={displayedAmount}
          disabled={!!pending || action.busy}
          onChange={(event) => setAmount(event.target.value)}
          aria-describedby="payout-available"
        />
      </label>
      <p className="small-text" id="payout-available">
        Available for this method: {money(maximum)} CAD. Minimum{" "}
        {money(limit.minimum_cents)} CAD.
      </p>
      {!pending && maximum >= limit.minimum_cents && (
        <button
          className="text-button align-start"
          type="button"
          disabled={action.busy}
          onClick={() => setAmount((maximum / 100).toFixed(2))}
        >
          Use available balance
        </button>
      )}
      <dl className="price-breakdown payout-quote">
        <div>
          <dt>Worker payout fee</dt>
          <dd>$0 CAD</dd>
        </div>
        <div>
          <dt>Requested amount</dt>
          <dd>{money(parsed)} CAD</dd>
        </div>
      </dl>
      <p className="small-text">
        SaladFinder absorbs its Stripe payout charges for both methods. Your own
        bank’s terms may apply. Available balance can change before Stripe
        accepts the request.
      </p>
      {!pending && (!eligible || maximum < limit.minimum_cents) && (
        <Alert kind="info">
          This payout method isn’t available yet. Complete any Stripe setup
          shown above and wait for eligible funds, then refresh your payment
          status. Pending customer payments must first become available through
          Stripe.
        </Alert>
      )}
      <button className="button" disabled={!canRequest}>
        {action.busy
          ? "Checking with Stripe…"
          : pending
            ? "Check previous payout request"
            : `Request ${method === "instant" ? "instant" : "standard"} payout`}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
