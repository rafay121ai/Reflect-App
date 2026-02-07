#!/usr/bin/env node
/**
 * Ensures auth dependencies are installed before build.
 * Run as prebuild so `yarn build` fails fast with a clear message.
 */
try {
  require.resolve("@supabase/supabase-js");
} catch (e) {
  console.error("\n[REFLECT] Missing auth dependency. Install with:\n  yarn install\n");
  process.exit(1);
}
