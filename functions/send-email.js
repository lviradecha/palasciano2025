// functions/send-email.js
const formData = require('form-data');
const Mailgun = require('mailgun.js');

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
    console.log('🔍 DEBUG - API Key inizio:', apiKey ? apiKey.substring(0, 8) + '...' : 'MANCANTE');
    console.log('🔍 DEBUG - Domain:', domain || 'MANCANTE');
    
    if (!apiKey || !domain) {
      throw new Error('Variabili d\'ambiente MAILGUN_API_KEY o MAILGUN_DOMAIN mancanti');
    }

    // Leggi dati dalla richiesta
    const { recipient, subject, htmlContent, qrCodeDataUrl } = JSON.parse(event.body);

    // Inizializza Mailgun
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({
      username: 'api',
      key: apiKey
    });

    // Prepara l'email
    const emailData = {
      from: `Palasciano 2025 <noreply@${domain}>`,
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
