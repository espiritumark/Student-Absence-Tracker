/** Cosmopolitan College — navy primary + yellow accent. */
export const BRAND = {
  navy: '#202959',
  navyHover: '#2a3470',
  navyActive: '#161d42',
  yellow: '#FDD00D',
  yellowSoft: '#fff8d6',
}

export const antdTheme = {
  token: {
    colorPrimary: BRAND.navy,
    colorPrimaryHover: BRAND.navyHover,
    colorPrimaryActive: BRAND.navyActive,
    colorLink: BRAND.navy,
    colorLinkHover: BRAND.navyHover,
    colorSuccess: '#2e7d52',
    colorWarning: '#b45309',
    colorError: '#b42318',
    colorInfo: BRAND.navy,
    colorBgLayout: '#eef0f7',
    colorBgContainer: '#ffffff',
    colorBorder: '#c5c9dc',
    colorText: '#141a33',
    colorTextSecondary: '#4a5170',
    colorTextTertiary: '#8b92ad',
    borderRadius: 8,
    borderRadiusLG: 10,
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    controlHeight: 40,
    fontSize: 14,
  },
  components: {
    Layout: {
      bodyBg: '#eef0f7',
      headerBg: '#ffffff',
      footerBg: '#eef0f7',
      siderBg: '#f7f8fc',
    },
    Tabs: {
      cardBg: '#e4e7f4',
      itemSelectedColor: BRAND.navy,
      inkBarColor: BRAND.navy,
      itemColor: '#4a5170',
      itemHoverColor: BRAND.navyHover,
    },
    Select: {
      controlHeight: 40,
      optionSelectedBg: '#e8ebf8',
    },
    Input: {
      controlHeight: 40,
    },
    Button: {
      controlHeight: 40,
      borderRadius: 8,
      primaryShadow: '0 2px 0 rgba(32, 41, 89, 0.12)',
    },
    Segmented: {
      itemSelectedBg: '#e8ebf8',
      itemSelectedColor: BRAND.navy,
      trackBg: '#f1f3fa',
      itemColor: '#64708f',
      itemHoverColor: '#141a33',
    },
    Table: {
      headerBg: '#f4f5fa',
      rowHoverBg: '#f0f2fa',
    },
    Modal: {
      borderRadiusLG: 12,
      titleColor: '#141a33',
      headerBg: '#ffffff',
    },
    Menu: {
      itemSelectedBg: '#e8ebf8',
      itemSelectedColor: BRAND.navy,
      itemHoverBg: '#f0f2fa',
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Alert: {
      borderRadiusLG: 10,
    },
    Drawer: {
      colorBgElevated: '#fafbfe',
    },
  },
}

export const RISK_TAG_COLOR = {
  safe: 'success',
  watch: 'gold',
  warning: 'orange',
  critical: 'error',
}
