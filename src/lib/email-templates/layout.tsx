import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

// Shared Groundwork email frame: Soil header band, white card, Murram action.
const SOIL = '#141C19'
const STONE = '#F5F5F0'
const MURRAM = '#D9481C'
const MUTED = '#5B615E'

export const Layout = ({
  preview,
  eyebrow,
  title,
  children,
  action,
  footnote,
}: {
  preview: string
  eyebrow: string
  title: string
  children: React.ReactNode
  action?: { href: string; label: string }
  footnote: string
}) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={{ backgroundColor: '#ffffff', margin: 0, padding: '24px 0', fontFamily: 'Geist, Helvetica, Arial, sans-serif' }}>
      <Container style={{ maxWidth: '520px', margin: '0 auto', border: `1px solid #E4E4DC`, borderRadius: '6px', overflow: 'hidden' }}>
        <Section style={{ backgroundColor: SOIL, padding: '22px 32px' }}>
          <Text style={{ margin: 0, color: STONE, fontSize: '15px', fontWeight: 800, letterSpacing: '0.18em' }}>
            <span style={{ color: MURRAM }}>■</span>&nbsp; GROUNDWORK
          </Text>
        </Section>
        <Section style={{ height: '4px', backgroundColor: MURRAM }} />
        <Section style={{ padding: '36px 32px 8px' }}>
          <Text style={{ margin: '0 0 10px', color: MURRAM, fontSize: '11px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, fontFamily: '"JetBrains Mono", Menlo, monospace' }}>
            {eyebrow}
          </Text>
          <Heading style={{ margin: '0 0 18px', color: SOIL, fontSize: '26px', lineHeight: '1.2', fontWeight: 800 }}>
            {title}
          </Heading>
          {children}
          {action ? (
            <Button href={action.href} style={{ backgroundColor: MURRAM, color: '#ffffff', fontSize: '15px', fontWeight: 700, borderRadius: '4px', padding: '14px 26px', textDecoration: 'none', margin: '8px 0 24px' }}>
              {action.label} →
            </Button>
          ) : null}
        </Section>
        <Section style={{ backgroundColor: STONE, padding: '20px 32px' }}>
          <Text style={{ margin: '0 0 6px', color: MUTED, fontSize: '12px', lineHeight: '1.5' }}>{footnote}</Text>
          <Text style={{ margin: 0, color: MUTED, fontSize: '12px' }}>Groundwork · the campaign OS · groundwork.ke</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const P = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ margin: '0 0 18px', color: '#3A403D', fontSize: '15px', lineHeight: '1.6' }}>{children}</Text>
)
