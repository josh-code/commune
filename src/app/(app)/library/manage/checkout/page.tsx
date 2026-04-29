import Link from "next/link";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { CheckoutForm } from "./CheckoutForm";

export default async function CheckoutPage() {
  await requireLibrarianOrAdmin();
  return (
    <div className="max-w-md">
      <Link href="/library/manage" className="text-sm text-slate-500 hover:text-slate-900">← Library admin</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Walk-up checkout</h1>
      <CheckoutForm />
    </div>
  );
}
