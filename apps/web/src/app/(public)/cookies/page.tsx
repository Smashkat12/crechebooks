import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Cookie Policy - CrecheBooks',
  description:
    'CrecheBooks Cookie Policy. Learn about the cookies we use and how to manage your cookie preferences.',
  keywords: [
    'CrecheBooks cookie policy',
    'cookies',
    'tracking',
    'privacy settings',
    'browser cookies',
  ],
  openGraph: {
    title: 'Cookie Policy - CrecheBooks',
    description:
      'Learn about the cookies CrecheBooks uses and how to manage your cookie preferences.',
    type: 'website',
  },
};

interface CookieInfo {
  name: string;
  type: string;
  purpose: string;
  duration: string;
}

const cookieList: CookieInfo[] = [
  {
    name: 'cb_session',
    type: 'Essential',
    purpose: 'Maintains your login session and security',
    duration: 'Session',
  },
  {
    name: 'cb_csrf',
    type: 'Essential',
    purpose: 'Protects against cross-site request forgery attacks',
    duration: 'Session',
  },
  {
    name: 'cb_consent',
    type: 'Essential',
    purpose: 'Stores your cookie consent preferences',
    duration: '1 year',
  },
  {
    name: 'cb_preferences',
    type: 'Functional',
    purpose: 'Remembers your preferences (language, theme, etc.)',
    duration: '1 year',
  },
  {
    name: 'cb_recent',
    type: 'Functional',
    purpose: 'Stores recently accessed items for quick navigation',
    duration: '30 days',
  },
  {
    name: '_ga',
    type: 'Analytics',
    purpose: 'Google Analytics - distinguishes unique users',
    duration: '2 years',
  },
  {
    name: '_ga_*',
    type: 'Analytics',
    purpose: 'Google Analytics - maintains session state',
    duration: '2 years',
  },
  {
    name: '_gid',
    type: 'Analytics',
    purpose: 'Google Analytics - distinguishes users',
    duration: '24 hours',
  },
  {
    name: '_fbp',
    type: 'Marketing',
    purpose: 'Facebook Pixel - tracks visits across websites',
    duration: '3 months',
  },
  {
    name: '_gcl_au',
    type: 'Marketing',
    purpose: 'Google Ads - conversion tracking',
    duration: '3 months',
  },
];

