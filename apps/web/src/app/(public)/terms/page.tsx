import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service - CrecheBooks',
  description:
    'CrecheBooks Terms of Service. Read about your rights and responsibilities when using our creche financial management software.',
  keywords: [
    'CrecheBooks terms of service',
    'terms and conditions',
    'user agreement',
    'service agreement South Africa',
  ],
  openGraph: {
    title: 'Terms of Service - CrecheBooks',
    description:
      'Read about your rights and responsibilities when using CrecheBooks creche financial management software.',
    type: 'website',
  },
};

export default function TermsOfServicePage() {
  const lastUpdated = '1 January 2025';
  const effectiveDate = '1 January 2025';

  return (
    <>
      {/* Header Section */}
      <section className="bg-muted/40 py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Terms of Service
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
              These Terms of Service (&quot;Terms&quot;) govern your access to
              and use of CrecheBooks services, including our website,
              applications, and any related services (collectively, the
              &quot;Service&quot;). By using the Service, you agree to be bound
              by these Terms.
            </p>
            <p>
              CrecheBooks (Pty) Ltd (&quot;CrecheBooks&quot;, &quot;we&quot;,
              &quot;us&quot;, or &quot;our&quot;) is a company registered in
              South Africa. These Terms are effective as of {effectiveDate}.
            </p>

            <h2>1. Account Terms</h2>

            <h3>1.1 Account Registration</h3>
            <ul>
              <li>
                You must be at least 18 years old to create an account and use
                our Service
              </li>
              <li>
                You must provide accurate, complete, and current information
                during registration
              </li>
              <li>
                You are responsible for maintaining the confidentiality of your
                account credentials
              </li>
              <li>
                You must notify us immediately of any unauthorised access to
                your account
              </li>
              <li>One person or entity may not maintain multiple accounts</li>
            </ul>

            <h3>1.2 Account Security</h3>
            <p>
              You are solely responsible for all activities that occur under
              your account. CrecheBooks will not be liable for any loss or
              damage arising from your failure to maintain the security of your
              account.
            </p>

            <h2>2. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>
                Use the Service for any unlawful purpose or in violation of any
                applicable laws
              </li>
              <li>
                Upload or transmit viruses, malware, or any other malicious code
              </li>
              <li>
                Attempt to gain unauthorised access to our systems or other
                users&apos; accounts
              </li>
              <li>
                Interfere with or disrupt the integrity or performance of the
                Service
              </li>
              <li>
                Use automated means (bots, scrapers) to access the Service
                without permission
              </li>
              <li>
                Resell, sublicense, or commercially exploit the Service without
                our consent
              </li>
              <li>
                Use the Service to store or transmit infringing, defamatory, or
                illegal content
              </li>
              <li>
                Impersonate any person or entity or misrepresent your
                affiliation
              </li>
            </ul>

            <h2>3. Payment Terms</h2>

            <h3>3.1 Pricing and Currency</h3>
            <ul>
              <li>
                All prices are quoted in South African Rand (ZAR) unless
                otherwise specified
              </li>
              <li>Prices exclude VAT unless explicitly stated</li>
              <li>
                We reserve the right to change prices with 30 days&apos; notice
              </li>
            </ul>

            <h3>3.2 Subscription Billing</h3>
            <ul>
              <li>
                Subscriptions are billed in advance on a monthly or annual basis
              </li>
              <li>
                Your subscription will automatically renew unless cancelled
                before the renewal date
              </li>
              <li>
                You may cancel your subscription at any time through your
                account settings
              </li>
              <li>
                No refunds are provided for partial months or unused time in
                your billing period
              </li>
            </ul>

            <h3>3.3 Payment Methods</h3>
            <p>We accept the following payment methods:</p>
            <ul>
              <li>Credit and debit cards (Visa, MasterCard)</li>
              <li>EFT (Electronic Funds Transfer)</li>
              <li>Debit orders</li>
            </ul>

            <h3>3.4 Failed Payments</h3>
            <p>
              If a payment fails, we will attempt to process it again. After
              multiple failed attempts, your account may be suspended until
              payment is received. We will notify you by email of any payment
              issues.
            </p>

            <h2>4. Service Level Agreement</h2>

            <h3>4.1 Availability</h3>
            <p>
              We strive to maintain 99.9% uptime for our Service. However, we do
              not guarantee uninterrupted access and may experience occasional
              downtime for maintenance, updates, or unforeseen circumstances.
            </p>

            <h3>4.2 Support</h3>
            <ul>
              <li>
                Email support is available Monday to Friday, 8am to 5pm SAST
              </li>
              <li>Response times vary by plan and priority level</li>
              <li>Priority support is available on Professional and Enterprise plans</li>
            </ul>

            <h3>4.3 Maintenance</h3>
            <p>
              We will provide at least 24 hours&apos; notice for scheduled
              maintenance that may affect Service availability, except in
              emergency situations.
            </p>

            <h2>5. Data Ownership</h2>

            <h3>5.1 Your Data</h3>
            <p>
              <strong>You own your data.</strong> All data you enter into
              CrecheBooks, including but not limited to child records, financial
              information, and staff data, remains your property. We do not
              claim any ownership rights over your data.
            </p>

            <h3>5.2 Data Export</h3>
            <p>
              You may export your data at any time in commonly used formats
              (CSV, PDF). Upon account termination, you will have 30 days to
              export your data before it is permanently deleted.
            </p>

            <h3>5.3 Data Use</h3>
            <p>
              We may use anonymised, aggregated data for analytics and service
              improvement purposes. This data cannot be used to identify you or
              your creche.
            </p>

            <h2>6. Intellectual Property</h2>

            <h3>6.1 Our Intellectual Property</h3>
            <p>
              CrecheBooks and its licensors retain all rights, title, and
              interest in and to the Service, including all software, designs,
              trademarks, and content. These Terms do not grant you any rights
              to our intellectual property except for the limited right to use
              the Service.
            </p>

            <h3>6.2 Feedback</h3>
            <p>
              Any feedback, suggestions, or ideas you provide about the Service
              may be used by us without any obligation to compensate you.
            </p>

            <h2>7. Termination</h2>

            <h3>7.1 Termination by You</h3>
            <p>
              You may terminate your account at any time by cancelling your
              subscription in your account settings. Termination will be
              effective at the end of your current billing period.
            </p>

            <h3>7.2 Termination by Us</h3>
            <p>We may terminate or suspend your account if you:</p>
            <ul>
              <li>Violate these Terms</li>
              <li>Fail to pay applicable fees</li>
              <li>Engage in fraudulent or illegal activities</li>
              <li>Have been inactive for more than 12 months (free accounts)</li>
            </ul>

            <h3>7.3 Effect of Termination</h3>
            <p>Upon termination:</p>
            <ul>
              <li>Your right to access the Service will cease immediately</li>
              <li>
                You will have 30 days to export your data (unless terminated for
                cause)
              </li>
              <li>We will delete your data after the retention period</li>
              <li>Any outstanding fees remain due and payable</li>
            </ul>

            <h2>8. Limitation of Liability</h2>

            <h3>8.1 Disclaimer</h3>
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
              AVAILABLE&quot; WITHOUT ANY WARRANTIES OF ANY KIND, EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
              NON-INFRINGEMENT.
            </p>

            <h3>8.2 Limitation</h3>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, CRECHEBOOKS SHALL NOT BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
              PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER
              INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE,
              GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM:
            </p>
            <ul>
              <li>Your use or inability to use the Service</li>
              <li>
                Any unauthorised access to or use of our servers and/or any
                personal information stored therein
              </li>
              <li>
                Any interruption or cessation of transmission to or from the
                Service
              </li>
              <li>
                Any bugs, viruses, or other harmful code that may be transmitted
                through the Service
              </li>
            </ul>

            <h3>8.3 Cap on Liability</h3>
            <p>
              Our total liability for any claims arising from or related to
              these Terms or the Service shall not exceed the amount you paid to
              us in the twelve (12) months preceding the claim.
            </p>

            <h2>9. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless CrecheBooks, its
              officers, directors, employees, and agents from and against any
              claims, liabilities, damages, losses, and expenses (including
              reasonable legal fees) arising out of or in any way connected
              with:
            </p>
            <ul>
              <li>Your access to or use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party rights</li>
              <li>
                Any content you submit or transmit through the Service
              </li>
            </ul>

            <h2>10. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with
              the laws of the Republic of South Africa, without regard to its
              conflict of law provisions. You agree to submit to the exclusive
              jurisdiction of the courts located in Cape Town, South Africa.
            </p>

            <h2>11. Dispute Resolution</h2>

            <h3>11.1 Informal Resolution</h3>
            <p>
              Before initiating any formal dispute resolution, you agree to
              first contact us at{' '}
              <a
                href="mailto:legal@crechebooks.co.za"
                className="text-primary hover:underline"
              >
                legal@crechebooks.co.za
              </a>{' '}
              and attempt to resolve the dispute informally for at least 30
              days.
            </p>

            <h3>11.2 Arbitration</h3>
            <p>
              If informal resolution fails, any disputes shall be resolved
              through binding arbitration in accordance with the Arbitration Act
              42 of 1965, administered by the Arbitration Foundation of Southern
              Africa (AFSA). The arbitration shall take place in Cape Town,
              South Africa.
            </p>

            <h3>11.3 Class Action Waiver</h3>
            <p>
              You agree that any dispute resolution proceedings will be
              conducted only on an individual basis and not in a class,
              consolidated, or representative action.
            </p>

            <h2>12. Changes to Terms</h2>
            <p>
              We may modify these Terms at any time. We will notify you of
              material changes by:
            </p>
            <ul>
              <li>Posting the updated Terms on our website</li>
              <li>Sending an email notification to registered users</li>
              <li>Displaying a notice within the application</li>
            </ul>
            <p>
              Your continued use of the Service after any changes constitutes
              acceptance of the modified Terms. If you do not agree to the
              changes, you must stop using the Service and terminate your
              account.
            </p>

            <h2>13. General Provisions</h2>

            <h3>13.1 Entire Agreement</h3>
            <p>
              These Terms, together with our Privacy Policy and any other
              agreements referenced herein, constitute the entire agreement
              between you and CrecheBooks regarding the Service.
            </p>

            <h3>13.2 Severability</h3>
            <p>
              If any provision of these Terms is found to be unenforceable, the
              remaining provisions will remain in full force and effect.
            </p>

            <h3>13.3 Waiver</h3>
            <p>
              Our failure to enforce any right or provision of these Terms shall
              not constitute a waiver of such right or provision.
            </p>

            <h3>13.4 Assignment</h3>
            <p>
              You may not assign or transfer these Terms without our prior
              written consent. We may assign our rights and obligations under
              these Terms without restriction.
            </p>

            <h2>14. Contact Information</h2>
            <p>
              For questions about these Terms, please contact us:
            </p>
            <div className="not-prose rounded-lg border bg-muted/30 p-6">
              <p className="font-semibold">CrecheBooks (Pty) Ltd</p>
              <p>
                Email:{' '}
                <a
                  href="mailto:legal@crechebooks.co.za"
                  className="text-primary hover:underline"
                >
                  legal@crechebooks.co.za
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
              By using CrecheBooks, you acknowledge that you have read,
              understood, and agree to be bound by these Terms of Service. See
              also our{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link href="/cookies" className="text-primary hover:underline">
                Cookie Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
