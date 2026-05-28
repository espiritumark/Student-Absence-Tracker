export function friendlyAuthError(message) {
  const msg = (message || '').toLowerCase()
  if (msg.includes('invalid login credentials')) {
    return 'Incorrect email or password. Please try again.'
  }
  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email before signing in. Check your inbox.'
  }
  if (msg.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  if (msg.includes('password') && msg.includes('6')) {
    return 'Password must be at least 6 characters.'
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Network error. Check your connection and try again.'
  }
  return message || 'Something went wrong. Please try again.'
}
