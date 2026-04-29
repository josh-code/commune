"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";

type Props = {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
  category: { name: string; color: string } | null;
  available_count: number;
  total_count: number;
};

export function BookCard(p: Props) {
  return (
    <Link
      href={`/library/${p.id}`}
      className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-indigo-300 transition-colors"
    >
      <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center overflow-hidden">
        {p.cover_url
          ? <img src={p.cover_url} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          : <BookOpen className="w-10 h-10 text-slate-300" />}
      </div>
      <div className="p-3 space-y-1">
        <div className="text-sm font-medium text-slate-900 line-clamp-2">{p.title}</div>
        <div className="text-xs text-slate-500 truncate">{p.author}</div>
        <div className="flex items-center justify-between gap-2 pt-1">
          {p.category && (
            <span
              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: p.category.color + "20", color: p.category.color }}
            >
              {p.category.name}
            </span>
          )}
          <span className={`text-xs ${p.available_count > 0 ? "text-emerald-600" : "text-slate-400"}`}>
            {p.available_count > 0 ? `${p.available_count}/${p.total_count} in` : "Out"}
          </span>
        </div>
      </div>
    </Link>
  );
}
