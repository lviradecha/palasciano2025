// functions/send-email.js
const formData = require('form-data');
const Mailgun = require('mailgun.js');

exports.handler = async (event, context) => {
  // Solo POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Leggi dati dalla richiesta
    const { recipient, subject, htmlContent, qrCodeDataUrl } = JSON.parse(event.body);

    // Inizializza Mailgun
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY // API Key da variabili ambiente
    });

    // Prepara l'email
    const emailData = {
      from: `Palasciano 2025 <noreply@${process.env.MAILGUN_DOMAIN}>`,
      to: recipient,
      subject: subject,
      html: htmlContent
    };

    // Se c'è un QR Code, allegalo come immagine
    if (qrCodeDataUrl) {
      // Converti base64 a buffer
      const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      emailData.attachment = {
        data: buffer,
        filename: 'qrcode.png',
        contentType: 'image/png'
      };
    }

    // Invia email
    const response = await mg.messages.create(process.env.MAILGUN_DOMAIN, emailData);

    console.log('✅ Email inviata:', response.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        messageId: response.id,
        message: 'Email inviata con successo'
      })
    };

  } catch (error) {
    console.error('❌ Errore invio email:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};