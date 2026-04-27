export default function Loading() {
  return (
    <div className="max-w-md animate-pulse">
      <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-48 bg-slate-200 rounded mt-1 mb-4" />
      <div className="h-48 bg-slate-100 rounded-xl mb-4" />
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 space-y-2">
        <div className="h-4 w-24 bg-slate-200 rounded" />
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-slate-100 rounded-full" />
          <div className="h-5 w-20 bg-slate-100 rounded-full" />
        </div>
        <div className="h-3 w-40 bg-slate-100 rounded" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="h-9 bg-slate-100 rounded-lg" />
          <div className="h-9 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-9 bg-slate-100 rounded-lg" />
        <div className="h-9 w-full bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}
