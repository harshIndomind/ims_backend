// vcp-service/src/events/handlers/orgHandler.js

const {
	organization,
	OrganizationBankDetails,
	User,
	Role,
	UserRole,
	sequelize,
} = require('../../models');
const logger = require('../../utils/logger');

async function handleOrgCreated(data) {
	const t = await sequelize.transaction();
	try {
		// 1. Create organization
		const [localOrg, created] = await organization.upsert(
			{
				uuid: data.uuid,
				swayamm_org_id: data.auth_org_id,
				org_name: data.org_name,
				org_code: data.org_code,
				org_gst_number: data.org_gst_number,
				pan: data.pan,
				org_email: data.org_email,
				org_person_name: data.org_person_name,
				org_person_contact: data.org_person_contact,
				org_address: data.org_address,
				pincode: data.pincode,
				city: data.city,
				state_id: Number(data.state_id),
				update_gst_on_invoices: data.update_gst_on_invoices,
				createdBy: 1,
			},
			{ transaction: t },
		);
    logger.debug("localOrg ", {localOrg})
		// const localOrg = await organization.findOne({
		//   where: { swayamm_org_id: data.auth_org_id },
		// });
		logger.debug('Organization Created: ', {
			swayamm_org_id: data.auth_org_id,
			org_name: data.org_name,
			org_code: data.org_code,
			org_gst_number: data.org_gst_number,
			pan: data.pan,
			org_email: data.org_email,
			org_person_name: data.org_person_name,
			org_person_contact: data.org_person_contact,
			org_address: data.org_address,
			pincode: data.pincode,
			city: data.city,
			state_id: data.state_id,
			// domain:             data.domain,
			// sub_domain:         data.sub_domain,
			createdBy: 1,
		});
		// 2. Create bank details
		if (data.bank_details?.length) {
			for (const bank of data.bank_details) {
				await OrganizationBankDetails.upsert(
					{
						org_id: localOrg.id,
						account_name: bank.account_name,
						account_no: bank.account_no,
						bank_name: bank.bank_name,
						branch_name: bank.branch_name,
						bank_ifsc: bank.bank_ifsc,
						swift_code: bank.swift_code,
						micr_code: bank.micr_code,
						upi_id: bank.upi_id,
					},
					{ transaction: t },
				);
			}
		}

		// 3. Create org admin user
		if (data.admin_user) {
			logger.debug('Creating Organization Admin User: ', {
				id: data.admin_user.auth_user_id,
				swayamm_user_id: data.admin_user.auth_user_id,
				email: data.admin_user.email,
				name: data.admin_user.name,
				password: data.admin_user.password,
				org_id: localOrg.id,
				is_active: 1,
			});
			await User.upsert(
				{
					id: data.admin_user.auth_user_id,
					swayamm_user_id: data.admin_user.auth_user_id,
					email: data.admin_user.email,
					name: data.admin_user.name,
					password: data.admin_user.password,
					org_id: localOrg.id,
					is_active: 1,
				},
				{ transaction: t },
			);

			// Assign org_admin role
			const role = await Role.findOne({ where: { code: 'org_admin' } });
			if (role) {
				await UserRole.upsert(
					{
						user_id: data.admin_user.auth_user_id,
						role_id: role.id,
						// assigned_at: new Date(),
					},
					{ transaction: t },
				);
			}
		}

		await t.commit();
		logger.info('Org synced to VCP', { auth_org_id: data.auth_org_id });
	} catch (err) {
		logger.debug('Error while creating an organization: ', { err });
		await t.rollback();
		throw err;
	}
}

async function handleOrgUpdated(data) {
	await organization.update(
		{
			uuid: data.uuid,
			org_name: data.org_name,
			org_gst_number: data.org_gst_number,
			pan: data.pan,
			org_email: data.org_email,
			org_person_name: data.org_person_name,
			org_person_contact: data.org_person_contact,
			org_address: data.org_address,
			pincode: data.pincode,
			city: data.city,
			state_id: data.state_id,
		},
		{ where: { swayamm_org_id: data.auth_org_id } },
	);
}

async function handleOrgDeactivated(data) {
	const localOrg = await organization.findOne({
		where: { swayamm_org_id: data.auth_org_id },
	});
	if (!localOrg) return;

	await organization.update({ is_active: 0 }, { where: { id: localOrg.id } });

	// Deactivate ALL users in this org
	await User.update({ is_active: 0 }, { where: { org_id: localOrg.id } });
}

async function handleBankAdded(data) {
	const localOrg = await organization.findOne({
		where: { swayamm_org_id: data.auth_org_id },
	});
	if (!localOrg) return;

	await OrganizationBankDetails.upsert({
		swayamm_bank_id: data.bank.id,
		org_id: localOrg.id,
		...data.bank,
	});
}

async function handleBankUpdated(data) {
	await OrganizationBankDetails.update(
		{ ...data.bank },
		{ where: { swayamm_bank_id: data.bank.id } },
	);
}

async function handleBankDeleted(data) {
	await OrganizationBankDetails.destroy({
		where: { swayamm_bank_id: data.bank_id },
	});
}

module.exports = {
	handleOrgCreated,
	handleOrgUpdated,
	handleOrgDeactivated,
	handleBankAdded,
	handleBankUpdated,
	handleBankDeleted,
};
