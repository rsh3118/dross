import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { hubHasOwner } from '@/lib/owner'
import { AuthForm } from '@/components/auth-form'

export const metadata = { title: 'Claim hub' }

export default async function SignUpPage() {
  const session = await getSession()
  if (session?.user) redirect('/')
  const hasOwner = await hubHasOwner()
  if (hasOwner) redirect('/sign-in')
  return <AuthForm mode="sign-up" hasOwner={false} />
}
