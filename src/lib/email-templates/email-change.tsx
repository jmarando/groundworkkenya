import * as React from 'react'
import { Layout, P } from './layout'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the current address; `email` may equal the new recipient.
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({ oldEmail, email, newEmail, confirmationUrl }: EmailChangeEmailProps) => (
  <Layout
    preview="Confirm your new email for Groundwork"
    eyebrow="Email change"
    title="Confirm your new email."
    action={{ href: confirmationUrl, label: 'Confirm change' }}
    footnote="If you didn't ask for this change, secure your account and tell your campaign manager."
  >
    <P>
      You asked to change your Groundwork email from <strong>{oldEmail || email}</strong> to{' '}
      <strong>{newEmail}</strong>.
    </P>
  </Layout>
)

export default EmailChangeEmail
