import type { User } from "../shared/types";
export type AppBindings = Env & {
  ASSETS?: Fetcher;
  EMAIL?: SendEmail;
  EMAIL_PROVIDER?: string;
};
export type AppEnv = {
  Bindings: AppBindings;
  Variables: { user: User | null };
};
export type UserRow = Omit<User, "skills" | "is_admin"> & { skills: string };
