import { useEffect, useRef, useState } from 'react'

/** Measure a flex scroll region so Ant Design Table scroll.y fits without double scrollbars. */
export function useScrollRegionHeight(defaultHeight = 200) {
  const ref = useRef(null)
  const [height, setHeight] = useState(defaultHeight)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    function update() {
      const next = el.clientHeight
      setHeight(next > 0 ? Math.max(120, next) : defaultHeight)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [defaultHeight])

  return [ref, height]
}
