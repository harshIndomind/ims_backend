'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class docs_category extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	docs_category.init(
		{
			name: { type: DataTypes.STRING, allowNull: false },
			short_code: { type: DataTypes.STRING, allowNull: false, unique: true },
			s3_folder_path: { type: DataTypes.STRING, allowNull: false, unique: true },
			is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
		},
		{
			sequelize,
			modelName: 'docs_category',
		}
	);
	return docs_category;
};
