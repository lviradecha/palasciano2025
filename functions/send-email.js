const FormData = require('form-data');
const QRCode = require('qrcode');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const { recipient, subject, htmlContent, qrData } = JSON.parse(event.body);

        if (!recipient || !subject || !htmlContent) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Dati mancanti' })
            };
        }

        const apiKey = process.env.MAILGUN_API_KEY;
        const domain = process.env.MAILGUN_DOMAIN;
        const fromEmail = process.env.MAILGUN_FROM_EMAIL || `Palasciano 2025 <noreply@${domain}>`;

        if (!apiKey || !domain) {
            throw new Error('Configurazione Mailgun mancante');
        }

        const mailgunUrl = `https://api.eu.mailgun.net/v3/${domain}/messages`;

        // ✅ Genera QR Code come buffer per l'allegato
        let qrBuffer = null;
        if (qrData) {
            qrBuffer = await QRCode.toBuffer(JSON.stringify(qrData), {
                width: 300,
                margin: 2,
                errorCorrectionLevel: 'H',
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
        }

        // ✅ Crea FormData con allegato
        const form = new FormData();
        form.append('from', fromEmail);
        form.append('to', recipient);
        form.append('subject', subject);
        form.append('html', htmlContent);

        // ✅ Aggiungi QR Code come allegato se presente
        if (qrBuffer) {
            form.append('attachment', qrBuffer, {
                filename: 'QR-Code-Palasciano2025.png',
                contentType: 'image/png'
            });
        }

        // ✅ Invia email con Mailgun
        const response = await fetch(mailgunUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from('api:' + apiKey).toString('base64'),
                ...form.getHeaders()
            },
            body: form
        });

        const result = await response.json();

        if (response.ok) {
            console.log('✅ Email inviata con successo:', result.id);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    messageId: result.id,
                    message: 'Email inviata con successo'
                })
            };
        } else {
            console.error('❌ Errore Mailgun:', result);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: result.message || 'Errore invio email'
                })
            };
        }
    } catch (error) {
        console.error('❌ Errore send-email:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};