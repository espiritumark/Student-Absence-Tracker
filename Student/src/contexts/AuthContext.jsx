import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { NOTIFIER_KEYS, getRegisteredNotifier } from '../utils/appNotifications'

const AuthContext = createContext(null)

function showSignedInNotice(email) {
  getRegisteredNotifier()?.success({
    key: NOTIFIER_KEYS.authSignIn,
    title: 'Signed in successfully',
    description: `You are now signed in as ${email}.`,
    duration: 6,
  })
}

function showSignedOutNotice(email) {
  getRegisteredNotifier()?.info({
    key: NOTIFIER_KEYS.authSignOut,
    title: 'Signed out',
    description: email
      ? `You have been signed out of ${email}. Your data on this device stays available locally.`
      : 'You have been signed out. Your data on this device stays available locally.',
    duration: 6,
  })
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [transition, setTransition] = useState(null)
  const progressTimerRef = useRef(null)

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }, [])

  const startTransition = useCallback(
    (type, email) => {
      const label =
        type === 'signin' ? `Signing in as ${email}…` : `Signing out of ${email}…`
      setTransition({ type, email, progress: 12, label })
      clearProgressTimer()
      progressTimerRef.current = setInterval(() => {
        setTransition((current) => {
          if (!current) return current
          return { ...current, progress: Math.min(current.progress + 7, 88) }
        })
      }, 180)
    },
    [clearProgressTimer],
  )

  const finishTransition = useCallback(async () => {
    clearProgressTimer()
    setTransition((current) => (current ? { ...current, progress: 100 } : current))
    await new Promise((resolve) => setTimeout(resolve, 320))
    setTransition(null)
  }, [clearProgressTimer])

  const cancelTransition = useCallback(() => {
    clearProgressTimer()
    setTransition(null)
  }, [clearProgressTimer])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      sub.subscription.unsubscribe()
      clearProgressTimer()
    }
  }, [clearProgressTimer])

  const signIn = useCallback(
    async (email, password) => {
      if (!supabase) throw new Error('Cloud sign-in is not configured.')
      const trimmed = email.trim()
      startTransition('signin', trimmed)
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        })
        if (error) throw error
        await finishTransition()
        showSignedInNotice(trimmed)
      } catch (err) {
        cancelTransition()
        throw err
      }
    },
    [startTransition, finishTransition, cancelTransition],
  )

  const signUp = useCallback(async (email, password) => {
    if (!supabase) throw new Error('Cloud sign-up is not configured.')
    const { error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const accountEmail = user?.email
    startTransition('signout', accountEmail || 'your account')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      await finishTransition()
      showSignedOutNotice(accountEmail)
    } catch (err) {
      cancelTransition()
      throw err
    }
  }, [user?.email, startTransition, finishTransition, cancelTransition])

  const value = useMemo(
    () => ({
      user,
      loading,
      transition,
      cloudEnabled: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
    }),
    [user, loading, transition, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
