import Link from "next/link";
import { requireHospitalityOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CatalogEditor } from "./CatalogEditor";

export default async function CatalogPage() {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from("hospitality_categories").select("id, name").order("name"),
    supabase.from("hospitality_items").select("id, name, category_id").order("name"),
  ]);

  return (
    <div className="max-w-2xl">
      <Link href="/hospitality" className="text-sm text-slate-500 hover:text-slate-900">← Hospitality</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Catalog</h1>
      <CatalogEditor categories={categories ?? []} items={items ?? []} />
    </div>
  );
}
