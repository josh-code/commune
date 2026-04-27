export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-16 bg-slate-200 rounded mb-1" />
      <div className="flex items-center justify-between mt-1 mb-6">
        <div className="h-7 w-20 bg-slate-200 rounded" />
        <div className="h-8 w-28 bg-slate-200 rounded-lg" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="w-3 h-3 rounded-full bg-slate-200 flex-shrink-0" />
            <div className="flex-1 h-3.5 bg-slate-200 rounded" />
            <div className="h-3 w-20 bg-slate-100 rounded" />
            <div className="h-3 w-16 bg-slate-100 rounded" />
            <div className="h-3 w-14 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
