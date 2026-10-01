'use strict';

/**
 * Additional Cost Provision + Budget Commitment Limit (docs/budget-validation/budget-modification.md).
 *
 *   commitment_limit = amount
 *                    + (tax_budget_impact = 'non_recoverable' ? tax_duty_amount : 0)
 *                    + provision_amount
 *
 * `revised_amount` is the running total of APPROVED budget_revisions — never client-settable,
 * only ever incremented by budget-revision.service.js's final approval.
 *
 * Backfill keeps every existing budget's effective ceiling exactly where it is today
 * (amount + tax_duty_amount — the same sum the cost-centre allocation already charges for it):
 * no provision, tax treated as budget-impacting.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('Budgets', 'provision_type', {
			type: Sequelize.ENUM('none', 'percentage', 'fixed'),
			allowNull: false,
			defaultValue: 'none',
			after: 'tax_duty_amount',
		});
		await queryInterface.addColumn('Budgets', 'provision_percentage', {
			type: Sequelize.DOUBLE,
			allowNull: true,
			after: 'provision_type',
		});
		await queryInterface.addColumn('Budgets', 'provision_amount', {
			type: Sequelize.DOUBLE,
			allowNull: false,
			defaultValue: 0,
			after: 'provision_percentage',
		});
		await queryInterface.addColumn('Budgets', 'tax_budget_impact', {
			type: Sequelize.ENUM('recoverable', 'non_recoverable'),
			allowNull: false,
			defaultValue: 'non_recoverable',
			after: 'provision_amount',
		});
		await queryInterface.addColumn('Budgets', 'commitment_limit', {
			type: Sequelize.DOUBLE,
			allowNull: true,
			after: 'tax_budget_impact',
		});
		await queryInterface.addColumn('Budgets', 'revised_amount', {
			type: Sequelize.DOUBLE,
			allowNull: false,
			defaultValue: 0,
			after: 'commitment_limit',
		});

		await queryInterface.sequelize.query(
			'UPDATE `Budgets` SET `commitment_limit` = COALESCE(`amount`, 0) + COALESCE(`tax_duty_amount`, 0)',
		);
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('Budgets', 'revised_amount');
		await queryInterface.removeColumn('Budgets', 'commitment_limit');
		await queryInterface.removeColumn('Budgets', 'tax_budget_impact');
		await queryInterface.removeColumn('Budgets', 'provision_amount');
		await queryInterface.removeColumn('Budgets', 'provision_percentage');
		await queryInterface.removeColumn('Budgets', 'provision_type');
	},
};
