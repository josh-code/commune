"use client";

import { useActionState } from "react";
import { sendInviteAction, type InviteFormState } from "./actions";

const initialState: InviteFormState = { status: "idle" };

export function InviteForm() {
  const [state, formAction, isPending] = useActionState(
    sendInviteAction,
    initialState,
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Send invite</h2>
      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="firstName" className="text-xs font-medium text-slate-600">First name</label>
            <input
              id="firstName"
              name="firstName"
              required
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="lastName" className="text-xs font-medium text-slate-600">Last name</label>
            <input
              id="lastName"
              name="lastName"
              required
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-xs font-medium text-slate-600">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="phone" className="text-xs font-medium text-slate-600">Phone (optional)</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {state.status === "error" && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}
        {state.status === "success" && state.inviteUrl && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
            <p className="font-medium text-green-900">Invite created.</p>
            <p className="mt-1 text-green-700 text-xs">Share this link:</p>
            <code className="mt-1 block break-all text-xs text-green-800">{state.inviteUrl}</code>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Sending…" : "Send invite"}
        </button>
      </form>
    </div>
  );
}
