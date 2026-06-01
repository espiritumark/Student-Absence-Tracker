/** Consistent label + control wrapper for Ant Design forms. */
export default function FormField({ label, children, className = '', grow = false }) {
  return (
    <div className={`antd-field ${grow ? 'antd-field-grow' : ''} ${className}`.trim()}>
      {label ? <span className="antd-field-label">{label}</span> : null}
      {children}
    </div>
  )
}
