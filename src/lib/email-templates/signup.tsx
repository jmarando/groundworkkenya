import * as React from 'react'
import { Layout, P } from './layout'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ recipient, confirmationUrl }: SignupEmailProps) => (
  <Layout
    preview="Confirm your email for Groundwork"
    eyebrow="Confirm email"
    title="Confirm your email."
    action={{ href: confirmationUrl, label: 'Confirm email' }}
    footnote="If you didn't create an account, ignore this email."
  >
    <P>Please confirm that {recipient} is your email address.</P>
  </Layout>
)

export default SignupEmail
