const FormData = require('form-data');
const QRCode = require('qrcode');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

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
        const { recipient, subject, htmlContent, qrData, emailType } = JSON.parse(event.body);
        
        console.log('📧 Email tipo:', emailType, '| Destinatario:', recipient, '| Ha QR:', !!qrData);
        
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
        
        // Crea FormData
        const form = new FormData();
        form.append('from', fromEmail);
        form.append('to', recipient);
        form.append('subject', subject);
        form.append('html', htmlContent);
        
        // Allega QR Code SOLO per email di registrazione
        if (emailType === 'registration' && qrData) {
            console.log('🔄 Generando QR Code per registrazione...');
            
            try {
                const qrBuffer = await QRCode.toBuffer(JSON.stringify(qrData), {
                    width: 300,
                    margin: 2,
                    errorCorrectionLevel: 'H',
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                console.log('✅ QR Code generato - Size:', qrBuffer.length, 'bytes');
                
                // Aggiungi come allegato scaricabile
                form.append('attachment', qrBuffer, {
                    filename: 'QR-Code-Palasciano-2025.png',
                    contentType: 'image/png'
                });
                
                console.log('✅ QR Code aggiunto come allegato');
            } catch (qrError) {
                console.error('❌ Errore generazione QR:', qrError.message);
            }
        }
        
        // Allega PDF SOLO per email di benvenuto
if (emailType === 'welcome') {
    console.log('📄 Email di benvenuto - scarico PDF dal sito...');
    
    try {
        const pdfUrl = 'https://palasciano-2025-again-edition.netlify.app/Guida-Palasciano-2025.pdf';
        
        const pdfResponse = await fetch(pdfUrl);
        if (pdfResponse.ok) {
            const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
            
            form.append('attachment', pdfBuffer, {
                filename: 'Guida-Palasciano-2025.pdf',
                contentType: 'application/pdf'
            });
            console.log('✅ PDF allegato dal sito - Size:', pdfBuffer.length, 'bytes');
        } else {
            console.warn('⚠️ PDF non scaricabile, HTTP status:', pdfResponse.status);
        }
    } catch (pdfError) {
        console.error('❌ Errore download PDF:', pdfError.message);
    }
}
        
        // Invia con fetch
        console.log('📤 Invio email via Mailgun...');
        
        const response = await fetch(mailgunUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`api:${apiKey}`).toString('base64'),
                ...form.getHeaders()
            },
            body: form
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ Email inviata con successo! ID:', result.id);
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
        console.error('❌ Errore send-email:', error.message, error.stack);
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