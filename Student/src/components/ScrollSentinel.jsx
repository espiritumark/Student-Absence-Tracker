export default function ScrollSentinel({ sentinelRef, hasMore, label = 'Loading more…' }) {
  if (!hasMore) return null
  return (
    <div ref={sentinelRef} className="scroll-sentinel" aria-hidden="true">
      <span className="scroll-sentinel-label muted small">{label}</span>
    </div>
  )
}
