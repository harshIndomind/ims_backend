'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableName = 'Invoices';

        // 1. Get all indexes
        const indexes = await queryInterface.showIndex(tableName);

        // 2. Find old unique index on invoiceNo
        const oldUnique = indexes.find(
            idx => idx.unique && idx.fields.some(f => f.attribute === 'invoiceNo')
        );

        // 3. Remove old unique index if exists
        if (oldUnique) {
            await queryInterface.removeIndex(tableName, oldUnique.name);
        }

        // 4. Add new composite unique index (orgId + invoiceNo)
        await queryInterface.addIndex(tableName, ['orgId', 'invoiceNo'], {
            unique: true,
            name: 'unique_org_invoiceNo',
        });
    },

    async down(queryInterface, Sequelize) {
        const tableName = 'Invoices';

        // Remove composite index
        await queryInterface.removeIndex(tableName, 'unique_org_invoiceNo');

        // Optional: re-add old global unique index (if required)
        // await queryInterface.addIndex(tableName, ['invoiceNo'], {
        //     unique: true,
        //     name: 'invoiceNo_unique'
        // });
    }
};