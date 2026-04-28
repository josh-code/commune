export default function Loading() {
  return (
    <div className="max-w-3xl animate-pulse">
      <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-36 bg-slate-200 rounded mt-1 mb-6" />
      {[1, 2, 3].map(s => (
        <div key={s} className="mb-6">
          <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 mb-2 space-y-2">
              <div className="h-4 w-40 bg-slate-200 rounded" />
              <div className="h-3 w-48 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
