export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-16 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-36 bg-slate-200 rounded mb-6" />
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 max-w-md">
        <div className="space-y-1.5">
          <div className="h-3.5 w-20 bg-slate-200 rounded" />
          <div className="h-9 bg-slate-100 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3.5 w-24 bg-slate-200 rounded" />
          <div className="h-9 bg-slate-100 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3.5 w-16 bg-slate-200 rounded" />
          <div className="h-9 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-9 w-28 bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}
