'use strict';
/** @type {import('sequelize-cli').Migration} */
// No surrogate AUTO_INCREMENT id column here on purpose: the counter is read/written via the
// MySQL LAST_INSERT_ID(expr) upsert idiom (see document-numbering.service.js), and that idiom is
// unreliable on a table that also has its own AUTO_INCREMENT column — on a fresh insert MySQL
// sets the session's last-insert-id from the autoincrement value instead of the explicit
// LAST_INSERT_ID(1) expression, which breaks the atomicity this table exists for. The natural
// composite key (org_id, doc_type, fiscal_year) is the primary key instead.
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('DocumentNumberSequences', {
			org_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				primaryKey: true,
				references: { model: 'organizations', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			doc_type: {
				type: Sequelize.ENUM('PO', 'WO'),
				allowNull: false,
				primaryKey: true,
			},
			fiscal_year: {
				type: Sequelize.STRING(7),
				allowNull: false,
				primaryKey: true,
			},
			last_number: {
				type: Sequelize.INTEGER,
				allowNull: false,
				defaultValue: 0,
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
		});
	},
	async down(queryInterface) {
		await queryInterface.dropTable('DocumentNumberSequences');
	},
};
