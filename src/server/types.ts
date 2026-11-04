import type { User } from "../shared/types";
export type AppEnv = { Bindings: Env; Variables: { user: User | null } };
export type UserRow = Omit<User, "skills" | "is_admin"> & { skills: string };
