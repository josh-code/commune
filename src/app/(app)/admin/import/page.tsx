"use client";

import { useState } from "react";
import { parseCsv, type CsvRow } from "@/lib/csv";
import { bulkImportAction, type ImportResult } from "./actions";

type Step = "upload" | "preview" | "results";

function csvCell(value: string): string {
  // Wrap in double-quotes and escape internal double-quotes
  return `"${value.replace(/"/g, '""')}"`;
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ line: number; message: string }>>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows: parsed, errors } = parseCsv(text);
      setRows(parsed);
      setParseErrors(errors);
      setStep("preview");
    };
    reader.readAsText(file);
  }

  async function handleConfirm() {
    setIsLoading(true);
    const formData = new FormData();
    formData.set("rows", JSON.stringify(rows));
    const res = await bulkImportAction(formData);
    setResult(res);
    setStep("results");
    setIsLoading(false);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-2">Import members</h1>
      <p className="text-sm text-slate-500 mb-6">
        Upload a CSV with columns: <code className="bg-slate-100 px-1 rounded">name, email, phone, teams</code>.
        Teams are pipe-separated (e.g. <code className="bg-slate-100 px-1 rounded">Worship|Sound</code>).
      </p>

      {step === "upload" && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <label className="cursor-pointer">
            <div className="text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-2">
              Click to choose a CSV file
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={handleFile}
            />
          </label>
          <p className="text-xs text-slate-400">or drag and drop</p>
        </div>
      )}

      {step === "preview" && (
        <div>
          {parseErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm font-medium text-red-800 mb-2">
                {parseErrors.length} row{parseErrors.length > 1 ? "s" : ""} skipped due to errors:
              </p>
              <ul className="text-xs text-red-700 space-y-0.5">
                {parseErrors.map((e) => (
                  <li key={e.line}>Line {e.line}: {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">
              {rows.length} member{rows.length !== 1 ? "s" : ""} ready to import
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Email</th>
                    <th className="px-4 py-2 text-left">Phone</th>
                    <th className="px-4 py-2 text-left">Teams</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 text-slate-600">{r.email}</td>
                      <td className="px-4 py-2 text-slate-600">{r.phone || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{r.teams.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={isLoading || rows.length === 0}
              className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Importing…" : `Import ${rows.length} member${rows.length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => { setStep("upload"); setRows([]); setParseErrors([]); }}
              className="text-sm text-slate-500 hover:text-slate-900 px-4 py-2"
            >
              Choose different file
            </button>
          </div>
        </div>
      )}

      {step === "results" && result && (
        <div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
            <p className="text-sm font-medium text-green-800">
              Import complete: {result.created} created
              {result.skipped.length > 0 && `, ${result.skipped.length} skipped (already exist)`}
              {result.errors.length > 0 && `, ${result.errors.length} failed`}
            </p>
          </div>

          {result.results.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Invite URLs</span>
                <a
                  href={`data:text/csv;charset=utf-8,name,email,invite_url\n${result.results
                    .map((r) => [r.name, r.email, r.inviteUrl].map(csvCell).join(","))
                    .join("\n")}`}
                  download="invite-urls.csv"
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Download CSV
                </a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Email</th>
                      <th className="px-4 py-2 text-left">Invite URL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.results.map((r) => (
                      <tr key={r.email}>
                        <td className="px-4 py-2">{r.name}</td>
                        <td className="px-4 py-2 text-slate-600">{r.email}</td>
                        <td className="px-4 py-2">
                          <code className="text-xs text-indigo-600 break-all">{r.inviteUrl}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={() => { setStep("upload"); setRows([]); setResult(null); }}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
