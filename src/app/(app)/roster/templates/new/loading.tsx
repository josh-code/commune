export default function Loading() {
  return (
    <div className="max-w-md animate-pulse">
      <div className="space-y-1 mb-6">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        <div className="h-7 w-40 bg-slate-200 rounded mt-1" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="space-y-1.5">
            <div className="h-3.5 w-28 bg-slate-200 rounded" />
            <div className="h-9 bg-slate-100 rounded-lg" />
          </div>
        ))}
        <div className="h-9 w-36 bg-slate-200 rounded-lg mt-2" />
      </div>
    </div>
  );
}
