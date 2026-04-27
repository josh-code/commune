export default function Loading() {
  return (
    <div className="max-w-md animate-pulse">
      <div className="h-4 w-16 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-28 bg-slate-200 rounded mt-1 mb-6" />
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div className="space-y-1.5">
          <div className="h-3.5 w-24 bg-slate-200 rounded" />
          <div className="h-9 bg-slate-100 rounded-lg" />
        </div>
        <div className="space-y-2">
          <div className="h-3.5 w-16 bg-slate-200 rounded" />
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="w-7 h-7 rounded-full bg-slate-200" />
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <div className="h-9 w-28 bg-slate-200 rounded-lg" />
          <div className="h-9 w-20 bg-slate-100 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
