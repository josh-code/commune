"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { walkUpCheckoutAction } from "./actions";

type Profile = { id: string; first_name: string; last_name: string; email: string };
type Book = { id: string; title: string; author: string };
type Copy = { id: string; copy_number: number; status: string };

export function CheckoutForm() {
  const [profileQ, setProfileQ] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [borrower, setBorrower] = useState<Profile | null>(null);

  const [bookQ, setBookQ] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [book, setBook] = useState<Book | null>(null);

  const [copies, setCopies] = useState<Copy[]>([]);
  const [copyId, setCopyId] = useState<string>("");

  const [dueAt, setDueAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  const [error, setError] = useState<string | null>(null);

  // Profile typeahead
  useEffect(() => {
    if (profileQ.trim().length < 2) { setProfiles([]); return; }
    const t = setTimeout(async () => {
      const supabase = createClient();
      const q = profileQ.trim();
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8);
      setProfiles((data ?? []) as Profile[]);
    }, 200);
    return () => clearTimeout(t);
  }, [profileQ]);

  // Book typeahead
  useEffect(() => {
    if (bookQ.trim().length < 2) { setBooks([]); return; }
    const t = setTimeout(async () => {
      const supabase = createClient();
      const q = bookQ.trim();
      const { data } = await supabase
        .from("library_books")
        .select("id, title, author")
        .or(`title.ilike.%${q}%,author.ilike.%${q}%`)
        .limit(8);
      setBooks((data ?? []) as Book[]);
    }, 200);
    return () => clearTimeout(t);
  }, [bookQ]);

  // Load copies when book selected
  useEffect(() => {
    if (!book) { setCopies([]); setCopyId(""); return; }
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("library_book_copies")
        .select("id, copy_number, status")
        .eq("book_id", book.id)
        .eq("status", "available")
        .order("copy_number");
      setCopies((data ?? []) as Copy[]);
      setCopyId((data && data[0]?.id) ?? "");
    })();
  }, [book]);

  return (
    <form
      action={async (formData) => {
        if (!borrower || !copyId || !dueAt) { setError("Fill out all fields."); return; }
        formData.set("borrower_id", borrower.id);
        formData.set("copy_id", copyId);
        formData.set("due_at", dueAt);
        const res = await walkUpCheckoutAction(formData);
        if (res?.error) setError(res.error);
      }}
      className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Borrower</label>
        {borrower ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-slate-900 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-200">
              {borrower.first_name} {borrower.last_name} <span className="text-slate-500">({borrower.email})</span>
            </span>
            <button type="button" onClick={() => { setBorrower(null); setProfileQ(""); }} className="text-xs text-slate-500">Change</button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text" value={profileQ} onChange={(e) => setProfileQ(e.target.value)}
              placeholder="Search name or email…" autoFocus
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none"
            />
            {profiles.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => { setBorrower(p); setProfileQ(""); setProfiles([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <div className="font-medium text-slate-900">{p.first_name} {p.last_name}</div>
                      <div className="text-xs text-slate-500">{p.email}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Book</label>
        {book ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-slate-900 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-200">
              {book.title} <span className="text-slate-500">— {book.author}</span>
            </span>
            <button type="button" onClick={() => { setBook(null); setBookQ(""); }} className="text-xs text-slate-500">Change</button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text" value={bookQ} onChange={(e) => setBookQ(e.target.value)}
              placeholder="Search title or author…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none"
            />
            {books.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {books.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => { setBook(b); setBookQ(""); setBooks([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <div className="font-medium text-slate-900">{b.title}</div>
                      <div className="text-xs text-slate-500">{b.author}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {book && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Copy</label>
          {copies.length === 0 ? (
            <p className="text-sm text-slate-400">No available copies.</p>
          ) : (
            <select value={copyId} onChange={(e) => setCopyId(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none">
              {copies.map((c) => <option key={c.id} value={c.id}>Copy #{c.copy_number}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Due date</label>
        <input
          type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none"
        />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <button
        type="submit"
        disabled={!borrower || !copyId}
        className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Check out
      </button>
    </form>
  );
}
