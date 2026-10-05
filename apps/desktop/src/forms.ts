import type { EntityType } from "../../../packages/types";
export type Field = {
  key: string;
  label: string;
  kind?: string;
  options?: string[];
  required?: boolean;
  hint?: string;
};
const name: Field = { key: "name", label: "Name", required: true };
const date: Field = {
  key: "date",
  label: "Date",
  kind: "date",
  required: true,
};
const owner: Field = { key: "owner", label: "Ownership", kind: "owner" };
const currency: Field = {
  key: "currency",
  label: "Currency",
  kind: "currency",
};
const amount = (key: string, label: string): Field => ({
  key,
  label,
  kind: "money",
  required: true,
});
export const fields: Record<EntityType, Field[]> = {
  household: [],
  account: [
    name,
    {
      key: "kind",
      label: "Account type",
      options: ["bank", "cash", "savings", "mobile", "other"],
    },
    amount("opening", "Opening balance"),
    currency,
    owner,
    { ...date, label: "Opening date" },
  ],
  transaction: [],
  bill: [
    name,
    amount("amount", "Expected amount"),
    currency,
    { ...date, label: "First due date" },
    {
      key: "frequency",
      label: "Repeats",
      options: ["once", "daily", "weekly", "monthly", "yearly", "custom"],
    },
    { key: "interval", label: "Every (custom = days)", kind: "number" },
    { key: "account", label: "Payment account", kind: "account" },
    { key: "category", label: "Category" },
    { key: "reminder", label: "Remind days before", kind: "number" },
    owner,
  ],
  debt: [
    amount("amountOwed", "Amount owed"),
    { key: "lender", label: "Who it’s owed to", required: true },
    {
      key: "apr",
      label: "Interest rate (%)",
      kind: "percent",
      hint: "Annual rate. Enter 0 for an interest-free debt.",
    },
    amount("payment", "Monthly repayment"),
    {
      key: "paymentDay",
      label: "Monthly payment date",
      kind: "number",
      required: true,
      hint: "Day of the month (1–31). Shorter months use their last day.",
    },
  ],
  investment: [],
  goal: [
    name,
    { key: "kind", label: "Goal type", options: ["savings", "general"] },
    amount("target", "Target amount"),
    amount("current", "Starting earmarked amount"),
    { ...date, label: "Target date" },
    { key: "account", label: "Linked savings account", kind: "account" },
    currency,
    owner,
    { key: "description", label: "Description", kind: "textarea" },
  ],
  budget: [
    { ...name, label: "Budget name" },
    { ...date, label: "Month (choose any day)" },
    amount("income", "Expected income"),
    amount("expenses", "Expected spending"),
    { key: "category", label: "Category (All for household)" },
    currency,
    owner,
  ],
  recurring: [
    name,
    {
      key: "kind",
      label: "Expected transaction",
      options: ["income", "expense", "debt", "savings", "investment"],
    },
    amount("amount", "Expected amount"),
    currency,
    { ...date, label: "First occurrence" },
    {
      key: "frequency",
      label: "Repeats",
      options: ["daily", "weekly", "monthly", "yearly", "custom"],
    },
    { key: "interval", label: "Every (custom = days)", kind: "number" },
    { key: "account", label: "Account", kind: "account" },
    { key: "target", label: "Debt / investment", kind: "target" },
    owner,
  ],
  category: [name],
  rate: [
    { key: "name", label: "Currency", kind: "currency" },
    {
      key: "value",
      label: "Value of one currency unit in base currency",
      kind: "rate",
    },
    { ...date, label: "Effective date" },
  ],
  attachment: [],
};
export const expenseCategories = [
  "Groceries",
  "Eating Out",
  "Transport",
  "Fuel",
  "Utilities",
  "Electricity",
  "Water",
  "Internet",
  "Phone",
  "Rent",
  "Mortgage",
  "Insurance",
  "Medical",
  "Entertainment",
  "Clothing",
  "Household",
  "Education",
  "Travel",
  "Subscriptions",
  "Shopping",
  "Other",
];
