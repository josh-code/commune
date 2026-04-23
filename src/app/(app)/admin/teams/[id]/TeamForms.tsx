// src/app/(app)/admin/teams/[id]/TeamForms.tsx
"use client";

import { useState, useTransition } from "react";
import { addPositionAction, assignMemberAction } from "./actions";

type Position = { id: string; name: string; order: number };
type Profile = { id: string; first_name: string; last_name: string };

export function AddPositionForm({ teamId }: { teamId: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set("name", name.trim());
    startTransition(async () => {
      const result = await addPositionAction(teamId, fd);
      if (result.error) {
        setError(result.error);
      } else {
        setName("");
        setError(null);
      }
    });
  };

  return (
    <div className="mt-3">
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <div className="flex gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="New position name"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <button
          onClick={submit}
          disabled={isPending || !name.trim()}
          className="text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export function AddMemberForm({
  teamId,
  positions,
  profiles,
}: {
  teamId: string;
  positions: Position[];
  profiles: Profile[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        + Add member
      </button>
    );
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await assignMemberAction(teamId, fd);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setError(null);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 rounded-lg p-4 space-y-3 mt-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        <select name="profileId" required className="text-sm border border-slate-200 rounded-lg px-2 py-1.5">
          <option value="">Member…</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
          ))}
        </select>
        <select name="positionId" required className="text-sm border border-slate-200 rounded-lg px-2 py-1.5">
          <option value="">Position…</option>
          {positions.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select name="teamRole" defaultValue="member" className="text-sm border border-slate-200 rounded-lg px-2 py-1.5">
          <option value="member">Member</option>
          <option value="leader">Leader</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={isPending}
          className="text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          Assign
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-sm text-slate-500 hover:text-slate-900 px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}