export default function CookiePolicyPage() {
  const lastUpdated = '1 January 2025';

  return (
    <>
      {/* Header Section */}
      <section className="bg-muted/40 py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Cookie Policy
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
              This Cookie Policy explains how CrecheBooks (Pty) Ltd
              (&quot;CrecheBooks&quot;, &quot;we&quot;, &quot;us&quot;, or
              &quot;our&quot;) uses cookies and similar tracking technologies
              when you visit our website and use our services.
            </p>

            <h2>1. What Are Cookies?</h2>
            <p>
              Cookies are small text files that are stored on your device
              (computer, tablet, or mobile phone) when you visit a website. They
              are widely used to make websites work more efficiently, provide a
              better user experience, and give website owners useful
              information.
            </p>
            <p>
              Cookies can be &quot;persistent&quot; or &quot;session&quot;
              cookies. Persistent cookies remain on your device after you close
              your browser until they expire or are deleted. Session cookies are
              deleted as soon as you close your browser.
            </p>

            <h2>2. How We Use Cookies</h2>
            <p>We use cookies for the following purposes:</p>
            <ul>
              <li>
                <strong>To enable essential features:</strong> Some cookies are
                essential for you to use our Service. Without these cookies,
                services you have asked for cannot be provided.
              </li>
              <li>
                <strong>To remember your preferences:</strong> Cookies help us
                remember your settings and preferences, making your experience
                more personalised.
              </li>
              <li>
                <strong>To improve performance:</strong> Cookies help us
                understand how visitors interact with our website, allowing us
                to improve and optimise the Service.
              </li>
              <li>
                <strong>To provide relevant marketing:</strong> With your
                consent, we use cookies to deliver more relevant advertisements
                and measure advertising effectiveness.
              </li>
            </ul>

            <h2>3. Types of Cookies We Use</h2>

            <h3>3.1 Essential Cookies</h3>
            <p>
              These cookies are strictly necessary for the operation of our
              website. They enable core functionality such as security, network
              management, and accessibility. You cannot opt out of these cookies
              as the Service would not function properly without them.
            </p>
            <p>Examples include:</p>
            <ul>
              <li>Authentication cookies that keep you logged in</li>
              <li>Security cookies that protect against fraud</li>
              <li>Session cookies that remember your preferences during a visit</li>
            </ul>

            <h3>3.2 Functional Cookies</h3>
            <p>
              These cookies enable enhanced functionality and personalisation.
              They may be set by us or by third-party providers whose services
              we have added to our pages. If you disable these cookies, some or
              all of these services may not function properly.
            </p>
            <p>Examples include:</p>
            <ul>
              <li>Remembering your language preference</li>
              <li>Remembering your theme preference (light/dark mode)</li>
              <li>Storing recently viewed items</li>
            </ul>

            <h3>3.3 Analytics Cookies</h3>
            <p>
              These cookies help us understand how visitors interact with our
              website by collecting and reporting information anonymously. This
              helps us improve the way our website works.
            </p>
            <p>We use:</p>
            <ul>
              <li>
                <strong>Google Analytics:</strong> To track page views, visitor
                behaviour, and general usage patterns
              </li>
              <li>
                <strong>Hotjar:</strong> To understand user behaviour through
                heatmaps and session recordings (anonymised)
              </li>
            </ul>

            <h3>3.4 Marketing Cookies</h3>
            <p>
              These cookies are used to track visitors across websites. The
              intention is to display ads that are relevant and engaging for the
              individual user. These cookies require your explicit consent.
            </p>
            <p>We may use:</p>
            <ul>
              <li>
                <strong>Google Ads:</strong> For conversion tracking and
                remarketing
              </li>
              <li>
                <strong>Facebook Pixel:</strong> For measuring ad effectiveness
                and building audiences
              </li>
              <li>
                <strong>LinkedIn Insight Tag:</strong> For conversion tracking
                and retargeting
              </li>
            </ul>

            <h2>4. Third-Party Cookies</h2>
            <p>
              In addition to our own cookies, we may also use various
              third-party cookies to report usage statistics, deliver
              advertisements, and enable social media features. These
              third-party services have their own privacy policies addressing
              how they use such information.
            </p>
            <p>Third parties that may set cookies include:</p>
            <ul>
              <li>Google (Analytics, Ads)</li>
              <li>Facebook/Meta</li>
              <li>LinkedIn</li>
              <li>Hotjar</li>
              <li>Payment processors (for checkout functionality)</li>
            </ul>

            <h2>5. Managing Cookies</h2>

            <h3>5.1 Cookie Consent Banner</h3>
            <p>
              When you first visit our website, you will see a cookie consent
              banner that allows you to accept or decline non-essential cookies.
              You can change your preferences at any time by clicking the
              &quot;Cookie Settings&quot; link in our website footer.
            </p>

            <h3>5.2 Browser Settings</h3>
            <p>
              Most web browsers allow you to control cookies through their
              settings. You can usually find these settings in the
              &quot;Options&quot; or &quot;Preferences&quot; menu of your
              browser. The following links provide information on how to manage
              cookies in common browsers:
            </p>
            <ul>
              <li>
                <a
                  href="https://support.google.com/chrome/answer/95647"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Chrome
                </a>
              </li>
              <li>
                <a
                  href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Mozilla Firefox
                </a>
              </li>
              <li>
                <a
                  href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Safari
                </a>
              </li>
              <li>
                <a
                  href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Microsoft Edge
                </a>
              </li>
            </ul>

            <h3>5.3 Opt-Out Links</h3>
            <p>
              You can also opt out of certain third-party cookies directly:
            </p>
            <ul>
              <li>
                <a
                  href="https://tools.google.com/dlpage/gaoptout"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Analytics Opt-Out
                </a>
              </li>
              <li>
                <a
                  href="https://www.facebook.com/help/568137493302217"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Facebook Ad Preferences
                </a>
              </li>
              <li>
                <a
                  href="https://www.youronlinechoices.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Your Online Choices (EU)
                </a>
              </li>
            </ul>

            <h3>5.4 Impact of Disabling Cookies</h3>
            <p>Please note that if you disable or refuse cookies:</p>
            <ul>
              <li>Some features of the Service may not function properly</li>
              <li>You may need to manually adjust preferences each visit</li>
              <li>
                You will still see ads, but they may be less relevant to you
              </li>
            </ul>

            <h2>6. Cookie List</h2>
            <p>
              The following table lists the specific cookies we use:
            </p>

            <div className="not-prose overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                      Cookie Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                      Purpose
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cookieList.map((cookie, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                      <td className="px-4 py-3 text-sm font-mono text-foreground">
                        {cookie.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            cookie.type === 'Essential'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : cookie.type === 'Functional'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              : cookie.type === 'Analytics'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          }`}
                        >
                          {cookie.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {cookie.purpose}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {cookie.duration}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2>7. Contact Us</h2>
            <p>
              If you have any questions about our use of cookies, please contact
              us:
            </p>
            <div className="not-prose rounded-lg border bg-muted/30 p-6">
              <p className="font-semibold">CrecheBooks (Pty) Ltd</p>
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
              This Cookie Policy should be read alongside our{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
