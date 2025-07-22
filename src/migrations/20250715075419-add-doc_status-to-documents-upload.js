'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('DocumentsUploads', 'doc_status', {
			type: Sequelize.ENUM([
				'UPLOADED',
				'IN-PROGRESS',
				'DUPLICATE',
				'FAILED',
				'RESULT',
			]),
			defaultValue: 'UPLOADED',
			allowNull: false,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('DocumentsUploads', 'doc_status');
	},
};
