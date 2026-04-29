import Link from "next/link";
import { requireWorshipWriteAccess } from "@/lib/auth";
import { NewSongForm } from "./NewSongForm";

export default async function NewSongPage() {
  await requireWorshipWriteAccess();
  return (
    <div className="max-w-md">
      <Link href="/worship/songs" className="text-sm text-slate-500 hover:text-slate-900">← Song bank</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Add song</h1>
      <NewSongForm />
    </div>
  );
}
