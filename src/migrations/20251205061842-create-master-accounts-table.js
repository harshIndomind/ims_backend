'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('MasterAccounts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      A_CODE: {
        type: Sequelize.STRING(7),
        allowNull: false,
      },
      A_NAME: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      A_LEDGER: {
        type: Sequelize.STRING(2),
        allowNull: false,
      },
      UNIV_CODE: {
        type: Sequelize.STRING(7),
        allowNull: true,
      },
      D_O_OPENING: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      RESP_PERSON: {
        type: Sequelize.STRING(5),
        allowNull: true,
      },
      OPENING_BALDR: {
        type: Sequelize.DOUBLE,
        allowNull: true,
      },
      OPENING_BALCR: {
        type: Sequelize.DOUBLE,
        allowNull: true,
      },
      PRINT_ADVICE: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      AC_FINAL: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      LAST_TR_DATE: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      AC2: { type: Sequelize.STRING(7), allowNull: true },
      AC3: { type: Sequelize.STRING(7), allowNull: true },
      AC4: { type: Sequelize.STRING(7), allowNull: true },
      AC5: { type: Sequelize.STRING(7), allowNull: true },
      AC6: { type: Sequelize.STRING(7), allowNull: true },
      AC7: { type: Sequelize.STRING(7), allowNull: true },
      AC8: { type: Sequelize.STRING(7), allowNull: true },
      AC9: { type: Sequelize.STRING(7), allowNull: true },
      AC10: { type: Sequelize.STRING(7), allowNull: true },
      MISC_DB_CODE: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      MISC_DB_TEXT: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      MISC_CR_CODE: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      MISC_CR_TEXT: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      OPENING_BAL: {
        type: Sequelize.DECIMAL(19, 4),
        allowNull: false,
        defaultValue: 0,
      },
      TAN: {
        type: Sequelize.STRING(10),
        allowNull: true,
      },
      PAN: {
        type: Sequelize.STRING(10),
        allowNull: true,
      },
      GST: {
        type: Sequelize.STRING(15),
        allowNull: true,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('MasterAccounts');
  },
};
