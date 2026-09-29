import * as React from 'react'
import { Layout, P } from './layout'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <Layout
    preview="You've been invited to join the campaign team"
    eyebrow="Team invitation"
    title="You're on the team."
    action={{ href: confirmationUrl, label: 'Set your password' }}
    footnote="This link works once. If you weren't expecting an invitation, you can ignore this email."
  >
    <P>
      You've been invited to the campaign's workspace on Groundwork, where the team runs
      voters, field work, messaging and election day.
    </P>
    <P>Choose a password to get in. After that, sign in with your email and password.</P>
  </Layout>
)

export default InviteEmail
