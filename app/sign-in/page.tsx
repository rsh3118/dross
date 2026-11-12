import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { hubHasOwner } from '@/lib/owner'
import { AuthForm } from '@/components/auth-form'

export const metadata = { title: 'Sign in' }

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await getSession()
  if (session?.user) redirect('/')
  const [{ error }, hasOwner] = await Promise.all([searchParams, hubHasOwner()])
  const initialError =
    error === 'google'
      ? 'Google sign-in did not complete. Try again.'
      : error === 'signup_disabled' || error === 'unable_to_create_user'
        ? 'This hub already has an owner. Sign in with the owner account.'
        : null
  return <AuthForm mode="sign-in" hasOwner={hasOwner} initialError={initialError} />
}
