'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('MasterSubHeadAmounts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      org_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'organizations', key: 'id' },
			},
      major_head_amount_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'MasterMajorHeadAmounts',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
			},
      major_head_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'MasterMajorHeads',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        allowNull: false
      },
      period_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'MasterPeriods',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        allowNull: false
      },
      sub_head_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'MasterSubHeads',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('MasterSubHeadAmounts');
  }
};