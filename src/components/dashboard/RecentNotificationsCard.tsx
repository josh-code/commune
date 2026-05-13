import Link from "next/link";
import { renderNotification, formatRelative, type Notification } from "@/lib/notifications";

export function RecentNotificationsCard({ notifications }: { notifications: Notification[] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent notifications</h2>
        <Link href="/notifications" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
          View all →
        </Link>
      </div>
      {notifications.length === 0 ? (
        <p className="text-sm text-slate-400">All caught up.</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map(n => {
            const { title, subtitle, href } = renderNotification(n);
            const unread = !n.read_at;
            return (
              <li key={n.id}>
                <Link
                  href={href}
                  className={`block rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 ${
                    unread ? "bg-indigo-50/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                        {title}
                      </div>
                      {subtitle && <div className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</div>}
                    </div>
                    <div className="text-xs text-slate-400 flex-shrink-0">{formatRelative(n.created_at)}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
