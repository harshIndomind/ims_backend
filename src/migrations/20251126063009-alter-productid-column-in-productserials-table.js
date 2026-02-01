// 'use strict';

// module.exports = {
//   async up(queryInterface, Sequelize) {
//     // Remove the unique index (replace the name after checking SHOW INDEX)
//     await queryInterface.removeIndex('ProductSerials', 'product_id');

//     // Update column definition
//     await queryInterface.changeColumn('ProductSerials', 'product_id', {
//       type: Sequelize.INTEGER,
//       allowNull: true,
//       unique: false,
//     });
//   },

//   async down(queryInterface, Sequelize) {
//     await queryInterface.changeColumn('ProductSerials', 'product_id', {
//       type: Sequelize.INTEGER,
//       allowNull: true,
//       unique: true,
//     });

//     await queryInterface.addIndex('ProductSerials', ['product_id'], {
//       name: 'product_id',
//       unique: true,
//     });
//   }
// };

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1️⃣ Drop the FK first because its backing index depends on product_id
    // await queryInterface.removeConstraint('ProductSerials', 'ProductSerials_ibfk_1');

    // 2️⃣ Drop the UNIQUE index on product_id
    await queryInterface.removeIndex('ProductSerials', 'product_id');

    // 3️⃣ Change the column (unique: false won't actually remove index, but safe)
    await queryInterface.changeColumn('ProductSerials', 'product_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // 4️⃣ Re-create the FK (non-unique now)
    await queryInterface.addConstraint('ProductSerials', {
      fields: ['product_id'],
      type: 'foreign key',
      name: 'ProductSerials_ibfk_1',
      references: {
        table: 'Products',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    // 1️⃣ Drop the FK
    await queryInterface.removeConstraint('ProductSerials', 'ProductSerials_ibfk_1');

    // 2️⃣ Re-create unique index (exact original name)
    await queryInterface.addIndex('ProductSerials', ['product_id'], {
      name: 'product_id',
      unique: true,
    });

    // 3️⃣ Re-add FK
    await queryInterface.addConstraint('ProductSerials', {
      fields: ['product_id'],
      type: 'foreign key',
      name: 'ProductSerials_ibfk_1',
      references: {
        table: 'Products',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  }
};

