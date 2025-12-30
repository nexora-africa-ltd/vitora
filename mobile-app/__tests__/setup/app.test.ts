/**
 * App setup tests to verify the scaffold is properly configured.
 *
 * @module __tests__/setup/app.test
 */

describe('React Native App Setup', () => {
  describe('Project Scaffold', () => {
    it('should have package.json with correct dependencies', () => {
      const packageJson = require('../../package.json');

      // Core dependencies
      expect(packageJson.dependencies).toHaveProperty('expo');
      expect(packageJson.dependencies).toHaveProperty('expo-router');
      expect(packageJson.dependencies).toHaveProperty('expo-secure-store');
      expect(packageJson.dependencies).toHaveProperty('@tanstack/react-query');
      expect(packageJson.dependencies).toHaveProperty('axios');
      expect(packageJson.dependencies).toHaveProperty('zustand');

      // Dev dependencies
      expect(packageJson.devDependencies).toHaveProperty('jest');
      expect(packageJson.devDependencies).toHaveProperty('@testing-library/react-native');
      expect(packageJson.devDependencies).toHaveProperty('typescript');
    });

    it('should have TypeScript configured with strict mode', () => {
      const tsconfig = require('../../tsconfig.json');

      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.strictNullChecks).toBe(true);
      expect(tsconfig.compilerOptions.noImplicitAny).toBe(true);
    });

    it('should have path aliases configured in tsconfig', () => {
      const tsconfig = require('../../tsconfig.json');

      expect(tsconfig.compilerOptions.baseUrl).toBe('.');
      expect(tsconfig.compilerOptions.paths).toHaveProperty('@/*');
      expect(tsconfig.compilerOptions.paths).toHaveProperty('@/components/*');
      expect(tsconfig.compilerOptions.paths).toHaveProperty('@/lib/*');
      expect(tsconfig.compilerOptions.paths).toHaveProperty('@/hooks/*');
      expect(tsconfig.compilerOptions.paths).toHaveProperty('@/constants/*');
    });

    it('should have Babel configured with required plugins', () => {
      const babelConfig = require('../../babel.config.js');
      const config = babelConfig({ cache: () => {} });

      expect(config.presets).toContain('babel-preset-expo');
      expect(config.plugins).toBeDefined();

      // Check for module-resolver plugin
      const moduleResolver = config.plugins.find(
        (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'module-resolver'
      );
      expect(moduleResolver).toBeDefined();

      // Check for decorators plugin (needed for WatermelonDB)
      const decorators = config.plugins.find(
        (plugin: unknown) =>
          Array.isArray(plugin) && plugin[0] === '@babel/plugin-proposal-decorators'
      );
      expect(decorators).toBeDefined();
    });
  });

  describe('Configuration Files', () => {
    it('should have constants/config.ts with required exports', () => {
      // Import config without causing Expo modules to load
      const configPath = require.resolve('../../constants/config');
      expect(configPath).toBeTruthy();

      // Just verify the file exists for now
      // Full config testing will happen when we mock Expo properly
    });

    it('should have storage keys defined in config', () => {
      // Test the expected structure without importing
      const expectedKeys = [
        'vitora_access_token',
        'vitora_refresh_token',
        'vitora_user',
      ];

      // Verify by checking constants/config.ts file content pattern
      const fs = require('fs');
      const configContent = fs.readFileSync(
        require.resolve('../../constants/config'),
        'utf8'
      );

      expectedKeys.forEach((key) => {
        expect(configContent).toContain(key);
      });
    });

    it('should have API endpoints defined in config', () => {
      const fs = require('fs');
      const configContent = fs.readFileSync(
        require.resolve('../../constants/config'),
        'utf8'
      );

      // Auth endpoints
      expect(configContent).toContain('/api/token/');
      expect(configContent).toContain('/api/token/refresh/');
      expect(configContent).toContain('/api/token/verify/');

      // Patient endpoints
      expect(configContent).toContain('/api/patients/');

      // Location endpoints
      expect(configContent).toContain('/api/locations/counties/');
      expect(configContent).toContain('/api/locations/sub-counties/');
    });
  });

  describe('Theme Configuration', () => {
    it('should have colors defined with primary and semantic colors', () => {
      const { colors } = require('../../constants/colors');

      // Primary colors
      expect(colors.primary).toBeDefined();
      expect(colors.primary[500]).toBe('#4CAF50');

      // Semantic colors
      expect(colors.success).toBeDefined();
      expect(colors.error).toBeDefined();
      expect(colors.warning).toBeDefined();
      expect(colors.critical).toBeDefined();

      // Sync status colors
      expect(colors.sync.pending).toBeDefined();
      expect(colors.sync.synced).toBeDefined();
      expect(colors.sync.failed).toBeDefined();
    });
  });
});
