'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Remove ALL possible indexes on doc_number
    const indexes = await queryInterface.showIndex('DocumentsUploads');
    
    for (const idx of indexes) {
      if (idx.fields.some(f => f.attribute === 'doc_number')) {
        await queryInterface.removeIndex('DocumentsUploads', idx.name);
      }
    }

    // Ensure column definition is non-unique
    await queryInterface.changeColumn('DocumentsUploads', 'doc_number', {
      type: Sequelize.STRING,
      allowNull: false,
      unique: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addIndex('DocumentsUploads', ['doc_number'], {
      name: 'doc_number',
      unique: true,
    });
  }
};
