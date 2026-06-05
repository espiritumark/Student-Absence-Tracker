import { Segmented, Tag, Typography } from 'antd'
import { UI } from '../utils/uiCopy'
import { VISION_SCAN_ENGINE } from '../utils/parseScreenshot'

export default function ImportScanEngineSwitch({
  value,
  onChange,
  cloudConfigured = false,
  className = '',
}) {
  return (
    <div className={`import-scan-engine-row${className ? ` ${className}` : ''}`}>
      <Typography.Text className="import-scan-engine-label">{UI.scanEngineLabel}</Typography.Text>
      <Segmented
        className="import-scan-engine"
        value={value}
        onChange={onChange}
        options={[
          { label: UI.scanEngineLocal, value: VISION_SCAN_ENGINE.local },
          {
            label: (
              <span className="import-scan-engine-cloud-label">
                {UI.scanEngineCloud}
                {!cloudConfigured && <Tag className="import-scan-engine-tag">Setup</Tag>}
              </span>
            ),
            value: VISION_SCAN_ENGINE.cloud,
            disabled: !cloudConfigured,
          },
        ]}
      />
    </div>
  )
}
