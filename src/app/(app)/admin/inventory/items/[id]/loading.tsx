export default function Loading() {
  return (
    <div className="max-w-md animate-pulse">
      <div className="h-4 w-16 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-48 bg-slate-200 rounded mt-1 mb-6" />
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
          <div key={i} className="space-y-1.5">
            <div className="h-3.5 w-24 bg-slate-200 rounded" />
            <div className="h-9 bg-slate-100 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6 space-y-3">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        {[1, 2, 3].map(i => <div key={i} className="h-6 bg-slate-100 rounded" />)}
      </div>
    </div>
  );
}
