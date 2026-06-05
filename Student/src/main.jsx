import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { antdTheme } from './theme/antdTheme.js'
import { APP_NOTIFICATION_CONFIG } from './utils/appNotifications.js'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider theme={antdTheme}>
      <AntdApp notification={APP_NOTIFICATION_CONFIG}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
