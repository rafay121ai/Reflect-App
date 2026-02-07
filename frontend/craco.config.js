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
      return webpackConfig;
    },
  },
};

module.exports = webpackConfig;
