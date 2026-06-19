import { useEffect, useRef, useState } from 'react'

/** Reserve space for a fixed Ant Design table header when using scroll.y. */
export const ANT_TABLE_HEADER_OFFSET = 41

/** Reserve space for Ant Design table pagination when visible. */
export const ANT_TABLE_PAGINATION_OFFSET = 48

/** Ant Design small table body row (single line). */
export const ANT_TABLE_ROW_SMALL = 39

/** Small table row with a subtitle line (e.g. class list). */
export const ANT_TABLE_ROW_SMALL_TALL = 54

/**
 * Measure a flex scroll region so Ant Design Table scroll.y fits without double scrollbars.
 * Pass headerOffset when the ref wraps the full table (header + body) — scroll.y is body-only.
 * Pass remeasureKey when layout inputs change (e.g. class selected, row count).
 */
export function useScrollRegionHeight(defaultHeight = 200, headerOffset = 0, remeasureKey = '') {
  const ref = useRef(null)
  const [height, setHeight] = useState(Math.max(120, defaultHeight - headerOffset))

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    function update() {
      const available = el.clientHeight - headerOffset
      setHeight(available > 0 ? Math.max(120, available) : Math.max(120, defaultHeight - headerOffset))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [defaultHeight, headerOffset])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const available = el.clientHeight - headerOffset
    setHeight(available > 0 ? Math.max(120, available) : Math.max(120, defaultHeight - headerOffset))
  }, [remeasureKey, defaultHeight, headerOffset])

  return [ref, height]
}

/**
 * Use scroll.y only when rows exceed the available region — avoids clipped partial rows
 * and empty space below a short scroll viewport when everything fits.
 */
export function useAdaptiveTableScroll({
  rowCount = 0,
  rowHeight = ANT_TABLE_ROW_SMALL,
  headerOffset = 0,
  paginationOffset = 0,
  defaultHeight = 200,
  remeasureKey = '',
} = {}) {
  const chromeOffset = headerOffset + paginationOffset
  const [ref, availableBodyHeight] = useScrollRegionHeight(
    defaultHeight,
    chromeOffset,
    `${remeasureKey}:${rowCount}:${paginationOffset}`,
  )

  const contentBodyHeight = Math.max(0, rowCount) * rowHeight
  const needsScroll = rowCount > 0 && contentBodyHeight > availableBodyHeight

  let scrollY
  if (needsScroll) {
    const visibleRows = Math.max(1, Math.floor(availableBodyHeight / rowHeight))
    scrollY = visibleRows * rowHeight
  }

  return { ref, scrollY, needsScroll }
}
