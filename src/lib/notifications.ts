export type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type NotificationView = {
  title: string;
  subtitle: string;
  href: string;
};

export function renderNotification(n: Notification): NotificationView {
  if (n.type === "hospitality_order_requested") {
    const p = n.payload as {
      service_id: string; service_name: string; service_date: string; item_count: number;
    };
    return {
      title: `Hospitality requested ${p.item_count} item${p.item_count === 1 ? "" : "s"}`,
      subtitle: `For ${p.service_name} (${p.service_date})`,
      href: `/hospitality/services/${p.service_id}`,
    };
  }
  if (n.type === "brief_submitted") {
    const p = n.payload as {
      brief_id: string; service_id: string; service_name: string; service_date: string; speaker_name: string;
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

export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
