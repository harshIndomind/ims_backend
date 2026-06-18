'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		// Company details
		await queryInterface.addColumn('MasterUnits', 'gstin', {
			type: Sequelize.STRING(30),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'pan', {
			type: Sequelize.STRING(20),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'registration_type', {
			type: Sequelize.TINYINT,
			allowNull: true,
			defaultValue: 1,
		});
		await queryInterface.addColumn('MasterUnits', 'contact_no', {
			type: Sequelize.STRING(100),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'company_email', {
			type: Sequelize.TEXT,
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'is_tds_applicable', {
			type: Sequelize.BOOLEAN,
			allowNull: true,
			defaultValue: false,
		});
		await queryInterface.addColumn('MasterUnits', 'tds_percentage', {
			type: Sequelize.DECIMAL(10, 2),
			allowNull: true,
			defaultValue: 0,
		});

		// Billing address
		await queryInterface.addColumn('MasterUnits', 'address1', {
			type: Sequelize.TEXT,
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'address2', {
			type: Sequelize.TEXT,
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'landmark', {
			type: Sequelize.STRING(150),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'country_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'Countries', key: 'id' },
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
		await queryInterface.addColumn('MasterUnits', 'state_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'GstStateCodes', key: 'id' },
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
		await queryInterface.addColumn('MasterUnits', 'country', {
			type: Sequelize.STRING(100),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'state', {
			type: Sequelize.STRING(100),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'city', {
			type: Sequelize.STRING(100),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'pincode', {
			type: Sequelize.STRING(10),
			allowNull: true,
		});

		// Bank details
		await queryInterface.addColumn('MasterUnits', 'bank_account_holder_name', {
			type: Sequelize.STRING(150),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'bank_name', {
			type: Sequelize.STRING(150),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'bank_ifsc_code', {
			type: Sequelize.STRING(20),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'bank_account_no', {
			type: Sequelize.STRING(50),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'bank_branch_name', {
			type: Sequelize.STRING(100),
			allowNull: true,
		});

		// Additional details
		await queryInterface.addColumn('MasterUnits', 'fax', {
			type: Sequelize.STRING(50),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'website', {
			type: Sequelize.STRING(150),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'credit_limit', {
			type: Sequelize.DECIMAL(10, 2),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'due_days', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'note', {
			type: Sequelize.TEXT,
			allowNull: true,
		});

		// Opening balance (flat: vendor + customer)
		await queryInterface.addColumn('MasterUnits', 'ob_vendor_balance_type', {
			type: Sequelize.ENUM('credit', 'debit'),
			allowNull: true,
			defaultValue: 'credit',
		});
		await queryInterface.addColumn('MasterUnits', 'ob_vendor_amount', {
			type: Sequelize.DECIMAL(10, 2),
			allowNull: true,
			defaultValue: 0,
		});
		await queryInterface.addColumn('MasterUnits', 'ob_customer_balance_type', {
			type: Sequelize.ENUM('credit', 'debit'),
			allowNull: true,
			defaultValue: 'credit',
		});
		await queryInterface.addColumn('MasterUnits', 'ob_customer_amount', {
			type: Sequelize.DECIMAL(10, 2),
			allowNull: true,
			defaultValue: 0,
		});
	},

	async down(queryInterface) {
		const columns = [
			'gstin', 'pan', 'registration_type', 'contact_no', 'company_email',
			'is_tds_applicable', 'tds_percentage',
			'address1', 'address2', 'landmark', 'country_id', 'state_id',
			'country', 'state', 'city', 'pincode',
			'bank_account_holder_name', 'bank_name', 'bank_ifsc_code',
			'bank_account_no', 'bank_branch_name',
			'fax', 'website', 'credit_limit', 'due_days', 'note',
			'ob_vendor_balance_type', 'ob_vendor_amount',
			'ob_customer_balance_type', 'ob_customer_amount',
		];
		for (const col of columns) {
			await queryInterface.removeColumn('MasterUnits', col);
		}
	},
};
