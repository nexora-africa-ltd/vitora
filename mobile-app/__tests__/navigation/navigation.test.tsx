/**
 * Navigation Tests
 *
 * Tests for Expo Router navigation structure.
 * Following TDD RED-GREEN-REFACTOR approach.
 *
 * Requirements:
 * - Root layout provides all contexts (Auth, Database, Query)
 * - Auth group for unauthenticated screens
 * - Main group with auth guard for authenticated screens
 * - Proper redirects based on auth state
 */

import * as fs from 'fs';
import * as path from 'path';

// Helper to check if a file exists
const fileExists = (filePath: string): boolean => {
  const fullPath = path.join(__dirname, '..', '..', filePath);
  return fs.existsSync(fullPath);
};

// Helper to read file content
const readFile = (filePath: string): string => {
  const fullPath = path.join(__dirname, '..', '..', filePath);
  return fs.readFileSync(fullPath, 'utf-8');
};

describe('Navigation Structure Tests', () => {
  describe('Root Layout', () => {
    test('should have app/_layout.tsx file', () => {
      expect(fileExists('app/_layout.tsx')).toBe(true);
    });

    test('should export default function', () => {
      const content = readFile('app/_layout.tsx');
      expect(content).toContain('export default function');
    });

    test('should include AuthProvider', () => {
      const content = readFile('app/_layout.tsx');
      expect(content).toContain('AuthProvider');
    });

    test('should include QueryClientProvider', () => {
      const content = readFile('app/_layout.tsx');
      expect(content).toContain('QueryClientProvider');
    });
  });

  describe('Entry Point', () => {
    test('should have app/index.tsx file', () => {
      expect(fileExists('app/index.tsx')).toBe(true);
    });

    test('should export default function', () => {
      const content = readFile('app/index.tsx');
      expect(content).toContain('export default function');
    });

    test('should use useAuth hook', () => {
      const content = readFile('app/index.tsx');
      expect(content).toContain('useAuth');
    });

    test('should handle redirect based on auth', () => {
      const content = readFile('app/index.tsx');
      expect(content).toContain('Redirect');
      expect(content).toContain('isAuthenticated');
    });
  });

  describe('Auth Group', () => {
    test('should have app/(auth)/_layout.tsx file', () => {
      expect(fileExists('app/(auth)/_layout.tsx')).toBe(true);
    });

    test('should have app/(auth)/login.tsx file', () => {
      expect(fileExists('app/(auth)/login.tsx')).toBe(true);
    });

    test('AuthLayout should export default function', () => {
      const content = readFile('app/(auth)/_layout.tsx');
      expect(content).toContain('export default function');
    });

    test('LoginScreen should export default function', () => {
      const content = readFile('app/(auth)/login.tsx');
      expect(content).toContain('export default function');
    });

    test('LoginScreen should have login form', () => {
      const content = readFile('app/(auth)/login.tsx');
      expect(content).toContain('username');
      expect(content).toContain('password');
      expect(content).toContain('handleLogin');
    });
  });

  describe('Main Group', () => {
    test('should have app/(main)/_layout.tsx file', () => {
      expect(fileExists('app/(main)/_layout.tsx')).toBe(true);
    });

    test('should have app/(main)/index.tsx file', () => {
      expect(fileExists('app/(main)/index.tsx')).toBe(true);
    });

    test('should have app/(main)/patients/index.tsx file', () => {
      expect(fileExists('app/(main)/patients/index.tsx')).toBe(true);
    });

    test('should have app/(main)/patients/[id].tsx file', () => {
      expect(fileExists('app/(main)/patients/[id].tsx')).toBe(true);
    });

    test('should have app/(main)/settings.tsx file', () => {
      expect(fileExists('app/(main)/settings.tsx')).toBe(true);
    });

    test('MainLayout should export default function', () => {
      const content = readFile('app/(main)/_layout.tsx');
      expect(content).toContain('export default function');
    });

    test('Dashboard should export default function', () => {
      const content = readFile('app/(main)/index.tsx');
      expect(content).toContain('export default function');
    });
  });

  describe('Auth Guard', () => {
    test('MainLayout should check isAuthenticated', () => {
      const content = readFile('app/(main)/_layout.tsx');
      expect(content).toContain('isAuthenticated');
    });

    test('MainLayout should redirect if not authenticated', () => {
      const content = readFile('app/(main)/_layout.tsx');
      expect(content).toContain('Redirect');
      expect(content).toContain('!isAuthenticated');
    });

    test('MainLayout should use useAuth hook', () => {
      const content = readFile('app/(main)/_layout.tsx');
      expect(content).toContain('useAuth');
    });
  });

  describe('Patient Screens', () => {
    test('PatientList should have search functionality', () => {
      const content = readFile('app/(main)/patients/index.tsx');
      expect(content).toContain('searchQuery');
      expect(content).toContain('TextInput');
    });

    test('PatientDetail should use route params', () => {
      const content = readFile('app/(main)/patients/[id].tsx');
      expect(content).toContain('useLocalSearchParams');
    });
  });
});
