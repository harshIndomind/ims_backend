'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('indent_item_qty_log', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			indent_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'Indents', key: 'id' },
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
			},
			indent_item_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'IndentItems', key: 'id' },
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
			},
			product_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			// Which IndentItem counter this event changed — 'qty_for_purchase_order' (open-PO
			// balance) or 'balance_indent_qty' (post-receipt re-issue backorder). See
			// indentitem.js's column comments for what each field actually means.
			field: {
				type: Sequelize.STRING(40),
				allowNull: false,
			},
			// What triggered the change: indent_approved, po_submitted, po_updated, po_deleted,
			// wo_created, wo_updated, wo_deleted, short_close_released, reissued.
			source: {
				type: Sequelize.STRING(40),
				allowNull: false,
			},
			// id of the document that caused the change (PO id / WO id / short_close_requests id),
			// polymorphic like short_close_request_items.po_wo_item_id — no FK constraint since it
			// targets different tables depending on `source`. Null for indent_approved/reissued,
			// which aren't tied to a PO/WO/short-close document.
			source_ref_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			delta: {
				type: Sequelize.DOUBLE,
				allowNull: false,
			},
			previous_value: {
				type: Sequelize.DOUBLE,
				allowNull: false,
				defaultValue: 0,
			},
			new_value: {
				type: Sequelize.DOUBLE,
				allowNull: false,
				defaultValue: 0,
			},
			performed_by: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			remarks: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
				defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
			},
			updatedAt: {
				allowNull: true,
				type: Sequelize.DATE,
				defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
			},
		});

		await queryInterface.addIndex('indent_item_qty_log', ['indent_id'], {
			name: 'indent_item_qty_log_indent_idx',
		});
		await queryInterface.addIndex('indent_item_qty_log', ['indent_item_id'], {
			name: 'indent_item_qty_log_indent_item_idx',
		});
	},

	async down(queryInterface) {
		await queryInterface.dropTable('indent_item_qty_log');
	},
};
