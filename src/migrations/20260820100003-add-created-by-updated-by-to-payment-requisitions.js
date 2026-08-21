'use strict';

/**
 * Adds explicit created_by_id / updated_by_id to PaymentRequisitions.
 *
 * fed_by_id already captures who created the requisition and authorized_by_id
 * captures the approver, but no column currently attributes a non-approver
 * edit (e.g. a creator fixing a typo before approval) to anyone.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const cols = await queryInterface.describeTable('PaymentRequisitions');

		if (!cols.created_by_id) {
			await queryInterface.addColumn('PaymentRequisitions', 'created_by_id', {
				type: Sequelize.INTEGER,
				allowNull: true,
				after: 'fed_by',
			});
		}

		if (!cols.updated_by_id) {
			await queryInterface.addColumn('PaymentRequisitions', 'updated_by_id', {
				type: Sequelize.INTEGER,
				allowNull: true,
				after: 'created_by_id',
			});
		}

		await queryInterface.sequelize.query(`
			UPDATE PaymentRequisitions SET created_by_id = fed_by_id WHERE created_by_id IS NULL
		`);
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('PaymentRequisitions', 'updated_by_id');
		await queryInterface.removeColumn('PaymentRequisitions', 'created_by_id');
	},
};
