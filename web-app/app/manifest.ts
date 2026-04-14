import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/lib/utils/constants';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: 'Vitora',
    description: 'Offline-first Hospital Management Information System for Kenya.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#4e0b18',
    theme_color: '#4e0b18',
    categories: ['medical', 'health', 'productivity'],
    lang: 'en-KE',
    dir: 'ltr',
    icons: [
      {
        src: '/favicon.png?v=2',
        sizes: '500x500',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo.png',
        sizes: '1024x1024',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Patients',
        short_name: 'Patients',
        description: 'Open the patient registry.',
        url: '/patients',
        icons: [{ src: '/favicon.png?v=2', sizes: '500x500', type: 'image/png' }],
      },
      {
        name: 'Encounters',
        short_name: 'Encounters',
        description: 'Open the encounter workspace.',
        url: '/encounters',
        icons: [{ src: '/favicon.png?v=2', sizes: '500x500', type: 'image/png' }],
      },
      {
        name: 'Triage',
        short_name: 'Triage',
        description: 'Open the triage queue.',
        url: '/triage',
        icons: [{ src: '/favicon.png?v=2', sizes: '500x500', type: 'image/png' }],
      },
    ],
    prefer_related_applications: false,
  };
}
