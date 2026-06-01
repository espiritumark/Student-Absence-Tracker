export default function SaveFieldOverlay({
  busy,
  label = 'Saving…',
  children,
  className = '',
}) {
  return (
    <div className={`save-field-overlay-wrap ${busy ? 'is-saving' : ''} ${className}`.trim()}>
      <div className="save-field-overlay-content">{children}</div>
      {busy && (
        <div className="save-field-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="save-field-spinner" aria-hidden="true" />
          <span>{label}</span>
        </div>
      )}
    </div>
  )
}
