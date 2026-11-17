// Fictional prototype accounts. One shared password keeps the BOD demo quick to run.
export const DEMO_PASSWORD = "quest-demo-2026";

export type Role = "employee" | "admin" | "cashier";

export type DemoAccount = {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  employeeId: string | null;
  label: string;
};

// Roles add up: an admin is still an employee with their own attendance and wallet.
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: "u-alex", email: "alex@fado.demo", name: "Alex Morgan", roles: ["employee"], employeeId: "EMP001", label: "Employee" },
  { id: "u-sarah", email: "sarah@fado.demo", name: "Sarah Chen", roles: ["employee"], employeeId: "EMP002", label: "Employee" },
  { id: "u-daniel", email: "admin@fado.demo", name: "Daniel Lee", roles: ["employee", "admin"], employeeId: "EMP003", label: "HR manager · Employee + admin" },
  { id: "u-cafe", email: "cashier@fado.demo", name: "Café Cashier", roles: ["cashier"], employeeId: null, label: "Cashier station" },
];
