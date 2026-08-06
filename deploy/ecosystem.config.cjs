# Ecosystem PM2 (opcional — deploy-remote já usa `pm2 start npm`)
module.exports = {
  apps: [
    {
      name: "tips3x3",
      cwd: "/var/www/tips3x3",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "768M",
      time: true,
    },
  ],
};
