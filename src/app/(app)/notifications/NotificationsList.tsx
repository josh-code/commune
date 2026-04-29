"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { markReadAction, markAllReadAction } from "./actions";

type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function renderNotification(n: Notification) {
  if (n.type === "hospitality_order_requested") {
    const p = n.payload as {
      service_id: string;
      service_name: string;
      service_date: string;
      item_count: number;
    };
    return {
      title: `Hospitality requested ${p.item_count} item${p.item_count === 1 ? "" : "s"}`,
      subtitle: `For ${p.service_name} (${p.service_date})`,
      href: `/hospitality/services/${p.service_id}`,
    };
  }
  if (n.type === "brief_submitted") {
    const p = n.payload as {
      brief_id: string;
      service_id: string;
      service_name: string;
      service_date: string;
      speaker_name: string;
    };
    return {
      title: `${p.speaker_name} submitted the brief`,
      subtitle: `For ${p.service_name} (${p.service_date})`,
      href: `/brief/${p.service_id}`,
    };
  }
  if (n.type === "library_loan_overdue") {
    const p = n.payload as { loan_id: string; book_title: string; days_overdue: number };
    return {
      title: `"${p.book_title}" is ${p.days_overdue} day${p.days_overdue === 1 ? "" : "s"} overdue`,
      subtitle: "Please return it as soon as possible.",
      href: "/library/me",
    };
  }
  if (n.type === "library_book_available") {
    const p = n.payload as { book_id: string; book_title: string };
    return {
      title: `"${p.book_title}" is available for you`,
      subtitle: "Visit the library to pick it up.",
      href: `/library/${p.book_id}`,
    };
  }
  if (n.type === "library_extension_requested") {
    const p = n.payload as { extension_id: string; loan_id: string; book_title: string; borrower_name: string };
    return {
      title: `${p.borrower_name} requested an extension`,
      subtitle: `For "${p.book_title}"`,
      href: "/library/manage",
    };
  }
  if (n.type === "library_extension_decision") {
    const p = n.payload as { decision: "approved" | "rejected"; book_title: string; reason: string | null };
    return {
      title: `Extension ${p.decision} for "${p.book_title}"`,
      subtitle: p.reason || "",
      href: "/library/me",
    };
  }
  return { title: n.type, subtitle: "", href: "/notifications" };
}

export function NotificationsList({ initial }: { initial: Notification[] }) {
  const [optimistic, applyOp] = useOptimistic(
    initial,
    (current: Notification[], op: { type: "read"; id: string } | { type: "readAll" }) => {
      if (op.type === "readAll")
        return current.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
      return current.map((n) =>
        n.id === op.id ? { ...n, read_at: new Date().toISOString() } : n,
      );
    },
  );
  const [, startTransition] = useTransition();

  const unreadCount = optimistic.filter((n) => !n.read_at).length;

  if (optimistic.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">No notifications yet.</p>;
  }

  return (
    <div>
      {unreadCount > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              startTransition(async () => {
                applyOp({ type: "readAll" });
                await markAllReadAction();
              });
            }}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Mark all read
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {optimistic.map((n) => {
          const { title, subtitle, href } = renderNotification(n);
          const unread = !n.read_at;
          return (
            <li key={n.id}>
              <Link
                href={href}
                onClick={() => {
                  if (!unread) return;
                  startTransition(async () => {
                    applyOp({ type: "read", id: n.id });
                    await markReadAction(n.id);
                  });
                }}
                className={`block bg-white border rounded-xl px-4 py-3 transition-colors hover:border-indigo-300 ${
                  unread ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                      {title}
                    </div>
                    {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
                  </div>
                  <div className="text-xs text-slate-400 flex-shrink-0">{formatRelative(n.created_at)}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
