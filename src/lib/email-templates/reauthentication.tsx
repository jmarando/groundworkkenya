import * as React from 'react'
import { Text } from '@react-email/components'
import { Layout, P } from './layout'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Layout
    preview="Your Groundwork verification code"
    eyebrow="Verification"
    title="Your code."
    footnote="This code expires shortly. If you didn't ask for it, ignore this email."
  >
    <P>Enter this code to confirm it's you:</P>
    <Text style={{ margin: '0 0 28px', padding: '16px 20px', backgroundColor: '#F5F5F0', color: '#141C19', fontSize: '30px', fontWeight: 700, letterSpacing: '0.3em', fontFamily: '"JetBrains Mono", Menlo, monospace', borderLeft: '4px solid #D9481C' }}>
      {token}
    </Text>
  </Layout>
)

export default ReauthenticationEmail
