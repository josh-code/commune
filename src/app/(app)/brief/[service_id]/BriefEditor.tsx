"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Send, Trash2, FileText, Image as ImageIcon, GripVertical, Calendar } from "lucide-react";
import { BIBLE_VERSIONS } from "@/lib/bible-structure";
import { formatVerseRef, computeBriefStatus } from "@/lib/brief";
import { VerseInput } from "@/components/brief/VerseInput";
import { AttachmentUpload } from "@/components/brief/AttachmentUpload";
import {
  updateBriefDetailsAction,
  addVerseAction,
  deleteVerseAction,
  reorderVersesAction,
  addAttachmentAction,
  deleteAttachmentAction,
  submitBriefAction,
  updateDeadlineAction,
} from "./actions";

type Brief = {
  id: string;
  service_id: string;
  sermon_title: string | null;
  sermon_notes: string | null;
  default_bible_version: string;
  deadline: string;
  sermon_submitted_at: string | null;
};

type Verse = {
  id: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  version_override: string | null;
  position: number;
};

type Attachment = {
  id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  size_bytes: number;
};

type Props = {
  brief: Brief;
  initialVerses: Verse[];
  initialAttachments: Attachment[];
  canEdit: boolean;
  isAdmin: boolean;
};

type VerseOp =
  | { type: "remove"; id: string }
  | { type: "reorder"; ids: string[] };

type AttOp = { type: "remove"; id: string };

