/**
 * Paste in the browser console while the app is open (not signed in to cloud,
 * or it will be overwritten on next sync). Then reload.
 */
(async () => {
  const res = await fetch('/sample-data/reporting-demo.json')
  if (!res.ok) {
    console.error('Could not load demo file. Is the dev server running?')
    return
  }
  const data = await res.json()
  localStorage.setItem('student-absence-tracker-v2', JSON.stringify(data))
  localStorage.removeItem('student-absence-tracker-reports-v1')
  console.log('Reporting demo loaded. Reloading…')
  location.reload()
})()
