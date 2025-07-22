'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.bulkInsert('docs_categories', [
			{
				id: 1,
				name: 'Bank Statement',
				short_code: 'BNKST',
				s3_folder_path: 'bank-statements',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 2,
				name: 'Cheques',
				short_code: 'CHQ',
				s3_folder_path: 'cheques',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 3,
				name: 'Disposal Certificate',
				short_code: 'DSCRT',
				s3_folder_path: 'disposal-certificates',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 4,
				name: 'Drug License',
				short_code: 'DRGLC',
				s3_folder_path: 'drug-licenses',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 5,
				name: 'FSSAI License',
				short_code: 'FSSAI',
				s3_folder_path: 'fssai-licenses',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 6,
				name: 'GST Certificate',
				short_code: 'GSTC',
				s3_folder_path: 'gst-certificates',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 7,
				name: 'MSME Certificate',
				short_code: 'MSME',
				s3_folder_path: 'msme-certificates',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 8,
				name: 'Non TDS Declaration Certificate',
				short_code: 'NTDSC',
				s3_folder_path: 'non-tds-certificates',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 9,
				name: 'PAN Card',
				short_code: 'PAN',
				s3_folder_path: 'pan-cards',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 10,
				name: 'TAN',
				short_code: 'TAN',
				s3_folder_path: 'tan-certificates',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 11,
				name: 'Invoice',
				short_code: 'INV',
				s3_folder_path: 'invoices',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 12,
				name: 'Purchase Order',
				short_code: 'PO',
				s3_folder_path: 'purchase-orders',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 13,
				name: 'Service Order',
				short_code: 'SO',
				s3_folder_path: 'service-orders',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete('docs_categories', null, {});
	},
};
