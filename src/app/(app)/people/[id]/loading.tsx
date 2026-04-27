export default function Loading() {
  return (
    <div className="max-w-2xl animate-pulse">
      <div className="h-4 w-20 bg-slate-200 rounded mb-4" />

      {/* Profile header card */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
        <div className="p-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-slate-200 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-44 bg-slate-200 rounded" />
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
            </div>
          </div>
        </div>
        {/* Tab bar */}
        <div className="border-t border-slate-200 flex px-6 gap-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-9 w-20 bg-slate-100 rounded-t mt-1" />
          ))}
        </div>
      </div>

      {/* Content card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex gap-4">
            <div className="h-3.5 w-20 bg-slate-200 rounded flex-shrink-0" />
            <div className="h-3.5 flex-1 bg-slate-100 rounded" />
          </div>
        ))}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="h-3 w-24 bg-slate-200 rounded" />
          {[1, 2].map(i => (
            <div key={i} className="h-3.5 w-40 bg-slate-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
