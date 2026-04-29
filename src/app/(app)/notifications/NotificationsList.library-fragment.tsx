// FRAGMENT for merge: insert these branches into renderNotification() in NotificationsList.tsx
// (NotificationsList.tsx is created by Plan C; this fragment will be merged into it after Plan C lands.)
//
// if (n.type === "library_loan_overdue") {
//   const p = n.payload as { loan_id: string; book_title: string; days_overdue: number };
//   return {
//     title: `"${p.book_title}" is ${p.days_overdue} day${p.days_overdue === 1 ? "" : "s"} overdue`,
//     subtitle: "Please return it as soon as possible.",
//     href: "/library/me",
//   };
// }
// if (n.type === "library_book_available") {
//   const p = n.payload as { book_id: string; book_title: string };
//   return {
//     title: `"${p.book_title}" is available for you`,
//     subtitle: "Visit the library to pick it up.",
//     href: `/library/${p.book_id}`,
//   };
// }
// if (n.type === "library_extension_requested") {
//   const p = n.payload as { extension_id: string; loan_id: string; book_title: string; borrower_name: string };
//   return {
//     title: `${p.borrower_name} requested an extension`,
//     subtitle: `For "${p.book_title}"`,
//     href: "/library/manage",
//   };
// }
// if (n.type === "library_extension_decision") {
//   const p = n.payload as { decision: "approved" | "rejected"; book_title: string; reason: string | null };
//   return {
//     title: `Extension ${p.decision} for "${p.book_title}"`,
//     subtitle: p.reason || "",
//     href: "/library/me",
//   };
// }
