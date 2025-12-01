'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		console.log('🔍 Checking and cleaning old constraints...');

		// 1. Remove production FK (actual existing one)
		await queryInterface
			.removeConstraint(
				'CreditNoteInvoiceItems',
				'CreditNoteInvoiceItems_ibfk_5'
			)
			.catch(() => {
				console.log(
					'ℹ️ Constraint CreditNoteInvoiceItems_ibfk_5 not found, skipping...'
				);
			});

		// 2. Remove any previously created wrong FK names (safe cleanup)
		await queryInterface
			.removeConstraint(
				'CreditNoteInvoiceItems',
				'CreditNoteInvoiceItems_selected_uom_id_foreign_idx'
			)
			.catch(() => {});

		await queryInterface
			.removeConstraint(
				'CreditNoteInvoiceItems',
				'fk_creditnoteinvoiceitems_selected_uom_id_productuom'
			)
			.catch(() => {});

		console.log('🧹 Old constraints removed successfully (or skipped).');

		// 3. Make sure column exists (add only if missing)
		await queryInterface
			.addColumn('CreditNoteInvoiceItems', 'selected_uom_id', {
				type: Sequelize.INTEGER,
				allowNull: true,
			})
			.catch(() => {
				console.log(
					'ℹ️ Column selected_uom_id already exists, skipping add...'
				);
			});

		// 4. Add new FK to ProductUOMs
		console.log('🔗 Adding new FK to ProductUOMs...');
		await queryInterface.addConstraint('CreditNoteInvoiceItems', {
			fields: ['selected_uom_id'],
			type: 'foreign key',
			name: 'fk_creditnoteinvoiceitems_selected_uom_id_productuom', // permanent stable name
			references: {
				table: 'ProductUOMs',
				field: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});

		console.log(
			'✅ FK added successfully → CreditNoteInvoiceItem.selected_uom_id → ProductUOMs.id'
		);
	},

	async down(queryInterface, Sequelize) {
		console.log('🔄 Rolling back migration...');

		// Remove new FK
		await queryInterface
			.removeConstraint(
				'CreditNoteInvoiceItems',
				'fk_creditnoteinvoiceitems_selected_uom_id_productuom'
			)
			.catch(() => {});

		// Restore old FK referencing Units
		await queryInterface.addConstraint('CreditNoteInvoiceItems', {
			fields: ['selected_uom_id'],
			type: 'foreign key',
			name: 'CreditNoteInvoiceItems_ibfk_14',
			references: {
				table: 'Units',
				field: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});

		console.log('◀️ Migration rolled back: FK to Units restored.');
	},
};
