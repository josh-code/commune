// FRAGMENT for merge: insert this into renderNotification() in NotificationsList.tsx
// (NotificationsList.tsx is created by Plan C; this fragment will be merged into it after Plan C lands.)
//
// if (n.type === "brief_submitted") {
//   const p = n.payload as {
//     brief_id: string;
//     service_id: string;
//     service_name: string;
//     service_date: string;
//     speaker_name: string;
//   };
//   return {
//     title: `${p.speaker_name} submitted the brief`,
//     subtitle: `For ${p.service_name} (${p.service_date})`,
//     href: `/brief/${p.service_id}`,
//   };
// }
