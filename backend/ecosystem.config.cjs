/**
 * PM2 (VM / EC2 deployments):  pm2 start ecosystem.config.cjs --env production
 * Instance count comes from WEB_CONCURRENCY; scheduled tasks use a Mongo lock so they run once.
 */
module.exports = {
  apps: [
    {
      name: 'freejobwala-api',
      script: 'src/server.js',
      // 1 fits Upstash free. For more, also set REDIS_SOCKET_ADAPTER=true (uses extra Redis commands).
      instances: Number(process.env.WEB_CONCURRENCY) || 1,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      kill_timeout: 30000,
      env_production: { NODE_ENV: 'production' },
    },
  ],
};
