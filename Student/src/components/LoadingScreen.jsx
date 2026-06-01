import { Flex, Spin, Typography } from 'antd'

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
      <Spin size="large" />
      <Typography.Text>{message}</Typography.Text>
    </Flex>
  )
}
