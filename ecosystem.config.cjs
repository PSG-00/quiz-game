const os = require('os');
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'ox-quiz-show',
      script: 'server/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // SIGINT first: the server saves live rooms so players resume after the restart.
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        OX_PUBLIC_TEST_BOTS: '48',
        // Outside the checkout: a clean deploy checkout can no longer delete quiz data.
        OX_DATA_DIR: path.join(os.homedir(), 'ox-quiz-data'),
        // Game socket straight to this VM (DNS-only + Caddy); see docs/direct-connection.md.
        OX_DIRECT_WS_URL: 'wss://ws.quiz.rescene.online'
      }
    }
  ]
};
