'use strict';

/**
 * Budget Revision = a controlled, workflow-approved increase of a budget's commitment limit
 * (document_type 'budget_revision' in workflow_instances). The previous/revised limits are
 * snapshotted at request time and re-snapshotted at final approval, so the audit trail always
 * reads "Original + Revision = Revised" against the numbers that were actually in force.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('budget_revisions', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			revision_no: {
				type: Sequelize.STRING(30),
				allowNull: true,
			},
			budget_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'Budgets', key: 'id' },
				onUpdate: 'CASCADE',
				// Revisions are the budget's audit trail — budget.service.js's deleteBudget refuses
				// to delete a budget that has any, rather than silently erasing them.
				onDelete: 'RESTRICT',
			},
			previous_limit: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
			},
			revision_amount: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
			},
			revised_limit: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
			},
			reason: {
				type: Sequelize.TEXT,
				allowNull: false,
			},
			// Optional pointer to the PO/WO whose excess prompted this revision (informational).
			source_document_type: {
				type: Sequelize.ENUM('purchase_order', 'work_order'),
				allowNull: true,
			},
			source_document_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			status: {
				type: Sequelize.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled'),
				allowNull: false,
				defaultValue: 'draft',
			},
			requested_by: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			requested_at: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			approved_by: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			approved_at: {
				type: Sequelize.DATE,
				allowNull: true,
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

		await queryInterface.addIndex('budget_revisions', ['budget_id']);
		await queryInterface.addIndex('budget_revisions', ['org_id', 'status']);
	},

	async down(queryInterface) {
		await queryInterface.dropTable('budget_revisions');
	},
};
