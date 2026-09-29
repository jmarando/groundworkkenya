import * as React from 'react'
import { Layout, P } from './layout'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <Layout
    preview="Your Groundwork sign-in link"
    eyebrow="Sign in"
    title="Your sign-in link."
    action={{ href: confirmationUrl, label: 'Sign in' }}
    footnote="This link expires shortly and works once. If you didn't ask for it, ignore this email."
  >
    <P>Use the button below to sign in to your campaign workspace.</P>
  </Layout>
)

export default MagicLinkEmail
