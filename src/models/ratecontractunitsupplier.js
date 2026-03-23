'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class RateContractUnitSupplier extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  RateContractUnitSupplier.init({
    rate_contract_id: DataTypes.INTEGER,
    unit_id: DataTypes.INTEGER,
    supplier_id: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'RateContractUnitSupplier',
  });
  return RateContractUnitSupplier;
};