export default function Loading() {
  return (
    <div className="max-w-md animate-pulse">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="h-5 w-20 bg-slate-200 rounded" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex gap-3">
            <div className="h-3.5 w-16 bg-slate-200 rounded flex-shrink-0" />
            <div className="h-3.5 flex-1 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
