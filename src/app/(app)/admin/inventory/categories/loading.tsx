export default function Loading() {
  return (
    <div className="max-w-2xl animate-pulse">
      <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-32 bg-slate-200 rounded mt-1 mb-6" />
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-slate-200" />
            <div className="flex-1 h-7 bg-slate-100 rounded" />
            <div className="h-4 w-12 bg-slate-100 rounded" />
            <div className="h-6 w-12 bg-slate-100 rounded" />
            <div className="h-6 w-14 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
      <div className="h-16 bg-slate-100 rounded-xl mt-4" />
    </div>
  );
}
