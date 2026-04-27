import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateMoreAction } from "./new/actions";

const FREQUENCY_LABELS: Record<string, string> = {
  daily:   "Every day",
  weekly:  "Every week",
  monthly: "Every month",
  yearly:  "Every year",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function frequencyDescription(t: {
  frequency: string;
  day_of_week: number | null;
  day_of_month: number | null;
  month_of_year: number | null;
}): string {
  if (t.frequency === "weekly" && t.day_of_week !== null) {
    return `Every ${DAY_NAMES[t.day_of_week]}`;
  }
  if (t.frequency === "monthly" && t.day_of_month !== null) {
    return `Every month on the ${t.day_of_month}${ordinal(t.day_of_month)}`;
  }
  return FREQUENCY_LABELS[t.frequency] ?? t.frequency;
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export default async function TemplatesPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("service_templates")
    .select("id, name, type, frequency, day_of_week, day_of_month, month_of_year")
    .order("name");

  // Count upcoming draft services per template
  const today = new Date().toISOString().split("T")[0];
  const { data: upcoming } = await supabase
    .from("services")
    .select("template_id")
    .neq("status", "completed")
    .gte("date", today)
    .not("template_id", "is", null);

  const upcomingByTemplate = new Map<string, number>();
  (upcoming ?? []).forEach(s => {
    if (s.template_id) {
      upcomingByTemplate.set(s.template_id, (upcomingByTemplate.get(s.template_id) ?? 0) + 1);
    }
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/roster" className="text-sm text-slate-500 hover:text-slate-900">← Roster</Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">Service templates</h1>
        </div>
        <Link href="/roster/templates/new"
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
          + New template
        </Link>
      </div>

      {(templates ?? []).length === 0 && (
        <p className="text-sm text-slate-400">
          No templates yet. <Link href="/roster/templates/new" className="text-indigo-600 hover:text-indigo-800">Create one →</Link>
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {(templates ?? []).map(t => {
          const count = upcomingByTemplate.get(t.id) ?? 0;
          return (
            <div key={t.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">{t.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{frequencyDescription(t)}</div>
              </div>
              <span className="text-xs text-slate-400">{count} upcoming</span>
              <form action={generateMoreAction.bind(null, t.id)}>
                <button type="submit"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50">
                  Generate 8 more
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
