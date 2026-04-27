export default function Loading() {
  return (
    <div className="max-w-2xl animate-pulse">
      <div className="h-4 w-16 bg-slate-200 rounded mb-4" />
      <div className="flex items-center gap-3 mb-6">
        <div className="w-4 h-4 rounded-full bg-slate-200" />
        <div className="h-7 w-40 bg-slate-200 rounded" />
      </div>

      {/* Positions card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="h-4 w-24 bg-slate-200 rounded mb-4" />
        <div className="space-y-2 mb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-2 py-1">
              <div className="flex-1 h-3.5 bg-slate-200 rounded" />
              <div className="h-6 w-16 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
          <div className="h-8 w-20 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* Members card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="h-4 w-20 bg-slate-200 rounded mb-4" />
        <div className="space-y-3 mb-4">
          {[1, 2].map(i => (
            <div key={i} className="flex items-center gap-3 py-1">
              <div className="flex-1 h-3.5 bg-slate-200 rounded" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
              <div className="h-6 w-16 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
          <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
          <div className="h-8 w-20 bg-slate-200 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
