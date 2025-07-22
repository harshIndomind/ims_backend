module.exports = {
  apps: [
    // Development
    {
      name: 'ims-test-backend',
      script: 'src/index.js',
      cwd: '/var/www/html/indomind.ims.test/backend',
      env: {
        PORT: 5100,
        NODE_ENV: 'development',
      },
    },

    // Production
    {
      name: 'ims-backend-prod',
      script: 'src/index.js',
      cwd: '/var/www/html/indomind.ims.prod/backend',
      env: {
        PORT: 6100,
        NODE_ENV: 'production',
      },
    }
  ]
};
