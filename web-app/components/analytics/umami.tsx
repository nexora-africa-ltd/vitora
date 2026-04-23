'use client';

import Script from 'next/script';

/**
 * Umami analytics tracking script.
 *
 * Renders only when NEXT_PUBLIC_UMAMI_URL and NEXT_PUBLIC_UMAMI_WEBSITE_ID
 * are set. Privacy-focused: no cookies, GDPR/DPIA compliant.
 *
 * Set these in .env.local:
 *   NEXT_PUBLIC_UMAMI_URL=https://your-umami-instance.example.com
 *   NEXT_PUBLIC_UMAMI_WEBSITE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
export function UmamiAnalytics() {
  const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL;
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

  if (!umamiUrl || !websiteId) return null;

  return (
    <Script
      src={`${umamiUrl}/script.js`}
      data-website-id={websiteId}
      strategy="afterInteractive"
    />
  );
}
