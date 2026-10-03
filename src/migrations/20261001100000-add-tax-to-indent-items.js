'use strict';

/**
 * Indent line tax (estimate, prefilled from the product's VCP tax, editable on the indent form).
 * Lets the indent budget check count the line's tax when the budget's tax is non-recoverable —
 * see budget-validation.service.js's validateIndentAgainstLiveBudget. `amount` stays pre-tax,
 * exactly as before; rows created before this migration simply carry no tax (null/0).
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('IndentItems', 'tax_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			after: 'amount',
		});
		await queryInterface.addColumn('IndentItems', 'taxSnapshot', {
			type: Sequelize.JSON,
			allowNull: true,
			after: 'tax_id',
		});
		await queryInterface.addColumn('IndentItems', 'tax_rate', {
			type: Sequelize.DECIMAL(5, 2),
			allowNull: true,
			after: 'taxSnapshot',
		});
		await queryInterface.addColumn('IndentItems', 'tax_amount', {
			type: Sequelize.DECIMAL(15, 2),
			allowNull: true,
			after: 'tax_rate',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('IndentItems', 'tax_amount');
		await queryInterface.removeColumn('IndentItems', 'tax_rate');
		await queryInterface.removeColumn('IndentItems', 'taxSnapshot');
		await queryInterface.removeColumn('IndentItems', 'tax_id');
	},
};
