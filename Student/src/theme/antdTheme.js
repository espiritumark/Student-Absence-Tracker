/** Attendance-tracker palette: calm teal actions + clear risk semantics. */
export const antdTheme = {
  token: {
    colorPrimary: '#0d9488',
    colorPrimaryHover: '#0f766e',
    colorPrimaryActive: '#115e59',
    colorLink: '#0d9488',
    colorLinkHover: '#0f766e',
    colorSuccess: '#059669',
    colorWarning: '#c2410c',
    colorError: '#b45353',
    colorInfo: '#0284c7',
    colorBgLayout: '#eef2f6',
    colorBgContainer: '#ffffff',
    colorBorder: '#cbd5e1',
    colorText: '#0f172a',
    colorTextSecondary: '#64748b',
    colorTextTertiary: '#94a3b8',
    borderRadius: 8,
    borderRadiusLG: 10,
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    controlHeight: 40,
    fontSize: 14,
  },
  components: {
    Layout: {
      bodyBg: '#eef2f6',
      headerBg: '#ffffff',
      footerBg: '#ffffff',
    },
    Tabs: {
      cardBg: '#ffffff',
      itemSelectedColor: '#0d9488',
      inkBarColor: '#0d9488',
    },
    Select: {
      controlHeight: 40,
      optionSelectedBg: '#e6f4f2',
    },
    Input: {
      controlHeight: 40,
    },
    Button: {
      controlHeight: 40,
      borderRadius: 8,
    },
    Segmented: {
      itemSelectedBg: '#e6f4f2',
      itemSelectedColor: '#0f5c56',
      trackBg: '#f1f5f9',
      itemColor: '#64748b',
      itemHoverColor: '#0f172a',
    },
    Table: {
      headerBg: '#f8fafc',
      rowHoverBg: '#f0fdfa',
    },
    Modal: {
      borderRadiusLG: 12,
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Alert: {
      borderRadiusLG: 10,
    },
  },
}

export const RISK_TAG_COLOR = {
  safe: 'success',
  watch: 'gold',
  warning: 'orange',
  critical: 'error',
}
