module.exports = {
  apps: [
    // Development
    {
      name: 'dev-indomind-vendor-backend',
      script: 'src/index.js',
      cwd: '/var/www/html/indomind.vc.dev/api',
      env: {
        PORT: 5200,
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
