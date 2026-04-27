export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-20 bg-slate-200 rounded mb-6" />
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
            <div className="w-9 h-9 bg-slate-200 rounded-lg" />
            <div className="h-4 w-24 bg-slate-200 rounded" />
            <div className="h-3 w-40 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
