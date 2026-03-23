'use strict';

module.exports = {
	async up(queryInterface) {
		await queryInterface.bulkInsert(
			'IndentRemarks',
			[
				{
					id: 1,
					remarks: 'EXCESS CONSUMPTION',
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 2,
					remarks: 'EXCESS PURCHASE',
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 3,
					remarks: 'REMAINING PURCHASE QUANTITY',
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 4,
					remarks: 'PASSED FOR ISSUE',
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 5,
					remarks: 'PASSED FOR PURCHASE',
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 6,
					remarks: 'NO ADDITIONAL REMARKS',
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			],
			{},
		);
	},

	async down(queryInterface) {
		await queryInterface.bulkDelete('IndentRemarks', null, {});
	},
};
