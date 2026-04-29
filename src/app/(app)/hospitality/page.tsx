import Link from "next/link";
import { requireHospitalityOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Settings, UtensilsCrossed } from "lucide-react";

export default async function HospitalityIndexPage() {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: services }, { data: needs }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, date")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(20),
    supabase
      .from("hospitality_needs")
      .select("service_id, status")
      .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const counts = new Map<string, { needed: number; requested: number; fulfilled: number }>();
  for (const n of needs ?? []) {
    const c = counts.get(n.service_id) ?? { needed: 0, requested: 0, fulfilled: 0 };
    c[n.status as "needed" | "requested" | "fulfilled"]++;
    counts.set(n.service_id, c);
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Hospitality</h1>
        <Link
          href="/hospitality/items"
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Catalog
        </Link>
      </div>

      {!services || services.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No upcoming services.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {services.map((s) => {
            const c = counts.get(s.id) ?? { needed: 0, requested: 0, fulfilled: 0 };
            const total = c.needed + c.requested + c.fulfilled;
            const date = new Date(s.date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric"
            });
            return (
              <li key={s.id}>
                <Link
                  href={`/hospitality/services/${s.id}`}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">{date}</div>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-3">
                    {total === 0 ? (
                      <span className="text-slate-400">No items</span>
                    ) : (
                      <>
                        {c.needed > 0 && <span><strong className="text-amber-600">{c.needed}</strong> needed</span>}
                        {c.requested > 0 && <span><strong className="text-blue-600">{c.requested}</strong> requested</span>}
                        {c.fulfilled > 0 && <span><strong className="text-emerald-600">{c.fulfilled}</strong> done</span>}
                      </>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
