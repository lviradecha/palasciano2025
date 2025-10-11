// test-mailgun.js
require('dotenv').config();  // <-- questa riga deve esserci PRIMA di tutto
const formData = require('form-data');
const Mailgun = require('mailgun.js');

async function testMail() {
  try {
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY,
      url: 'https://api.mailgun.net',
    });

    const result = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
      from: `Test Palasciano <noreply@${process.env.MAILGUN_DOMAIN}>`,
      to: 'tuoindirizzo@mail.com',  // <-- METTI QUI la tua mail per test
      subject: 'Test invio mail da script Node.js',
      text: 'Questa è una mail di test inviata da Mailgun tramite Node.js',
    });

    console.log('✅ Email inviata con successo:', result);
  } catch (error) {
    console.error('❌ Errore invio mail:', error);
  }
}

testMail();
