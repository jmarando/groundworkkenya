import * as React from 'react'
import { Layout, P } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  campaignName?: string
  subject?: string
  body?: string
  senderName?: string
}

// One-to-one message from a campaign's Inbox to one person.
const CampaignMessage = ({ campaignName = 'The campaign', subject = 'A message from the campaign', body = '', senderName }: Props) => (
  <Layout
    preview={body.slice(0, 90) || subject}
    eyebrow={campaignName}
    title={subject}
    footnote={`Reply to this email to reach the ${campaignName} team directly.`}
  >
    {body.split(/\n{2,}/).map((para, i) => (
      <P key={i}>
        {para.split('\n').map((line, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {line}
          </React.Fragment>
        ))}
      </P>
    ))}
    {senderName ? <P>— {senderName}, {campaignName}</P> : null}
  </Layout>
)

export const template = {
  component: CampaignMessage,
  subject: (d: Record<string, any>) => d.subject || 'A message from the campaign',
  displayName: 'Campaign Inbox message',
  previewData: {
    campaignName: 'Sakaja 2027',
    subject: 'Thank you for reaching out',
    body: 'Hi James,\n\nThanks for your message about water in Kayole. Our ward team will call you this week.',
    senderName: 'Mary',
  },
} satisfies TemplateEntry
