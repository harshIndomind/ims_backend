'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class ProcessedEvent extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	ProcessedEvent.init(
		{
			event_id: DataTypes.UUID,
			event_type: DataTypes.STRING,
			processed_at: DataTypes.DATE,
		},
		{
			sequelize,
			modelName: 'ProcessedEvent',
			tableName: 'processed_events',
		},
	);
	return ProcessedEvent;
};
