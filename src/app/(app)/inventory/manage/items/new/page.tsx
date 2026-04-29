import Link from "next/link";
import { redirect } from "next/navigation";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewItemForm } from "./NewItemForm";

export default async function NewItemPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("inventory_categories")
    .select("id, name")
    .order("order");

  if (!categories || categories.length === 0) {
    redirect("/inventory/manage/categories");
  }

  return (
    <div className="max-w-md">
      <Link href="/inventory/manage/items" className="text-sm text-slate-500 hover:text-slate-900">← Items</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">New item</h1>
      <NewItemForm categories={categories} />
    </div>
  );
}
