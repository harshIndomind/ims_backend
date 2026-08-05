'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class DocumentNumberSequence extends Model {
		static associate(models) {
			DocumentNumberSequence.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
		}
	}
	DocumentNumberSequence.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				primaryKey: true,
				references: { model: 'organizations', key: 'id' },
			},
			doc_type: {
				type: DataTypes.ENUM('PO', 'WO'),
				allowNull: false,
				primaryKey: true,
			},
			fiscal_year: {
				type: DataTypes.STRING(7),
				allowNull: false,
				primaryKey: true,
			},
			last_number: {
				type: DataTypes.INTEGER,
				allowNull: false,
				defaultValue: 0,
			},
		},
		{
			sequelize,
			modelName: 'DocumentNumberSequence',
		},
	);
	return DocumentNumberSequence;
};
