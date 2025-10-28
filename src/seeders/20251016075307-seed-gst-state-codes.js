'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('GstStateCodes', [
      { country_id: 78, gst_code: 1, gst_code_padded: '01', state_name: 'Jammu and Kashmir', notes: null },
      { country_id: 78, gst_code: 2, gst_code_padded: '02', state_name: 'Himachal Pradesh', notes: null },
      { country_id: 78, gst_code: 3, gst_code_padded: '03', state_name: 'Punjab', notes: null },
      { country_id: 78, gst_code: 4, gst_code_padded: '04', state_name: 'Chandigarh', notes: null },
      { country_id: 78, gst_code: 5, gst_code_padded: '05', state_name: 'Uttarakhand', notes: null },
      { country_id: 78, gst_code: 6, gst_code_padded: '06', state_name: 'Haryana', notes: null },
      { country_id: 78, gst_code: 7, gst_code_padded: '07', state_name: 'Delhi', notes: null },
      { country_id: 78, gst_code: 8, gst_code_padded: '08', state_name: 'Rajasthan', notes: null },
      { country_id: 78, gst_code: 9, gst_code_padded: '09', state_name: 'Uttar Pradesh', notes: null },
      { country_id: 78, gst_code: 10, gst_code_padded: '10', state_name: 'Bihar', notes: null },
      { country_id: 78, gst_code: 11, gst_code_padded: '11', state_name: 'Sikkim', notes: null },
      { country_id: 78, gst_code: 12, gst_code_padded: '12', state_name: 'Arunachal Pradesh', notes: null },
      { country_id: 78, gst_code: 13, gst_code_padded: '13', state_name: 'Nagaland', notes: null },
      { country_id: 78, gst_code: 14, gst_code_padded: '14', state_name: 'Manipur', notes: null },
      { country_id: 78, gst_code: 15, gst_code_padded: '15', state_name: 'Mizoram', notes: null },
      { country_id: 78, gst_code: 16, gst_code_padded: '16', state_name: 'Tripura', notes: null },
      { country_id: 78, gst_code: 17, gst_code_padded: '17', state_name: 'Meghalaya', notes: null },
      { country_id: 78, gst_code: 18, gst_code_padded: '18', state_name: 'Assam', notes: null },
      { country_id: 78, gst_code: 19, gst_code_padded: '19', state_name: 'West Bengal', notes: null },
      { country_id: 78, gst_code: 20, gst_code_padded: '20', state_name: 'Jharkhand', notes: null },
      { country_id: 78, gst_code: 21, gst_code_padded: '21', state_name: 'Odisha', notes: null },
      { country_id: 78, gst_code: 22, gst_code_padded: '22', state_name: 'Chhattisgarh', notes: null },
      { country_id: 78, gst_code: 23, gst_code_padded: '23', state_name: 'Madhya Pradesh', notes: null },
      { country_id: 78, gst_code: 24, gst_code_padded: '24', state_name: 'Gujarat', notes: null },
      { country_id: 78, gst_code: 26, gst_code_padded: '26', state_name: 'Dadra and Nagar Haveli and Daman & Diu', notes: 'Union Territory' },
      { country_id: 78, gst_code: 27, gst_code_padded: '27', state_name: 'Maharashtra', notes: null },
      { country_id: 78, gst_code: 28, gst_code_padded: '28', state_name: 'Andhra Pradesh (old)', notes: 'Old AP code' },
      { country_id: 78, gst_code: 29, gst_code_padded: '29', state_name: 'Karnataka', notes: null },
      { country_id: 78, gst_code: 30, gst_code_padded: '30', state_name: 'Goa', notes: null },
      { country_id: 78, gst_code: 31, gst_code_padded: '31', state_name: 'Lakshadweep', notes: null },
      { country_id: 78, gst_code: 32, gst_code_padded: '32', state_name: 'Kerala', notes: null },
      { country_id: 78, gst_code: 33, gst_code_padded: '33', state_name: 'Tamil Nadu', notes: null },
      { country_id: 78, gst_code: 34, gst_code_padded: '34', state_name: 'Puducherry', notes: null },
      { country_id: 78, gst_code: 35, gst_code_padded: '35', state_name: 'Andaman and Nicobar Islands', notes: null },
      { country_id: 78, gst_code: 36, gst_code_padded: '36', state_name: 'Telangana', notes: null },
      { country_id: 78, gst_code: 37, gst_code_padded: '37', state_name: 'Andhra Pradesh (new)', notes: 'After bifurcation' },
      { country_id: 78, gst_code: 38, gst_code_padded: '38', state_name: 'Ladakh', notes: null },
      { country_id: 78, gst_code: 97, gst_code_padded: '97', state_name: 'Other Territory', notes: 'Reserved' },
      { country_id: 78, gst_code: 99, gst_code_padded: '99', state_name: 'Centre Jurisdiction', notes: 'Central Govt' }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('GstStateCodes', null, {});
  }
};
