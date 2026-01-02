'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterSubHead extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			MasterSubHead.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
		}
	}
	MasterSubHead.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'organization', key: 'id' },
			},
			sh_code: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			sh_name: {
				type: DataTypes.STRING,
				allowNull: false,
			},
		},
		{
			sequelize,
      paranoid: true,
      timestamps: true,
			modelName: 'MasterSubHead',
		}
	);
	return MasterSubHead;
};
