export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return <div className={`${width} ${height} bg-white/[0.06] rounded-lg animate-pulse`} />
}

export function SkeletonCard() {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-3 animate-pulse">
      <div className="h-4 bg-white/[0.06] rounded w-1/3" />
      <div className="h-8 bg-white/[0.06] rounded w-2/3" />
      <div className="h-3 bg-white/[0.06] rounded w-full" />
      <div className="h-3 bg-white/[0.06] rounded w-4/5" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-white/5 animate-pulse">
      <div className="w-10 h-10 bg-white/[0.06] rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-white/[0.06] rounded w-3/4" />
        <div className="h-3 bg-white/[0.06] rounded w-1/2" />
      </div>
      <div className="h-6 w-16 bg-white/[0.06] rounded-full" />
    </div>
  )
}

export function SkeletonGrid({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonList({ count = 5 }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}