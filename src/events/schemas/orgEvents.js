// auth-service/src/events/schemas/orgEvents.js

const { APP_CODE } = require('../../config/serverConfig');

function buildOrgCreatedEvent(org, bankDetails, adminUser) {
  return {
    eventId:   require('crypto').randomUUID(),
    eventType: 'org.created',
    version:   '1.0',
    timestamp: new Date().toISOString(),
    source:    APP_CODE,
    data: {
      uuid:               org.uuid,
      auth_org_id:        org.id,
      org_name:           org.org_name,
      org_code:           org.org_code,
      org_gst_number:     org.org_gst_number,
      pan:                org.pan,
      org_email:          org.org_email,
      org_person_name:    org.org_person_name,
      org_person_contact: org.org_person_contact,
      org_address:        org.org_address,
      pincode:            org.pincode,
      city:               org.city,
      state_id:           org.state_id,
      update_gst_on_invoices: org.update_gst_on_invoices,
      domain:             org.domain,
      sub_domain:         org.sub_domain,
      bank_details:       bankDetails,
      admin_user: {
        auth_user_id: adminUser.id,
        uuid: adminUser.uuid,
        email:        adminUser.email,
        name:         adminUser.name,
        password:     adminUser.password,
      },
    },
  };
}

function buildOrgUpdatedEvent(org, bankDetails, adminUser) {
  return {
    eventId:   require('crypto').randomUUID(),
    eventType: 'org.updated',
    version:   '1.0',
    timestamp: new Date().toISOString(),
    source:    APP_CODE,
    data: {
      uuid:               org.uuid,
      auth_org_id:        org.id,
      org_name:           org.org_name,
      org_code:           org.org_code,
      org_gst_number:     org.org_gst_number,
      pan:                org.pan,
      org_email:          org.org_email,
      org_person_name:    org.org_person_name,
      org_person_contact: org.org_person_contact,
      org_address:        org.org_address,
      pincode:            org.pincode,
      city:               org.city,
      state_id:           org.state_id,
      update_gst_on_invoices: org.update_gst_on_invoices,
      domain:             org.domain,
      sub_domain:         org.sub_domain,
      // bank_details:       bankDetails,
      // admin_user: {
      //   auth_user_id: adminUser.id,
      //   email:        adminUser.email,
      //   name:         adminUser.name,
      //   password:     adminUser.password,
      // },
    },
  };
}

module.exports = { buildOrgCreatedEvent, buildOrgUpdatedEvent };