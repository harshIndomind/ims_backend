'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class MasterTermsCondition extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  MasterTermsCondition.init({
    terms_type: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'MasterTermsCondition',
  });
  return MasterTermsCondition;
};