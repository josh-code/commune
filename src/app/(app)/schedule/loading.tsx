export default function Loading() {
  return (
    <div className="max-w-2xl space-y-6 animate-pulse">
      <div className="h-7 w-36 bg-slate-200 rounded" />

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-44 bg-slate-200 rounded" />
              <div className="h-3 w-32 bg-slate-100 rounded" />
            </div>
            <div className="h-5 w-16 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="h-4 w-40 bg-slate-200 rounded" />
        <div className="h-3 w-64 bg-slate-100 rounded" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <div className="w-4 h-4 rounded bg-slate-200" />
            <div className="flex-1 h-3.5 bg-slate-200 rounded" />
            <div className="h-3 w-12 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="h-4 w-28 bg-slate-200 rounded" />
        <div className="h-3 w-56 bg-slate-100 rounded" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-9 bg-slate-100 rounded-lg" />
          <div className="h-9 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-9 bg-slate-100 rounded-lg" />
        <div className="h-9 w-36 bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}
