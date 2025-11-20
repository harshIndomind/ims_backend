'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE DocumentsUploads 
      MODIFY COLUMN doc_status ENUM(
        'UPLOADED',
        'IN-PROCESS',
        'DUPLICATE',
        'FAILED',
        'RESULT',
        'EDITED'
      ) NOT NULL DEFAULT 'UPLOADED';
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE DocumentsUploads 
      MODIFY COLUMN doc_status ENUM(
        'UPLOADED',
        'IN-PROCESS',
        'DUPLICATE',
        'FAILED',
        'RESULT'
      ) NOT NULL DEFAULT 'UPLOADED';
    `);
  },
};
