'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class DocumentsUpload extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			DocumentsUpload.belongsTo(models.User, {
				foreignKey: 'user_id',
				as: 'vendor',
			});
		}
	}
	DocumentsUpload.init(
		{
			user_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: {
					model: 'Users',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			doc_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: {
					model: 'docs_categories',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			doc_number: { type: DataTypes.STRING, allowNull: false, unique: true },
			org_filename: { type: DataTypes.STRING, allowNull: false },
			generated_filename: { type: DataTypes.STRING, allowNull: false },
			uploaded_path: { type: DataTypes.STRING, allowNull: false },
			isDeleteRequest: { type: DataTypes.BOOLEAN, defaultValue: false },
			doc_status: {
				type: DataTypes.ENUM([
					'UPLOADED',
					'IN-PROCESS',
					'DUPLICATE',
					'FAILED',
					'RESULT',
				]),
				defaultValue: 'UPLOADED',
				allowNull: false,
			},
		},
		{
			sequelize,
			modelName: 'DocumentsUpload',
		}
	);
	return DocumentsUpload;
};
