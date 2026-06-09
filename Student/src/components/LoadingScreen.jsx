import { Flex, Spin, Typography } from 'antd'
import { APP_LOGO } from '../constants/branding'

export default function LoadingScreen({ message = 'Loading…' }) {
  return (
    <Flex
      className="loading-screen"
      vertical
      align="center"
      justify="center"
      gap="middle"
      role="status"
      aria-live="polite"
    >
      <img src={APP_LOGO} alt="" className="loading-screen-logo" aria-hidden="true" />
      <Spin size="large" />
      <Typography.Text>{message}</Typography.Text>
    </Flex>
  )
}
