import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHospitalityOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NeedsListEditor } from "./NeedsListEditor";

export default async function HospitalityServicePage({
  params,
}: {
  params: Promise<{ service_id: string }>;
}) {
  const { service_id } = await params;
  await requireHospitalityOrAdmin();
  const supabase = await createClient();

  const [{ data: service }, { data: needsRaw }, { data: catalogRaw }] = await Promise.all([
    supabase.from("services").select("id, name, date").eq("id", service_id).single(),
    supabase
      .from("hospitality_needs")
      .select(`
        id, item_id, quantity, notes, status,
        hospitality_items ( name, hospitality_categories ( name ) ),
        fulfilled:fulfilled_by ( first_name, last_name )
      `)
      .eq("service_id", service_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("hospitality_items")
      .select("id, name, hospitality_categories ( id, name )")
      .order("name"),
  ]);

  if (!service) notFound();

  const initialNeeds = (needsRaw ?? []).map((n: any) => ({
    id: n.id,
    item_id: n.item_id,
    item_name: n.hospitality_items?.name ?? "Unknown",
    category_name: n.hospitality_items?.hospitality_categories?.name ?? "—",
    quantity: n.quantity,
    notes: n.notes,
    status: n.status,
    fulfilled_by_name: n.fulfilled
      ? `${n.fulfilled.first_name} ${n.fulfilled.last_name}`.trim()
      : null,
  }));

  const catalogItems = (catalogRaw ?? []).map((it: any) => ({
    id: it.id,
    name: it.name,
    category: {
      id: it.hospitality_categories?.id ?? "",
      name: it.hospitality_categories?.name ?? "—",
    },
  }));

  const date = new Date(service.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  return (
    <div className="max-w-2xl">
      <Link href="/hospitality" className="text-sm text-slate-500 hover:text-slate-900">← Hospitality</Link>
      <div className="mt-1 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">{service.name}</h1>
        <div className="text-sm text-slate-500 mt-0.5">{date}</div>
      </div>

      <NeedsListEditor
        serviceId={service_id}
        initialNeeds={initialNeeds}
        catalogItems={catalogItems}
      />
    </div>
  );
}
