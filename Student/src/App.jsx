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

function AppContent() {
  const [tab, setTab] = useState('import')
  const { user, loading: authLoading, cloudEnabled } = useAuth()
  const store = useStore()

  const alertCount = getAllAlerts(store.classes, store.attendance).length

  const TABS = [
    { id: 'import', label: 'Record Attendance' },
    { id: 'dashboard', label: 'Warnings', badge: alertCount },
    { id: 'attendance', label: 'Mark Manually' },
    { id: 'classes', label: 'Classes' },
  ]

  if ((cloudEnabled && authLoading) || store.loading) {
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
  const showLocalDataBanner = store.useCloud && store.hasLocalData

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <h1>Student Absence Tracker</h1>
            <p className="tagline">
              Import daily attendance from JSON, sync to the cloud, and get warned
              about extended absences.
            </p>
          </div>
          <AuthPanel
            onMigrateLocal={
              store.useCloud && store.hasLocalData ? store.migrateLocalToCloud : null
            }
          />
        </div>

        {showSignInBanner && (
          <div className="info-banner app-banner">
            <strong>Sign in</strong> to save attendance across devices and browsers.
            Your data is currently stored only in this browser until you sign in.
          </div>
        )}

        {showLocalDataBanner && (
          <div className="info-banner app-banner">
            You have unsynced data in this browser. Use <strong>Upload local data</strong>{' '}
            in the header to move it to your account.
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
          </p>
        )}
      </header>

      <nav className="tabs" aria-label="Main sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="tab-badge" aria-label={`${t.badge} warnings`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'import' && (
          <AttendanceImport
            importPortalSession={store.importPortalSession}
            classes={store.classes}
            attendance={store.attendance}
            onGoToWarnings={() => setTab('dashboard')}
          />
        )}
        {tab === 'dashboard' && (
          <Dashboard classes={store.classes} attendance={store.attendance} />
        )}
        {tab === 'attendance' && (
          <AttendanceSheet
            classes={store.classes}
            attendance={store.attendance}
            setAttendance={store.setAttendance}
            setSessionMeta={store.setSessionMeta}
          />
        )}
        {tab === 'classes' && <ClassManager {...store} />}
      </main>

      <footer className="app-footer">
        {store.useCloud
          ? 'Signed in — changes save to your cloud account.'
          : cloudEnabled
            ? 'Not signed in — data saves in this browser only.'
            : 'Data saves in this browser only.'}
      </footer>
    </div>
  )
}

export default function App() {
  return <AppContent />
}
