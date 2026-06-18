import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons'
import { Button, Input, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { formatPersonName, normalizeName } from '../utils/nameMatching'

export default function StudentNameCell({
  name,
  disabled = false,
  saving = false,
  onSave,
  className = '',
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  useEffect(() => {
    if (!editing) setValue(name)
  }, [name, editing])

  async function commit() {
    const trimmed = value.trim()
    if (!trimmed) return
    if (normalizeName(trimmed) === normalizeName(name)) {
      setEditing(false)
      setValue(name)
      return
    }
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch {
      // Parent shows error; keep edit open.
    }
  }

  function cancel() {
    setEditing(false)
    setValue(name)
  }

  if (editing) {
    return (
      <Space.Compact className={`student-name-edit ${className}`.trim()} block>
        <Input
          size="small"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPressEnter={commit}
          disabled={disabled || saving}
          autoFocus
          aria-label="Edit learning partner name"
        />
        <Button
          size="small"
          type="primary"
          icon={<CheckOutlined />}
          onClick={commit}
          loading={saving}
          disabled={disabled}
          aria-label="Save name"
        />
        <Button
          size="small"
          icon={<CloseOutlined />}
          onClick={cancel}
          disabled={disabled || saving}
          aria-label="Cancel edit"
        />
      </Space.Compact>
    )
  }

  return (
    <span className={`student-name-cell ${className}`.trim()}>
      <Typography.Text className="student-name-text">{formatPersonName(name)}</Typography.Text>
      <Button
        type="text"
        size="small"
        className="student-name-edit-btn"
        icon={<EditOutlined />}
        aria-label="Edit name"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
        disabled={disabled}
      />
    </span>
  )
}
