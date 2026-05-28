import { useState } from 'react'
import AttendanceImport from './components/AttendanceImport'
import AttendanceSheet from './components/AttendanceSheet'
import AuthPanel from './components/AuthPanel'
import ClassManager from './components/ClassManager'
import Dashboard from './components/Dashboard'
import { useAuth } from './contexts/AuthContext'
import { useStore } from './hooks/useStore'
import { getAllAlerts } from './utils/alerts'

function AppContent() {
  const [tab, setTab] = useState('import')
  const { loading: authLoading, cloudEnabled } = useAuth()
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
        <div className="loading-screen">
          <p>Loading attendance data…</p>
        </div>
      </div>
    )
  }

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
        {store.syncError && <p className="error-banner">{store.syncError}</p>}
        {store.useCloud && (
          <p className="cloud-badge">Cloud sync enabled</p>
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
          ? 'Data is saved to Supabase when you are signed in.'
          : 'Data is saved locally in this browser.'}
      </footer>
    </div>
  )
}

export default function App() {
  return <AppContent />
}
