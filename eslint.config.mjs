import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "fix-data.js",
      "drizzle/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
