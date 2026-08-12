'use strict';
/**
 * Nullable — non-QC GRNs (po_qc_check=false) leave this null and behave exactly as before.
 * When present, it's the QC line this GRN item is drawing accepted quantity down against.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('GoodsReceiptNoteItems', 'qc_inspection_item_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'qc_inspection_items', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    await queryInterface.addIndex('GoodsReceiptNoteItems', ['qc_inspection_item_id'], {
      name: 'idx_grn_items_qc_inspection_item',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('GoodsReceiptNoteItems', 'idx_grn_items_qc_inspection_item');
    await queryInterface.removeColumn('GoodsReceiptNoteItems', 'qc_inspection_item_id');
  },
};
