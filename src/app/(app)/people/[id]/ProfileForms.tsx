"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  updateProfileAction,
  updateStatusAction,
  updateRoleAction,
  addTeamAction,
  removeTeamAction,
  removeMemberAction,
  type UpdateProfileState,
} from "./actions";

// ── Status form ──────────────────────────────────────────────────────────────

export function StatusForm({
  profileId,
  currentStatus,
}: {
  profileId: string;
  currentStatus: string;
}) {
  return (
    <form action={updateStatusAction.bind(null, profileId)}>
      <label className="text-xs text-slate-600">
        Status
        <select
          name="status"
          defaultValue={currentStatus}
          className="ml-2 text-xs border border-slate-200 rounded px-2 py-1 bg-white"
          onChange={(e) => (e.target.form as HTMLFormElement).requestSubmit()}
        >
          <option value="active">Active</option>
          <option value="on_leave">On leave</option>
          <option value="left">Left</option>
        </select>
      </label>
    </form>
  );
}

// ── Role form ────────────────────────────────────────────────────────────────

export function RoleForm({
  profileId,
  currentRole,
}: {
  profileId: string;
  currentRole: string;
}) {
  return (
    <form action={updateRoleAction.bind(null, profileId)}>
      <label className="text-xs text-slate-600">
        Role
        <select
          name="role"
          defaultValue={currentRole}
          className="ml-2 text-xs border border-slate-200 rounded px-2 py-1 bg-white"
          onChange={(e) => (e.target.form as HTMLFormElement).requestSubmit()}
        >
          <option value="member">Member</option>
          <option value="logistics">Logistics</option>
          <option value="admin">Admin</option>
        </select>
      </label>
    </form>
  );
}

// ── Remove team button ───────────────────────────────────────────────────────

export function RemoveTeamForm({
  profileId,
  teamId,
}: {
  profileId: string;
  teamId: string;
}) {
  return (
    <form action={removeTeamAction.bind(null, profileId)} className="inline">
      <input type="hidden" name="teamId" value={teamId} />
      <button
        type="submit"
        className="text-indigo-400 hover:text-indigo-700 leading-none ml-1"
        aria-label="Remove team"
      >
        ×
      </button>
    </form>
  );
}

// ── Add team dropdown ────────────────────────────────────────────────────────

export function AddTeamForm({
  profileId,
  allTeams,
  assignedTeamIds,
}: {
  profileId: string;
  allTeams: { id: string; name: string; color: string }[];
  assignedTeamIds: Set<string>;
}) {
  const available = allTeams.filter((t) => !assignedTeamIds.has(t.id));
  if (available.length === 0) return null;

  return (
    <form action={addTeamAction.bind(null, profileId)} className="flex items-center gap-2">
      <select
        name="teamId"
        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        {available.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        + Add team
      </button>
    </form>
  );
}

// ── Remove member button ──────────────────────────────────────────────────────

export function RemoveMemberForm({ profileId }: { profileId: string }) {
  return (
    <form action={removeMemberAction.bind(null, profileId)}>
      <button
        type="submit"
        className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
        onClick={(e) => {
          if (!confirm("Mark this member as left? This cannot be undone easily.")) {
            e.preventDefault();
          }
        }}
      >
        Remove member
      </button>
    </form>
  );
}

// ── Edit profile form ────────────────────────────────────────────────────────

export function EditProfileForm({
  profile,
  isAdmin,
  profileId,
}: {
  profile: {
    first_name: string;
    last_name: string;
    phone: string | null;
    address: string | null;
    bio: string | null;
  };
  isAdmin: boolean;
  profileId: string;
}) {
  const initial: UpdateProfileState = { status: "idle" };
  const boundAction = updateProfileAction.bind(null, profileId);
  const [state, formAction, isPending] = useActionState(boundAction, initial);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 mb-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Edit profile</h2>
      <form action={formAction} className="space-y-4">
        {isAdmin && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="firstName" className="text-xs font-medium text-slate-600">First name</label>
              <input
                id="firstName"
                name="firstName"
                defaultValue={profile.first_name}
                required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="lastName" className="text-xs font-medium text-slate-600">Last name</label>
              <input
                id="lastName"
                name="lastName"
                defaultValue={profile.last_name}
                required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="phone" className="text-xs font-medium text-slate-600">Phone</label>
          <input
            id="phone"
            name="phone"
            defaultValue={profile.phone ?? ""}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="address" className="text-xs font-medium text-slate-600">Address</label>
          <input
            id="address"
            name="address"
            defaultValue={profile.address ?? ""}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="bio" className="text-xs font-medium text-slate-600">Bio</label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={profile.bio ?? ""}
            rows={3}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
          />
        </div>

        {state.status === "error" && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
          <Link
            href={`/people/${profileId}`}
            className="text-sm font-medium text-slate-500 hover:text-slate-900 px-4 py-2"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
