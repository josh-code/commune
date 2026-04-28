export default function Loading() {
  return (
    <div className="max-w-3xl animate-pulse">
      <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
      <div className="flex items-center justify-between mt-1 mb-6">
        <div className="h-7 w-20 bg-slate-200 rounded" />
        <div className="h-8 w-28 bg-slate-200 rounded-lg" />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
        <div className="h-8 w-32 bg-slate-100 rounded-lg" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            <div className="flex-1 h-4 bg-slate-200 rounded" />
            <div className="h-3 w-16 bg-slate-100 rounded" />
            <div className="h-5 w-16 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
