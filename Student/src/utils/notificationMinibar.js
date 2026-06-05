const minimized = new Map()
const listeners = new Set()

function emit() {
  const items = [...minimized.values()]
  listeners.forEach((fn) => fn(items))
}

export function subscribeMinimized(listener) {
  listeners.add(listener)
  listener([...minimized.values()])
  return () => listeners.delete(listener)
}

export function minimizeNotification(entry) {
  if (!entry?.key) return
  minimized.set(entry.key, {
    key: entry.key,
    title: entry.title,
    type: entry.type || 'loading',
    restore: entry.restore,
  })
  emit()
}

export function restoreMinimized(key) {
  const entry = minimized.get(key)
  if (!entry) return
  minimized.delete(key)
  emit()
  entry.restore?.()
}

export function removeMinimized(key) {
  if (!minimized.has(key)) return
  minimized.delete(key)
  emit()
}

export function clearMinimized() {
  minimized.clear()
  emit()
}
