import * as React from 'react'
import { Layout, P } from './layout'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <Layout
    preview="Reset your Groundwork password"
    eyebrow="Password reset"
    title="Choose a new password."
    action={{ href: confirmationUrl, label: 'Reset password' }}
    footnote="If you didn't ask for this, ignore this email. Your password stays the same."
  >
    <P>Someone asked to reset the password for your Groundwork account. Use the button below to pick a new one.</P>
  </Layout>
)

export default RecoveryEmail
