'use strict';

/** @type {import('sequelize-cli').Migration} */
const bcrypt = require('bcrypt');

module.exports = {
	async up(queryInterface, Sequelize) {
		const hashedPassword = await bcrypt.hash('12345678', 10);

		await queryInterface.bulkInsert('organizations', [
			{
				id: 1,
				org_name: 'UrbanBuild Constructions',
				org_code: 'UBC05',
				org_gst_number: '09AAACH7409R1ZZ',
				pan: 'DNJPB2328P',
				org_email: 'urban@gmail.com',
				org_person_name: 'Vikrant Singh',
				org_person_contact: '9871209876',
				org_address: 'Sector 45, Industrial Area, Noida, Uttar Pradesh',
				pincode: 201010,
				city: 'Roorkee',
				state: 'Uttar Pradesh',
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		await queryInterface.bulkInsert('Users', [
			{
				org_id: 1,
				name: 'Vikrant Singh',
				email: 'urban@gmail.com',
				password: hashedPassword,
				roleId: 2,
				is_active: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		// await queryInterface.bulkInsert('organizations', [
		// 	{
		// 		id: 1,
		// 		org_name: 'TechNova Solutions',
		// 		org_code: 'TNS01',
		// 		org_email: 'contact@technova.com',
		// 		org_person_name: 'Rajesh Kumar',
		// 		org_person_contact: '9876543210',
		// 		org_address: '401, Tech Park, Bengaluru, Karnataka',
		// 		createdAt: new Date(),
		// 		updatedAt: new Date(),
		// 	},
		// 	{
		// 		id: 2,
		// 		org_name: 'GreenLeaf Agro',
		// 		org_code: 'GLA02',
		// 		org_email: 'info@greenleafagro.in',
		// 		org_person_name: 'Sneha Reddy',
		// 		org_person_contact: '9123456789',
		// 		org_address: 'Plot No. 12, Agro Industrial Zone, Pune, Maharashtra',
		// 		createdAt: new Date(),
		// 		updatedAt: new Date(),
		// 	},
		// 	{
		// 		id: 3,
		// 		org_name: 'MedicoMart Pvt Ltd',
		// 		org_code: 'MMP03',
		// 		org_email: 'support@medicomart.com',
		// 		org_person_name: 'Dr. Arjun Mehta',
		// 		org_person_contact: '9988776655',
		// 		org_address: '1st Floor, Health Tower, Ahmedabad, Gujarat',
		// 		createdAt: new Date(),
		// 		updatedAt: new Date(),
		// 	},
		// 	{
		// 		id: 4,
		// 		org_name: 'EduPrime Learning',
		// 		org_code: 'EPL04',
		// 		org_email: 'admin@eduprime.org',
		// 		org_person_name: 'Priya Nair',
		// 		org_person_contact: '9090901234',
		// 		org_address: '3rd Cross, Knowledge Hub, Kochi, Kerala',
		// 		createdAt: new Date(),
		// 		updatedAt: new Date(),
		// 	},
		// 	{
		// 		id: 5,
		// 		org_name: 'UrbanBuild Constructions',
		// 		org_code: 'UBC05',
		// 		org_email: 'contact@urbanbuild.co.in',
		// 		org_person_name: 'Vikrant Singh',
		// 		org_person_contact: '9871209876',
		// 		org_address: 'Sector 45, Industrial Area, Noida, Uttar Pradesh',
		// 		createdAt: new Date(),
		// 		updatedAt: new Date(),
		// 	},
		// ]);
	},

	async down(queryInterface, Sequelize) {
		// await queryInterface.bulkDelete('organizations', null, {});
		await queryInterface.bulkDelete('Users', { email: 'urban@gmail.com' });
		await queryInterface.bulkDelete('organizations', { id: 1 });
	},
};
