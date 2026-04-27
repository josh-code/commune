export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-16 bg-slate-200 rounded mb-1" />
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mt-1 mb-6">
        <div className="space-y-1.5">
          <div className="h-7 w-32 bg-slate-200 rounded" />
          <div className="h-4 w-48 bg-slate-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 bg-slate-200 rounded-lg" />
          <div className="h-8 w-24 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* Team grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="h-10 bg-slate-100 px-4 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <div className="h-3.5 w-24 bg-slate-300 rounded" />
            </div>
            <div className="p-3 space-y-2">
              {[1, 2, 3].map(j => (
                <div key={j} className="space-y-1">
                  <div className="h-3 w-20 bg-slate-200 rounded" />
                  <div className="h-9 bg-slate-100 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
