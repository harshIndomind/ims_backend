module.exports = {
  apps: [
    // Development
    // {
    //   name: 'dev-indomind-vendor-backend',
    //   script: 'src/index.js',
    //   cwd: '/var/www/html/indomind.vc.dev/api',
    //   env: {
    //     PORT: 5200,
    //     NODE_ENV: 'development',
    //   },
    // },

    // // Testing
    // {
    //   name: 'test-indomind-vendor-backend',
    //   script: 'src/index.js',
    //   cwd: '/var/www/html/indomind.vc.test/api',
    //   env: {
    //     PORT: 7200,
    //     NODE_ENV: 'test',
    //   },
    // },

    // Production
    {
      name: 'scm-swayamm-backend',
      script: 'src/index.js',
      cwd: '/var/www/html/scm.swayamm.com/api',
      env: {
        PORT: 4006,
        NODE_ENV: 'production',
      },
    }
  ]
};
