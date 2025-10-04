// functions/send-email.js
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const QRCode = require('qrcode');

exports.handler = async (event, context) => {
  // Solo POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // DEBUG: Verifica che le variabili esistano
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    
    console.log('🔍 DEBUG - API Key presente:', !!apiKey);
    console.log('🔍 DEBUG - Domain presente:', !!domain);
    
    if (!apiKey || !domain) {
      throw new Error('Variabili d\'ambiente MAILGUN_API_KEY o MAILGUN_DOMAIN mancanti');
    }

    // Leggi dati dalla richiesta
    const { recipient, subject, htmlContent, qrData } = JSON.parse(event.body);

    // Genera QR Code REALE lato server
    let qrCodeDataUrl = null;
    if (qrData) {
      qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 300,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      console.log('✅ QR Code generato correttamente');
    }

    // Sostituisci il placeholder nel HTML con il QR Code vero
    let finalHtml = htmlContent;
    if (qrCodeDataUrl) {
      finalHtml = htmlContent.replace(/src="data:image\/png;base64,[^"]*"/, `src="${qrCodeDataUrl}"`);
    }

    // Inizializza Mailgun con server EU
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({
      username: 'api',
      key: apiKey,
      url: 'https://api.eu.mailgun.net'
    });

    // Prepara l'email
    const emailData = {
      from: `Palasciano 2025 <noreply@${domain}>`,
      to: recipient,
      subject: subject,
      html: finalHtml
    };

    // Allega QR Code come file
    if (qrCodeDataUrl) {
      const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      emailData.attachment = [{
        data: buffer,
        filename: 'QRCode_Palasciano2025.png',
        contentType: 'image/png'
      }];
      
      console.log('✅ QR Code allegato all\'email');
    }

    // Invia email
    console.log('📧 Tentativo invio email a:', recipient);
    const response = await mg.messages.create(domain, emailData);

    console.log('✅ Email inviata con successo:', response.id);

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
    console.error('❌ Stack trace:', error.stack);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
