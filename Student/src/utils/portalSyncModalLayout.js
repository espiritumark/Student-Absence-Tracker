/** Hub sync modal — fixed viewport box; body height set via styles + CSS override. */
export const PORTAL_HUB_SYNC_MODAL_WIDTH = 1120
export const PORTAL_HUB_SYNC_MODAL_BODY_HEIGHT = 'min(calc(100svh - 3rem), 640px)'

/** Legacy portal modals */
export const PORTAL_SYNC_MODAL_WIDTH = 'min(960px, 90vw)'
export const PORTAL_HUB_SYNC_MODAL_HEIGHT = 'min(calc(100svh - 3rem), 920px)'

export const portalSyncModalStyles = {
  content: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: PORTAL_HUB_SYNC_MODAL_HEIGHT,
    overflow: 'hidden',
  },
}

export const portalHubSyncModalStyles = {
  content: {
    padding: 0,
    overflow: 'hidden',
  },
  body: {
    padding: 0,
    height: PORTAL_HUB_SYNC_MODAL_BODY_HEIGHT,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
}
