"use client";

import { useTransition } from "react";
import { deleteItemAction, updateItemAction } from "./actions";

type Category = { id: string; name: string };
type Item = {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
  tracked_individually: boolean;
  total_quantity: number;
  serial_number: string | null;
  condition: "good" | "needs_repair" | "out_of_service";
  condition_notes: string | null;
  approval_required: boolean;
  location: string | null;
  is_public: boolean;
  photo_url: string | null;
};

export function EditItemForm({ item, categories }: { item: Item; categories: Category[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <form action={updateItemAction.bind(null, item.id)} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Item name</label>
          <input type="text" name="name" required defaultValue={item.name} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Category</label>
          <select name="category_id" required defaultValue={item.category_id} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Description</label>
          <textarea name="description" rows={2} defaultValue={item.description ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="tracked_individually" defaultChecked={item.tracked_individually} className="rounded border-slate-300 text-indigo-600" />
          Tracked individually
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Total quantity</label>
          <input type="number" name="total_quantity" min="1" defaultValue={item.total_quantity} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Serial number</label>
          <input type="text" name="serial_number" defaultValue={item.serial_number ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Condition</label>
          <select name="condition" defaultValue={item.condition} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="good">Good</option>
            <option value="needs_repair">Needs repair</option>
            <option value="out_of_service">Out of service</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Condition notes</label>
          <input type="text" name="condition_notes" defaultValue={item.condition_notes ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Location</label>
          <input type="text" name="location" defaultValue={item.location ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Photo URL</label>
          <input type="url" name="photo_url" defaultValue={item.photo_url ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="approval_required" defaultChecked={item.approval_required} className="rounded border-slate-300 text-indigo-600" />
          Member reservations need approval
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="is_public" defaultChecked={item.is_public} className="rounded border-slate-300 text-indigo-600" />
          Visible to members
        </label>

        <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          Save
        </button>
      </form>

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm(`Delete "${item.name}"? This is only allowed if no active reservations exist.`)) return;
          startTransition(async () => {
            await deleteItemAction(item.id);
          });
        }}
        className="mt-4 text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
      >
        Delete item
      </button>
    </>
  );
}
