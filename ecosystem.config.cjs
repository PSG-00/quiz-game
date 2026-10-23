module.exports = {
  apps: [
    {
      name: 'ox-quiz-show',
      script: 'server/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3105
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3105
      }
    }
  ]
};
