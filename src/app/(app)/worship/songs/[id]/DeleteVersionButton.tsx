"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteVersionAction } from "./versions/new/actions";

type Props = {
  versionId: string;
  songId: string;
  versionLabel: string;
};

export function DeleteVersionButton({ versionId, songId, versionLabel }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete "${versionLabel}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteVersionAction(versionId, songId);
      if (res?.error) alert(res.error);
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      title={`Delete ${versionLabel}`}
      className="text-slate-300 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}
