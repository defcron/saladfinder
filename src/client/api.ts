import { feeCents, CATEGORIES } from "../shared/types";
export type Role = "worker" | "poster" | "both";
export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  bio: string;
  city: string;
  skills: string[] | string;
  created_at: string;
  stripe_account_id?: string | null;
  is_admin?: boolean;
};
export type Config = {
  launchMode: "preview" | "live";
  listingsReady: boolean;
  currency: string;
  region: string;
  authReady: boolean;
  paymentsReady: boolean;
  instantPayoutsEnabled?: boolean;
  paymentMode: "test" | "live" | null;
  turnstileSiteKey: string;
  supportEmail: string;
  fee: { percent: number; fixedCents: number; minimumCents: number };
};
export type Job = {
  id: string;
  poster_id: string;
  worker_id: string | null;
  title: string;
  description: string;
  category: string;
  city: string;
  area: string;
  start_date: string;
  estimated_hours: number;
  budget_cents: number;
  status: string;
  payment_schedule: string;
  created_at: string;
  poster_name?: string;
  worker_name?: string;
};
export type Milestone = {
  id: string;
  job_id: string;
  title: string;
  amount_cents: number;
  position: number;
  status: string;
  paid_at?: string;
  fee_cents?: number;
};
export type Application = {
  id: string;
  job_id: string;
  job_title?: string;
  worker_id: string;
  worker_name?: string;
  worker_bio?: string;
  worker_city?: string;
  worker_skills?: string | string[];
  name?: string;
  message: string;
  status: string;
  created_at: string;
};
export type Message = {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};
export type Review = {
  id: string;
  author_id: string;
  author_name?: string;
  rating: number;
  body: string;
  created_at: string;
};
export type JobDetail = {
  job: Job;
  milestones: Milestone[];
  applications?: Application[];
  myApplication?: Application | null;
  messages?: Message[];
  reviews?: Review[];
};
export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status, data);
  }
  if (data === null)
    throw new ApiError(
      "The server returned an unreadable response. Check the current status before retrying.",
      response.status,
    );
  return data as T;
}
export function safeInternalPath(
  value: string | null,
  fallback = "/dashboard",
) {
  if (!value?.startsWith("/") || /[\\\u0000-\u0020]/.test(value))
    return fallback;
  try {
    const target = new URL(value, "https://saladfinder.invalid");
    if (
      target.origin !== "https://saladfinder.invalid" ||
      ["/sign-in", "/auth/verify"].includes(target.pathname)
    )
      return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
export const post = <T>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
export const money = (cents: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
export const feeFor = feeCents;
export const readable = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const dateLabel = (value: string) => {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
};
export function stripeRedirect(url: string) {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    !(
      target.hostname === "stripe.com" ||
      target.hostname.endsWith(".stripe.com")
    )
  )
    throw new Error(
      "The payment service returned an invalid destination. Please contact support.",
    );
  window.location.assign(target.href);
}
export const categories = [...CATEGORIES];
export const examples: Job[] = [
  {
    id: "example-yard",
    poster_id: "example",
    worker_id: null,
    title: "Help with a backyard cleanup",
    description:
      "An example of a clear, practical job: rake leaves, gather garden debris, and tidy the backyard. Tools and bags are supplied. Agree on the scope before starting, and approve payment after each milestone.",
    category: "Yard work",
    city: "Toronto",
    area: "Neighbourhood shared after hiring",
    start_date: "",
    estimated_hours: 4,
    budget_cents: 18000,
    status: "example",
    payment_schedule: "milestones",
    created_at: "",
  },
  {
    id: "example-moving",
    poster_id: "example",
    worker_id: null,
    title: "A hand with moving day",
    description:
      "An example of moving help: carry labelled boxes and small furniture between a ground-floor home and a parked van. No driving, hazardous lifting, or specialised equipment. Confirm access, lifting limits, and the complete scope before accepting.",
    category: "Moving help",
    city: "Hamilton",
    area: "Neighbourhood shared after hiring",
    start_date: "",
    estimated_hours: 5,
    budget_cents: 24000,
    status: "example",
    payment_schedule: "completion",
    created_at: "",
  },
  {
    id: "example-assembly",
    poster_id: "example",
    worker_id: null,
    title: "Assemble a desk and bookshelf",
    description:
      "An example assembly job: put together one flat-pack desk and one freestanding bookshelf using the supplied instructions and hardware. No electrical work, structural work, or wall installation is included.",
    category: "Assembly",
    city: "Ottawa",
    area: "Neighbourhood shared after hiring",
    start_date: "",
    estimated_hours: 3,
    budget_cents: 12000,
    status: "example",
    payment_schedule: "completion",
    created_at: "",
  },
];
