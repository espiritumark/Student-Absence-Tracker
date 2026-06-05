import { Modal } from 'antd'

/**
 * @param {import('antd').ModalFuncProps} options
 * @returns {Promise<boolean>}
 */
export function confirmAsync(options) {
  return new Promise((resolve) => {
    Modal.confirm({
      centered: true,
      ...options,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
}
