import { Layout, Tabs, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AttendanceImport from './components/AttendanceImport'
import AttendanceSheet from './components/AttendanceSheet'
import AuthPanel from './components/AuthPanel'
import NotificationMinibar from './components/NotificationMinibar'
import ClassManager from './components/ClassManager'
import Dashboard from './components/Dashboard'
import LoadingScreen from './components/LoadingScreen'
import FeedbackPanel from './components/FeedbackPanel'
import ReportingPanel from './components/ReportingPanel'
import ActivityHistoryPanel from './components/ActivityHistoryPanel'
import TabLabel from './components/TabLabel'
import { APP_LOGO, APP_NAME } from './constants/branding'
import { UI } from './utils/uiCopy'
import { useAuth } from './contexts/AuthContext'
import { useReportedViolations } from './hooks/useReportedViolations'
import { pruneReportingQueue, useReportingQueue } from './hooks/useReportingQueue'
import { useStore } from './hooks/useStore'
import { isOcrRunning } from './utils/ocrSession'
import { buildReportCandidates, splitReportingWorkflow } from './utils/reportingQueue'
import { useAppNotifier } from './hooks/useAppNotifier'
import { NOTIFIER_KEYS } from './utils/appNotifications'

const { Header, Content, Footer } = Layout

function AppContent() {
  const [tab, setTab] = useState('import')
  const [classesFocus, setClassesFocus] = useState(null)
  const [reportingFocusKey, setReportingFocusKey] = useState(null)
  const [tabActivity, setTabActivity] = useState({})
  const importNavigationGuardRef = useRef(null)

  const handleTabActivityChange = useCallback((tabId, activity) => {
    setTabActivity((prev) => {
      if (activity == null) {
        if (!(tabId in prev)) return prev
        const next = { ...prev }
        delete next[tabId]
        return next
      }
      if (prev[tabId] === activity) return prev
      return { ...prev, [tabId]: activity }
    })
  }, [])

  function switchTab(nextTab) {
    if (nextTab !== tab) {
      document.activeElement?.blur?.()
    }
    setTab(nextTab)
  }

  function openInClasses(focus) {
    setClassesFocus(focus)
    switchTab('classes')
  }

  const { user, loading: authLoading, cloudEnabled, transition: authTransition } = useAuth()
  const notify = useAppNotifier()
  const signInHintShownRef = useRef(false)
  const store = useStore()
  const reportsUserKey = user?.id || 'local'
  const { reportedViolations, markStudentReported, clearStudentReported } =
    useReportedViolations(reportsUserKey)
  const {
    reportingQueue,
    queueStudentByKey,
    dequeueStudent,
    replaceReportingQueue,
  } = useReportingQueue(reportsUserKey)

  const reportWorkflow = useMemo(() => {
    const candidates = buildReportCandidates(store.classes, store.attendance)
    return splitReportingWorkflow(candidates, reportedViolations, reportingQueue)
  }, [store.classes, store.attendance, reportedViolations, reportingQueue])

  useEffect(() => {
    const candidates = buildReportCandidates(store.classes, store.attendance)
    const validKeys = new Set(candidates.map((row) => row.key))
    const pruned = pruneReportingQueue(reportingQueue, validKeys, reportedViolations)
    if (pruned !== reportingQueue) {
      replaceReportingQueue(pruned)
    }
  }, [store.classes, store.attendance, reportedViolations, reportingQueue, replaceReportingQueue])

  function openReporting(studentKey = null) {
    if (studentKey) {
      queueStudentByKey(studentKey)
    }
    setReportingFocusKey(studentKey)
    switchTab('reporting')
  }

  function handleMarkStudentReported(classId, studentId, meta) {
    markStudentReported(classId, studentId, meta)
    dequeueStudent(classId, studentId)
  }

  const dashboardReportAlert = reportWorkflow.dashboardPending.length > 0
  const reportingTabAlert = reportWorkflow.reportingPending.length > 0

  const TABS = [
    { id: 'import', label: 'Record Attendance' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'reporting', label: 'Reporting' },
    { id: 'classes', label: 'Classes & Rosters' },
    { id: 'attendance', label: 'Mark Manually' },
    {
      id: 'history',
      label:
        store.activityLog.length > 0
          ? `${UI.history} (${store.activityLog.length})`
          : UI.history,
    },
  ]

  function tabActivityFor(id) {
    return tabActivity[id] ?? null
  }

  const blockUiForLoading =
    (cloudEnabled && authLoading) || (store.initialLoading && !isOcrRunning())

  const lockAppTabs = tab === 'import' && tabActivity.import === 'processing'

  useEffect(() => {
    if (!authTransition) {
      notify.destroy(NOTIFIER_KEYS.authTransition)
      return
    }
    notify.progress({
      key: NOTIFIER_KEYS.authTransition,
      title: authTransition.type === 'signin' ? 'Signing in' : 'Signing out',
      description: authTransition.label || authTransition.email,
    })
  }, [authTransition, notify])

  useEffect(() => {
    if (!store.syncError) {
      notify.destroy(NOTIFIER_KEYS.cloudSyncError)
      return
    }
    notify.error({
      key: NOTIFIER_KEYS.cloudSyncError,
      title: 'Cloud sync error',
      description: store.syncError,
      duration: 0,
      onClose: () => store.clearSyncError(),
    })
  }, [store.syncError, notify, store])

  useEffect(() => {
    if (!store.useCloud || !store.syncing) {
      notify.destroy(NOTIFIER_KEYS.cloudSync)
      return undefined
    }

    notify.progress({
      key: NOTIFIER_KEYS.cloudSync,
      title: 'Cloud sync active',
      description: 'Syncing attendance with your cloud account…',
      minimizable: false,
    })

    return () => notify.destroy(NOTIFIER_KEYS.cloudSync)
  }, [store.useCloud, store.syncing, notify])

  if (blockUiForLoading) {
    return (
      <Layout className="app-layout">
        <Content className="app-layout-content app-layout-content-centered">
          <LoadingScreen
            message={
              authLoading ? 'Checking sign-in status…' : 'Loading your attendance data…'
            }
          />
        </Content>
      </Layout>
    )
  }

  return (
    <Layout className="app-layout">
      <NotificationMinibar />
      <div className={`app-shell${lockAppTabs ? ' app-shell-import-busy' : ''}`}>
        <Header className="app-layout-header">
        <div className="app-header-row">
          <div className="app-header-brand">
            <img src={APP_LOGO} alt={APP_NAME} className="app-brand-logo" />
          </div>
          <AuthPanel />
        </div>

      </Header>

      <div className="app-shell-body">
        <Tabs
          className="app-tabs"
          activeKey={tab}
          onChange={(key) => {
            switchTab(key)
          }}
          items={TABS.map((t) => ({
            key: t.id,
            label: (
              <TabLabel
                label={t.label}
                activity={tabActivityFor(t.id)}
                reportAlert={
                  (t.id === 'dashboard' && dashboardReportAlert) ||
                  (t.id === 'reporting' && reportingTabAlert)
                }
              />
            ),
          }))}
        />

        <main className="tab-panels">
          <div className="tab-panel" hidden={tab !== 'import'} aria-hidden={tab !== 'import'}>
            <AttendanceImport
              importPortalSession={store.importPortalSession}
              recordAction={store.recordAction}
              classes={store.classes}
              attendance={store.attendance}
              isActive={tab === 'import'}
              onGoToWarnings={() => switchTab('dashboard')}
              onTabActivityChange={handleTabActivityChange}
              navigationGuardRef={importNavigationGuardRef}
            />
          </div>
          <div className="tab-panel" hidden={tab !== 'dashboard'} aria-hidden={tab !== 'dashboard'}>
            <Dashboard
              classes={store.classes}
              attendance={store.attendance}
              dashboardPendingKeys={reportWorkflow.dashboardPending.map((row) => row.key)}
              reportingQueuedKeys={reportWorkflow.reportingPending.map((row) => row.key)}
              onOpenInClasses={openInClasses}
              onOpenReporting={openReporting}
            />
          </div>
          <div className="tab-panel" hidden={tab !== 'feedback'} aria-hidden={tab !== 'feedback'}>
            <FeedbackPanel
              classes={store.classes}
              attendance={store.attendance}
              updateStudent={store.updateStudent}
              useCloud={store.useCloud}
              syncError={store.syncError}
            />
          </div>
          <div className="tab-panel" hidden={tab !== 'reporting'} aria-hidden={tab !== 'reporting'}>
            <ReportingPanel
              classes={store.classes}
              attendance={store.attendance}
              reportingPending={reportWorkflow.reportingPending}
              reported={reportWorkflow.reported}
              markStudentReported={handleMarkStudentReported}
              clearStudentReported={clearStudentReported}
              initialStudentKey={reportingFocusKey}
              onInitialStudentHandled={() => setReportingFocusKey(null)}
            />
          </div>
          <div className="tab-panel" hidden={tab !== 'classes'} aria-hidden={tab !== 'classes'}>
            <ClassManager
              classes={store.classes}
              attendance={store.attendance}
              syncing={store.syncing}
              addClass={store.addClass}
              removeClass={store.removeClass}
              deleteModuleSessions={store.deleteModuleSessions}
              addStudent={store.addStudent}
              removeStudent={store.removeStudent}
              updateStudent={store.updateStudent}
              importStudentsBulk={store.importStudentsBulk}
              bulkUpdateStudents={store.bulkUpdateStudents}
              recordActivity={store.recordActivity}
              initialFocus={classesFocus}
              onFocusApplied={() => setClassesFocus(null)}
              onTabActivityChange={handleTabActivityChange}
            />
          </div>
          <div className="tab-panel" hidden={tab !== 'attendance'} aria-hidden={tab !== 'attendance'}>
            <AttendanceSheet
              classes={store.classes}
              attendance={store.attendance}
              setAttendance={store.setAttendance}
              setSessionMeta={store.setSessionMeta}
              deleteSession={store.deleteSession}
              syncing={store.syncing}
              recordAction={store.recordAction}
              onTabActivityChange={handleTabActivityChange}
            />
          </div>
          <div className="tab-panel" hidden={tab !== 'history'} aria-hidden={tab !== 'history'}>
            <ActivityHistoryPanel
              entries={store.activityLog}
              onClear={store.dismissActivityLog}
            />
          </div>
        </main>
      </div>
      </div>

      <Footer className="app-layout-footer">
        <Typography.Text type="secondary" className="app-layout-footer-note">
          {store.useCloud
            ? 'Signed in — data syncs when you save on Record Attendance or Mark Manually.'
            : cloudEnabled
              ? 'Not signed in — data saves in this browser only.'
              : 'Data saves in this browser only.'}
        </Typography.Text>
      </Footer>
    </Layout>
  )
}

export default function App() {
  return <AppContent />
}
