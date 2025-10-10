const formData = require('form-data');
const Mailgun = require('mailgun.js');

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
        const { user, credentials, isReset } = JSON.parse(event.body);

        if (!user || !credentials) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Dati mancanti' })
            };
        }

        const mailgun = new Mailgun(formData);
        const mg = mailgun.client({
            username: 'api',
            key: process.env.MAILGUN_API_KEY,
            url: 'https://api.eu.mailgun.net'
        });

        const subject = isReset 
            ? '🔑 Password Reimpostata - Palasciano Red Cross Camp Napoli'
            : '👋 Benvenuto - Credenziali Accesso Staff';

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
</head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:40px 20px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:28px;">Palasciano Red Cross Camp Napoli</h1>
            <p style="color:#e0e7ff;margin:10px 0 0;">Staff Management System</p>
        </div>
        <div style="padding:40px 30px;">
            <h2 style="color:#1f2937;margin:0 0 20px;">Ciao ${user.nome}!</h2>
            <p style="color:#4b5563;line-height:1.6;margin:0 0 20px;">
                ${isReset 
                    ? 'La tua password è stata reimpostata. Di seguito trovi le nuove credenziali di accesso.' 
                    : 'Benvenuto nel team dello Staff! Di seguito trovi le tue credenziali di accesso al sistema.'}
            </p>
            <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;border:2px solid #4f46e5;">
                <p style="margin:0 0 10px;color:#6b7280;font-size:14px;"><strong>Username:</strong></p>
                <p style="margin:0 0 20px;color:#1f2937;font-size:18px;font-family:monospace;"><strong>${credentials.username}</strong></p>
                <p style="margin:0 0 10px;color:#6b7280;font-size:14px;"><strong>Password:</strong></p>
                <p style="margin:0;color:#1f2937;font-size:18px;font-family:monospace;"><strong>${credentials.password}</strong></p>
            </div>
            <div style="background:#fef3c7;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #f59e0b;">
                <p style="margin:0;color:#92400e;font-size:14px;">
                    ⚠️ <strong>Importante:</strong> Al primo accesso ti verrà chiesto di cambiare la password per motivi di sicurezza.
                </p>
            </div>
            <p style="color:#4b5563;margin:20px 0 0;">
                <strong>Un caro saluto,</strong><br>
                <span style="color:#4f46e5;font-weight:600;">Lo Staff Palasciano Red Cross Camp Napoli</span>
            </p>
        </div>
        <div style="background:#f9fafb;padding:30px 20px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#6b7280;margin:0;font-size:14px;">Croce Rossa Italiana</p>
        </div>
    </div>
</body>
</html>
        `;

        await mg.messages.create(process.env.MAILGUN_DOMAIN, {
            from: `Palasciano 2025 Staff <noreply@${process.env.MAILGUN_DOMAIN}>`,
            to: [user.email],
            subject: subject,
            html: htmlContent
        });

        console.log('✅ Email credenziali inviata a:', user.email);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Email inviata' })
        };

    } catch (error) {
        console.error('❌ Errore invio email credenziali:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};