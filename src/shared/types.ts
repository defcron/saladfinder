export const POLICY_VERSION = "2026-11-04";
export const CATEGORIES = [
  "Cleaning",
  "Yard work",
  "Moving help",
  "Assembly",
  "General help",
] as const;
export type Category = (typeof CATEGORIES)[number];
export type UserRole = "worker" | "poster" | "both";
export type JobStatus =
  "open" | "assigned" | "in_progress" | "completed" | "cancelled" | "disputed";
export type MilestoneStatus =
  | "pending"
  | "submitted"
  | "approved"
  | "checkout_pending"
  | "paid"
  | "refunded";
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  bio: string;
  country?: string | null;
  city: string;
  skills: string[];
  created_at: string;
  stripe_account_id: string | null;
  suspended_at: string | null;
  is_admin?: boolean;
}
export interface Job {
  id: string;
  fee_plan?: import("./pricing").FeePlan;
  poster_id: string;
  worker_id: string | null;
  title: string;
  description: string;
  category: Category;
  country?: string | null;
  city: string;
  area: string;
  start_date: string;
  estimated_hours: number;
  budget_cents: number;
  status: JobStatus;
  payment_schedule: "completion" | "milestones";
  created_at: string;
  updated_at: string;
  poster_name?: string;
  worker_name?: string | null;
}
export interface Milestone {
  id: string;
  job_id: string;
  title: string;
  worker_fee_cents?: number;
  amount_cents: number;
  position: number;
  status: MilestoneStatus;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  paid_at?: string | null;
  fee_cents?: number | null;
}
export interface Application {
  worker_fee_snapshot?: string;
  id: string;
  job_id: string;
  fee_plan?: import("./pricing").FeePlan;
  worker_id: string;
  message: string;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  created_at: string;
  worker_name?: string;
  worker_bio?: string;
  job_title?: string;
}
export interface Message {
  id: string;
  job_id: string;
  sender_id: string;
  sender_name?: string;
  body: string;
  created_at: string;
}
export interface Review {
  id: string;
  job_id: string;
  author_id: string;
  subject_id: string;
  rating: number;
  body: string;
  created_at: string;
  author_name?: string;
}
export interface Config {
  launchMode: "preview" | "live";
  listingsReady: boolean;
  currency: "CAD";
  region: string;
  authReady: boolean;
  paymentsReady: boolean;
  instantPayoutsEnabled?: boolean;
  pricingEnabled?: boolean;
  subscriptionsReady?: boolean;
  pricingVersion?: string;
  plan?: import("./pricing").Plan;
  turnstileSiteKey: string;
  supportEmail: string;
  fee: { percent: number; fixedCents: number; minimumCents: number };
}
export function feeCents(amountCents: number): number {
  return Math.max(300, Math.round((amountCents * 12) / 100) + 100);
}
export function money(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}
