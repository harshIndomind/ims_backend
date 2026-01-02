'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterMajorHead extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			MasterMajorHead.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
		}
	}
	MasterMajorHead.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'organization', key: 'id' },
			},
			m_code: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			m_name: {
				type: DataTypes.STRING,
				allowNull: false,
			},
		},
		{
			sequelize,
			paranoid: true,
			timestamps: true,
			modelName: 'MasterMajorHead',
		}
	);
	return MasterMajorHead;
};