function reorderLocal(ids: string[], moved: string, targetIndex: number): string[] {
  const from = ids.indexOf(moved);
  if (from === -1) return ids;
  const result = [...ids];
  result.splice(from, 1);
  result.splice(targetIndex, 0, moved);
  return result;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function BriefEditor({ brief, initialVerses, initialAttachments, canEdit, isAdmin }: Props) {
  // Bind useOptimistic directly to the server-supplied props so revalidatePath
  // resets the baseline correctly. No intermediate useState.
  const [optimisticVerses, applyVerseOp] = useOptimistic(
    initialVerses,
    (current: Verse[], op: VerseOp) => {
      if (op.type === "remove") return current.filter((v) => v.id !== op.id);
      return op.ids
        .map((id) => current.find((v) => v.id === id))
        .filter((v): v is Verse => Boolean(v))
        .map((v, i) => ({ ...v, position: i + 1 }));
    },
  );
  const [optimisticAtts, applyAttOp] = useOptimistic(
    initialAttachments,
    (current: Attachment[], op: AttOp) => current.filter((a) => a.id !== op.id),
  );

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [showDeadline, setShowDeadline] = useState(false);
  const [deadline, setDeadline] = useState(brief.deadline);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const status = computeBriefStatus({
    sermon_submitted_at: brief.sermon_submitted_at,
    deadline: brief.deadline,
  });

  const deadlineDate = new Date(brief.deadline);
  const now = new Date();
  const msDiff = deadlineDate.getTime() - now.getTime();
  const daysDiff = Math.round(msDiff / (1000 * 60 * 60 * 24));
  const deadlineHint = brief.sermon_submitted_at
    ? `Submitted ${new Date(brief.sermon_submitted_at).toLocaleString()}`
    : daysDiff >= 0
      ? `${daysDiff} day${daysDiff === 1 ? "" : "s"} remaining`
      : `${-daysDiff} day${-daysDiff === 1 ? "" : "s"} late`;

  function handleDrop(targetVerseId: string) {
    if (!draggedId || draggedId === targetVerseId || !canEdit) return;
    const ids = optimisticVerses.map((v) => v.id);
    const targetIndex = ids.indexOf(targetVerseId);
    const newIds = reorderLocal(ids, draggedId, targetIndex);
    startTransition(() => {
      applyVerseOp({ type: "reorder", ids: newIds });
      reorderVersesAction(brief.id, brief.service_id, newIds);
    });
    setDraggedId(null);
  }

  return (
    <div className="space-y-8">
      {/* ── Status header ───────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {status === "complete" && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Complete</span>
            )}
            {status === "pending" && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>
            )}
            {status === "late" && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Late</span>
            )}
            <span className="text-xs text-slate-500">{deadlineHint}</span>
          </div>
          <div className="text-xs text-slate-400">
            Deadline: {deadlineDate.toLocaleString()}
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowDeadline((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 px-2 py-1.5 rounded-lg"
          >
            <Calendar className="w-3.5 h-3.5" />
            Adjust deadline
          </button>
        )}
      </div>

      {showDeadline && (
        <form
          action={async () => {
            startTransition(async () => {
              await updateDeadlineAction(brief.id, new Date(deadline).toISOString());
              setShowDeadline(false);
            });
          }}
          className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-2"
        >
          <input
            type="datetime-local"
            value={new Date(deadline).toISOString().slice(0, 16)}
            onChange={(e) => setDeadline(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
          />
          <button
            type="submit"
            className="text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setShowDeadline(false)}
            className="text-xs text-slate-500"
          >
            Cancel
          </button>
        </form>
      )}

      {/* ── Sermon details ──────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Sermon</h2>
        {canEdit ? (
          <form
            action={updateBriefDetailsAction.bind(null, brief.id)}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Title</label>
              <input
                type="text" name="sermon_title" defaultValue={brief.sermon_title ?? ""}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Notes</label>
              <textarea
                name="sermon_notes" defaultValue={brief.sermon_notes ?? ""} rows={4}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Default Bible version</label>
              <select
                name="default_bible_version" defaultValue={brief.default_bible_version}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
              >
                {BIBLE_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <button
              type="submit"
              className="text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
            >
              Save details
            </button>
          </form>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <div>
              <div className="text-xs text-slate-500">Title</div>
              <div className="text-sm text-slate-900">{brief.sermon_title || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Notes</div>
              <div className="text-sm text-slate-900 whitespace-pre-wrap">{brief.sermon_notes || "—"}</div>
            </div>
            <div className="text-xs text-slate-500">Default version: {brief.default_bible_version}</div>
          </div>
        )}
      </section>

      {/* ── Verses ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Verses</h2>
        <ul className="space-y-2 mb-3">
          {optimisticVerses.map((v) => (
            <li
              key={v.id}
              draggable={canEdit}
              onDragStart={() => setDraggedId(v.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(v.id)}
              className={`flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 ${
                draggedId === v.id ? "opacity-50" : ""
              }`}
            >
              {canEdit && <GripVertical className="w-4 h-4 text-slate-300 cursor-grab" />}
              <span className="flex-1 text-sm text-slate-900">
                {formatVerseRef(v, brief.default_bible_version)}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      applyVerseOp({ type: "remove", id: v.id });
                      await deleteVerseAction(v.id, brief.service_id);
                    });
                  }}
                  className="text-slate-300 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {canEdit && (
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <VerseInput
              onSubmit={(value) => {
                startTransition(async () => {
                  await addVerseAction(brief.id, value);
                });
              }}
            />
          </div>
        )}
      </section>

      {/* ── Attachments ─────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Attachments</h2>
        <ul className="space-y-2 mb-3">
          {optimisticAtts.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2"
            >
              {a.mime_type.startsWith("image/")
                ? <ImageIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                : <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />}
              <a
                href={a.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-sm text-indigo-600 hover:text-indigo-800 truncate"
              >
                {a.file_name}
              </a>
              <span className="text-xs text-slate-400 flex-shrink-0">{fmtBytes(a.size_bytes)}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`Remove "${a.file_name}"?`)) return;
                    startTransition(async () => {
                      applyAttOp({ type: "remove", id: a.id });
                      await deleteAttachmentAction(a.id, brief.service_id);
                    });
                  }}
                  className="text-slate-300 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {canEdit && (
          <AttachmentUpload
            briefId={brief.id}
            onUploaded={(payload) => {
              startTransition(async () => {
                await addAttachmentAction(brief.id, brief.service_id, payload);
                // No optimistic add — revalidatePath in the server action
                // refreshes initialAttachments so the row appears next render.
              });
            }}
          />
        )}
      </section>

      {/* ── Submit ──────────────────────────────────────────── */}
      {canEdit && (
        <div>
          {submitMsg && (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-3">{submitMsg}</p>
          )}
          <button
            type="button"
            onClick={() => {
              if (!confirm(brief.sermon_submitted_at ? "Resubmit the brief?" : "Submit the brief?")) return;
              startTransition(async () => {
                await submitBriefAction(brief.id);
                setSubmitMsg(brief.sermon_submitted_at ? "Resubmitted." : "Submitted — Media team notified.");
              });
            }}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-amber-500 text-white px-4 py-3 rounded-xl hover:bg-amber-600"
          >
            <Send className="w-4 h-4" />
            {brief.sermon_submitted_at ? "Resubmit brief" : "Submit brief"}
          </button>
        </div>
      )}
    </div>
  );
}
