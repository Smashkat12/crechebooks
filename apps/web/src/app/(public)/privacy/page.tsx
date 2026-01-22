import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy - CrecheBooks',
  description:
    'CrecheBooks Privacy Policy. Learn how we collect, use, and protect your personal information in compliance with POPIA (Protection of Personal Information Act).',
  keywords: [
    'CrecheBooks privacy policy',
    'POPIA compliance',
    'data protection South Africa',
    'childcare data privacy',
  ],
  openGraph: {
    title: 'Privacy Policy - CrecheBooks',
    description:
      'Learn how CrecheBooks collects, uses, and protects your personal information in compliance with POPIA.',
    type: 'website',
  },
};

export default function PrivacyPolicyPage() {
  const lastUpdated = '1 January 2025';

  return (
    <>
      {/* Header Section */}
      <section className="bg-muted/40 py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Privacy Policy
            </h1>
            <p className="mt-4 text-muted-foreground">
              Last updated: {lastUpdated}
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-gray mx-auto max-w-3xl dark:prose-invert">
            <p className="lead">
              CrecheBooks (Pty) Ltd (&quot;CrecheBooks&quot;, &quot;we&quot;,
              &quot;us&quot;, or &quot;our&quot;) is committed to protecting
              your privacy and ensuring the security of your personal
              information. This Privacy Policy explains how we collect, use,
              disclose, and safeguard your information when you use our services
              in compliance with the Protection of Personal Information Act 4 of
              2013 (&quot;POPIA&quot;).
            </p>

            <h2>1. Information We Collect</h2>

            <h3>1.1 Personal Information</h3>
            <p>We may collect the following personal information:</p>
            <ul>
              <li>
                <strong>Contact Information:</strong> Name, email address, phone
                number, physical address
              </li>
              <li>
                <strong>Business Information:</strong> Creche name, registration
                number, number of children enrolled
              </li>
              <li>
                <strong>Account Information:</strong> Username, password
                (encrypted), account preferences
              </li>
              <li>
                <strong>Financial Information:</strong> Bank account details for
                payment processing, transaction history
              </li>
              <li>
                <strong>Child Information:</strong> Names, dates of birth,
                guardian details, attendance records (as entered by you)
              </li>
              <li>
                <strong>Staff Information:</strong> Employee names, contact
                details, payroll information (as entered by you)
              </li>
            </ul>

            <h3>1.2 Usage Data</h3>
            <p>We automatically collect certain information when you use our services:</p>
            <ul>
              <li>Device information (browser type, operating system)</li>
              <li>IP address and location data</li>
              <li>Pages visited and features used</li>
              <li>Time spent on the platform</li>
              <li>Error logs and performance data</li>
            </ul>

            <h3>1.3 Cookies and Tracking Technologies</h3>
            <p>
              We use cookies and similar technologies to enhance your experience.
              Please see our{' '}
              <Link href="/cookies" className="text-primary hover:underline">
                Cookie Policy
              </Link>{' '}
              for more details.
            </p>

            <h2>2. How We Use Your Information</h2>
            <p>We use your personal information for the following purposes:</p>
            <ul>
              <li>To provide and maintain our services</li>
              <li>To process payments and manage subscriptions</li>
              <li>To send important service-related communications</li>
              <li>To provide customer support</li>
              <li>To improve and personalise our services</li>
              <li>To ensure compliance with SARS requirements</li>
              <li>To generate financial reports and analytics</li>
              <li>To prevent fraud and ensure security</li>
              <li>
                To send marketing communications (with your consent, which you
                can withdraw at any time)
              </li>
              <li>To comply with legal obligations</li>
            </ul>

            <h2>3. Data Sharing and Disclosure</h2>
            <p>We may share your information with:</p>
            <ul>
              <li>
                <strong>Service Providers:</strong> Third-party vendors who help
                us operate our platform (e.g., cloud hosting, payment
                processors, email services)
              </li>
              <li>
                <strong>Legal Requirements:</strong> When required by law, court
                order, or government authority
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection with a
                merger, acquisition, or sale of assets
              </li>
              <li>
                <strong>With Your Consent:</strong> For any other purpose with
                your explicit permission
              </li>
            </ul>
            <p>
              We do not sell, rent, or trade your personal information to third
              parties for marketing purposes.
            </p>

            <h2>4. Data Security</h2>
            <p>
              We implement appropriate technical and organisational measures to
              protect your personal information:
            </p>
            <ul>
              <li>
                <strong>Encryption:</strong> All data is encrypted in transit
                (TLS/SSL) and at rest (AES-256)
              </li>
              <li>
                <strong>Access Controls:</strong> Strict role-based access to
                personal data
              </li>
              <li>
                <strong>Regular Audits:</strong> Periodic security assessments
                and penetration testing
              </li>
              <li>
                <strong>Secure Infrastructure:</strong> Data hosted on
                enterprise-grade, SOC 2 compliant servers
              </li>
              <li>
                <strong>Employee Training:</strong> Regular privacy and security
                training for all staff
              </li>
              <li>
                <strong>Incident Response:</strong> Established procedures for
                handling data breaches
              </li>
            </ul>

            <h2>5. Your Rights Under POPIA</h2>
            <p>
              As a data subject under POPIA, you have the following rights:
            </p>
            <ul>
              <li>
                <strong>Right of Access:</strong> Request confirmation of what
                personal information we hold about you
              </li>
              <li>
                <strong>Right to Correction:</strong> Request correction of
                inaccurate or incomplete personal information
              </li>
              <li>
                <strong>Right to Deletion:</strong> Request deletion of your
                personal information in certain circumstances
              </li>
              <li>
                <strong>Right to Object:</strong> Object to the processing of
                your personal information for direct marketing
              </li>
              <li>
                <strong>Right to Data Portability:</strong> Request a copy of
                your personal information in a structured, commonly used format
              </li>
              <li>
                <strong>Right to Lodge a Complaint:</strong> Lodge a complaint
                with the Information Regulator if you believe your rights have
                been violated
              </li>
            </ul>
            <p>
              To exercise any of these rights, please contact our Information
              Officer using the details provided below.
            </p>

            <h2>6. Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to
              fulfil the purposes outlined in this policy, unless a longer
              retention period is required or permitted by law:
            </p>
            <ul>
              <li>
                <strong>Account Data:</strong> Retained while your account is
                active and for 7 years after closure (for tax compliance)
              </li>
              <li>
                <strong>Financial Records:</strong> Retained for 7 years as
                required by SARS
              </li>
              <li>
                <strong>Marketing Data:</strong> Until you withdraw consent or
                unsubscribe
              </li>
              <li>
                <strong>Usage Data:</strong> Typically retained for 2 years for
                analytics purposes
              </li>
            </ul>

            <h2>7. Children&apos;s Privacy</h2>
            <p>
              CrecheBooks processes information about children only as entered
              by authorised creche administrators for the purpose of managing
              childcare operations. We do not knowingly collect personal
              information directly from children. The information processed
              includes names, ages, and attendance records necessary for
              invoicing and reporting purposes.
            </p>
            <p>
              If you believe we have inadvertently collected information from a
              child without proper authorisation, please contact us immediately.
            </p>

            <h2>8. International Transfers</h2>
            <p>
              Your data may be transferred to and processed in countries outside
              South Africa. When this occurs, we ensure appropriate safeguards
              are in place:
            </p>
            <ul>
              <li>Standard contractual clauses approved by the Information Regulator</li>
              <li>
                Transfers only to countries with adequate data protection laws
              </li>
              <li>Encryption and access controls during transfer</li>
            </ul>

            <h2>9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will
              notify you of any material changes by:
            </p>
            <ul>
              <li>Posting the updated policy on our website</li>
              <li>Sending an email notification to registered users</li>
              <li>Displaying a prominent notice within the application</li>
            </ul>
            <p>
              We encourage you to review this policy periodically for any
              changes.
            </p>

            <h2>10. Information Officer Contact</h2>
            <p>
              For any questions, concerns, or requests regarding this Privacy
              Policy or your personal information, please contact our
              Information Officer:
            </p>
            <div className="not-prose rounded-lg border bg-muted/30 p-6">
              <p className="font-semibold">Information Officer</p>
              <p>CrecheBooks (Pty) Ltd</p>
              <p>
                Email:{' '}
                <a
                  href="mailto:privacy@crechebooks.co.za"
                  className="text-primary hover:underline"
                >
                  privacy@crechebooks.co.za
                </a>
              </p>
              <p>
                Phone:{' '}
                <a
                  href="tel:+27210000000"
                  className="text-primary hover:underline"
                >
                  +27 (0)21 XXX XXXX
                </a>
              </p>
              <p>Address: Cape Town, South Africa</p>
            </div>

            <p className="mt-8 text-sm text-muted-foreground">
              You may also lodge a complaint with the Information Regulator of
              South Africa at{' '}
              <a
                href="https://www.justice.gov.za/inforeg/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                www.justice.gov.za/inforeg
              </a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
