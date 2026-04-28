export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-32 bg-slate-200 rounded mb-4" />
      <div className="flex gap-2 flex-wrap mb-5">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-7 w-20 bg-slate-100 rounded-full" />)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="h-32 bg-slate-100 rounded-lg" />
            <div className="h-4 w-32 bg-slate-200 rounded" />
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
              <div className="h-5 w-12 bg-slate-100 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
