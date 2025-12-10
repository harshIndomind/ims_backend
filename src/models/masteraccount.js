'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MasterAccount extends Model {
    static associate(models) {
      // Define associations here if needed
    }
  }

  MasterAccount.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      A_CODE: {
        type: DataTypes.STRING(7),
        allowNull: false,
      },
      A_NAME: {
        type: DataTypes.STRING(60),
        allowNull: false,
      },
      A_LEDGER: {
        type: DataTypes.STRING(2),
        allowNull: false,
      },
      UNIV_CODE: {
        type: DataTypes.STRING(7),
        allowNull: true,
      },
      D_O_OPENING: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      RESP_PERSON: {
        type: DataTypes.STRING(5),
        allowNull: true,
      },
      OPENING_BALDR: {
        type: DataTypes.DOUBLE,
        allowNull: true,
      },
      OPENING_BALCR: {
        type: DataTypes.DOUBLE,
        allowNull: true,
      },
      PRINT_ADVICE: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      AC_FINAL: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      LAST_TR_DATE: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      AC2: { type: DataTypes.STRING(7), allowNull: true },
      AC3: { type: DataTypes.STRING(7), allowNull: true },
      AC4: { type: DataTypes.STRING(7), allowNull: true },
      AC5: { type: DataTypes.STRING(7), allowNull: true },
      AC6: { type: DataTypes.STRING(7), allowNull: true },
      AC7: { type: DataTypes.STRING(7), allowNull: true },
      AC8: { type: DataTypes.STRING(7), allowNull: true },
      AC9: { type: DataTypes.STRING(7), allowNull: true },
      AC10: { type: DataTypes.STRING(7), allowNull: true },
      MISC_DB_CODE: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      MISC_DB_TEXT: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      MISC_CR_CODE: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      MISC_CR_TEXT: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      OPENING_BAL: {
        type: DataTypes.DECIMAL(19, 4),
        allowNull: false,
        defaultValue: 0,
      },
      TAN: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      PAN: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      GST: {
        type: DataTypes.STRING(15),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'MasterAccount',
      tableName: 'MasterAccounts',
      timestamps: false, // since there are no createdAt/updatedAt columns
      underscored: false,
    }
  );

  return MasterAccount;
};
