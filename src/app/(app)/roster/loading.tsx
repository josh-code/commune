export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-24 bg-slate-200 rounded" />
        <div className="h-8 w-28 bg-slate-200 rounded-lg" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-48 bg-slate-200 rounded" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
            </div>
            <div className="h-5 w-14 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
