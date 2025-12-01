'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    console.log("🔍 Checking and cleaning old constraints...");

    // 1. Remove production FK (actual existing one)
    await queryInterface.removeConstraint(
      'InvoiceItems',
      'InvoiceItems_ibfk_14'
    ).catch(() => {
      console.log("ℹ️ Constraint InvoiceItems_ibfk_14 not found, skipping...");
    });

    // 2. Remove any previously created wrong FK names (safe cleanup)
    await queryInterface.removeConstraint(
      'InvoiceItems',
      'InvoiceItems_selected_uom_id_foreign_idx'
    ).catch(() => {});

    await queryInterface.removeConstraint(
      'InvoiceItems',
      'fk_invoiceitems_selected_uom_id_productuom'
    ).catch(() => {});

    console.log("🧹 Old constraints removed successfully (or skipped).");


    // 3. Make sure column exists (add only if missing)
    await queryInterface.addColumn('InvoiceItems', 'selected_uom_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    }).catch(() => {
      console.log("ℹ️ Column selected_uom_id already exists, skipping add...");
    });


    // 4. Add new FK to ProductUOMs
    console.log("🔗 Adding new FK to ProductUOMs...");
    await queryInterface.addConstraint('InvoiceItems', {
      fields: ['selected_uom_id'],
      type: 'foreign key',
      name: 'fk_invoiceitems_selected_uom_id_productuom',  // permanent stable name
      references: {
        table: 'ProductUOMs',
        field: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    console.log("✅ FK added successfully → InvoiceItems.selected_uom_id → ProductUOMs.id");
  },

  async down(queryInterface, Sequelize) {

    console.log("🔄 Rolling back migration...");

    // Remove new FK
    await queryInterface.removeConstraint(
      'InvoiceItems',
      'fk_invoiceitems_selected_uom_id_productuom'
    ).catch(() => {});

    // Restore old FK referencing Units
    await queryInterface.addConstraint('InvoiceItems', {
      fields: ['selected_uom_id'],
      type: 'foreign key',
      name: 'InvoiceItems_ibfk_14',
      references: {
        table: 'Units',
        field: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    console.log("◀️ Migration rolled back: FK to Units restored.");
  }
};
