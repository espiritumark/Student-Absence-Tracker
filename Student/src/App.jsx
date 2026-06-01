import { useState } from 'react'
import AttendanceImport from './components/AttendanceImport'
import AttendanceSheet from './components/AttendanceSheet'
import AuthPanel from './components/AuthPanel'
import ClassManager from './components/ClassManager'
import Dashboard from './components/Dashboard'
import LoadingScreen from './components/LoadingScreen'
import { useAuth } from './contexts/AuthContext'
import { useStore } from './hooks/useStore'
import { getAllAlerts } from './utils/alerts'
import { getAllStudentAbsenceSummaries } from './utils/attendanceStats'
import { isOcrRunning } from './utils/ocrSession'

function AppContent() {
  const [tab, setTab] = useState('import')

  function switchTab(nextTab) {
    if (nextTab !== tab) {
      document.activeElement?.blur?.()
    }
    setTab(nextTab)
  }

  const { user, loading: authLoading, cloudEnabled } = useAuth()
  const store = useStore()

  const alertCount = getAllAlerts(store.classes, store.attendance).length
  const trackedCount = getAllStudentAbsenceSummaries(store.classes, store.attendance).length

  const TABS = [
    { id: 'import', label: 'Record Attendance' },
    {
      id: 'dashboard',
      label: 'Dashboard',
      badge: alertCount || trackedCount,
    },
    { id: 'attendance', label: 'Mark Manually' },
    { id: 'classes', label: 'Classes' },
  ]

  const blockUiForLoading =
    (cloudEnabled && authLoading) || (store.initialLoading && !isOcrRunning())

  if (blockUiForLoading) {
    return (
      <div className="app">
        <LoadingScreen
          message={
            authLoading ? 'Checking sign-in status…' : 'Loading your attendance data…'
          }
        />
      </div>
    )
  }

  const showSignInBanner = cloudEnabled && !user

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <h1>Student Absence Tracker</h1>
            <p className="tagline">
              Import daily attendance from JSON, track absences locally or in the cloud, and
              get warned about extended absences.
            </p>
          </div>
          <AuthPanel />
        </div>

        {showSignInBanner && (
          <div className="info-banner app-banner">
            <strong>Sign in</strong> to save attendance to your cloud account across devices.
            Without signing in, data stays in this browser only and is not uploaded.
          </div>
        )}

        {store.syncError && (
          <div className="error-banner app-banner banner-dismissible" role="alert">
            <span>{store.syncError}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm banner-dismiss"
              onClick={store.clearSyncError}
              aria-label="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        )}

        {store.useCloud && (
          <p className="cloud-badge" aria-label="Cloud sync active">
            Cloud sync active
            {store.syncing && <span className="sync-indicator"> · Syncing…</span>}
          </p>
        )}
      </header>

      <nav className="tabs" aria-label="Main sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => switchTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="tab-badge" aria-label={`${t.badge} items`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="tab-panels">
        <div className="tab-panel" hidden={tab !== 'import'} aria-hidden={tab !== 'import'}>
          <AttendanceImport
            importPortalSession={store.importPortalSession}
            classes={store.classes}
            attendance={store.attendance}
            isActive={tab === 'import'}
            onGoToWarnings={() => switchTab('dashboard')}
          />
        </div>
        <div className="tab-panel" hidden={tab !== 'dashboard'} aria-hidden={tab !== 'dashboard'}>
          <Dashboard classes={store.classes} attendance={store.attendance} />
        </div>
        <div className="tab-panel" hidden={tab !== 'attendance'} aria-hidden={tab !== 'attendance'}>
          <AttendanceSheet
            classes={store.classes}
            attendance={store.attendance}
            setAttendance={store.setAttendance}
            setSessionMeta={store.setSessionMeta}
          />
        </div>
        <div className="tab-panel" hidden={tab !== 'classes'} aria-hidden={tab !== 'classes'}>
          <ClassManager {...store} />
        </div>
      </main>

      <footer className="app-footer">
        {store.useCloud
          ? 'Signed in — changes save to your cloud account.'
          : cloudEnabled
            ? 'Not signed in — data saves in this browser only (not uploaded).'
            : 'Data saves in this browser only.'}
      </footer>
    </div>
  )
}

export default function App() {
  return <AppContent />
}
