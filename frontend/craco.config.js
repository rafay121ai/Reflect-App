// craco.config.js
const path = require("path");

const projectRoot = __dirname;
const projectNodeModules = path.resolve(projectRoot, "node_modules");

const webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      // Ensure Capacitor and all deps resolve from this project's node_modules
      // (avoids "Module not found" when cwd or hoisting differs)
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.modules = [
        projectNodeModules,
        ...(Array.isArray(webpackConfig.resolve.modules) ? webpackConfig.resolve.modules : ["node_modules"]),
      ];

      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/build/**",
          "**/dist/**",
          "**/coverage/**",
          "**/public/**",
        ],
      };

      // Avoid source-map-loader failing on packages (e.g. @supabase/supabase-js) with missing/unusual dist files
      function excludeNodeModulesFromSourceMapLoader(config) {
        const rules = config.module?.rules || [];
        for (const rule of rules) {
          if (Array.isArray(rule.oneOf)) {
            for (const one of rule.oneOf) {
              const use = one.use || (one.loader ? [one] : []);
              for (const u of use) {
                const loader = (u && (u.loader || u)) || "";
                if (String(loader).includes("source-map-loader")) {
                  one.exclude = one.exclude ? [].concat(one.exclude) : [];
                  if (!one.exclude.some((e) => e.toString().includes("node_modules"))) {
                    one.exclude.push(/node_modules/);
                  }
                  return;
                }
              }
            }
          }
        }
      }
      excludeNodeModulesFromSourceMapLoader(webpackConfig);
      return webpackConfig;
    },
  },
};

module.exports = webpackConfig;
