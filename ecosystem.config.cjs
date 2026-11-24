module.exports = {
  apps: [
    {
      name: "mi",
      script: "dist/index.js",
      node_args: "--env-file=.env",
      cwd: __dirname,
    },
  ],
};
