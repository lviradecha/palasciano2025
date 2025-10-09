// netlify/functions/send-credentials-email.js
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

        const mailgun = new Mailgun(formData);
        const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY,
  url: 'https://api.eu.mailgun.net' // <-- ✅ commento ok dopo virgola
});


        const ruoloNome = {
            'ADMIN': 'Amministratore',
            'STAFF_CHECKIN': 'Staff Check-in',
            'STAFF_ACCREDITAMENTO': 'Staff Accreditamento'
        };

        const subject = isReset 
            ? '🔐 Reset Password - Palasciano Red Cross Camp Napoli 2025'
            : '🎉 Benvenuto nello Staff - Palasciano Red Cross Camp Napoli 2025';

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px; margin: 0;">
    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 40px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🏥 Palasciano Red Cross Camp Napoli 2025</h1>
            <p style="color: #e0e7ff; margin: 10px 0 0; font-size: 16px;">Sistema Gestione Evento</p>
        </div>

        <!-- Body -->
        <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin: 0 0 20px; font-size: 24px;">
                ${isReset ? '🔐 Reset Password' : '🎉 Benvenuto nello Staff!'}
            </h2>
            
            <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px; font-size: 16px;">
                Ciao <strong>${user.nome} ${user.cognome}</strong>,
            </p>
            
            <p style="color: #4b5563; line-height: 1.6; margin: 0 0 30px; font-size: 16px;">
                ${isReset 
                    ? 'La tua password è stata reimpostata. Ecco le tue nuove credenziali di accesso:' 
                    : 'Sei stato aggiunto come membro dello staff per il Campo di Formazione Palasciano 2025. Ecco le tue credenziali di accesso:'}
            </p>

            <!-- Credenziali Box -->
            <div style="background: #f9fafb; border: 2px solid #4f46e5; border-radius: 8px; padding: 25px; margin: 0 0 30px;">
                <div style="margin-bottom: 15px;">
                    <p style="margin: 0 0 5px; color: #6b7280; font-size: 14px; font-weight: 600;">USERNAME</p>
                    <p style="margin: 0; color: #1f2937; font-size: 18px; font-weight: bold; font-family: 'Courier New', monospace;">${credentials.username}</p>
                </div>
                <div>
                    <p style="margin: 0 0 5px; color: #6b7280; font-size: 14px; font-weight: 600;">PASSWORD</p>
                    <p style="margin: 0; color: #1f2937; font-size: 18px; font-weight: bold; font-family: 'Courier New', monospace;">${credentials.password}</p>
                </div>
            </div>

            <!-- Ruolo -->
            <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 0 0 30px; border-radius: 4px;">
                <p style="margin: 0; color: #1e40af; font-size: 14px;">
                    <strong>Il tuo ruolo:</strong> ${ruoloNome[user.ruolo]}
                </p>
            </div>

            <!-- Istruzioni -->
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 0 0 30px; border-radius: 4px;">
                <p style="margin: 0 0 10px; color: #92400e; font-size: 14px; font-weight: bold;">⚠️ IMPORTANTE:</p>
                <ul style="margin: 0; padding-left: 20px; color: #92400e; font-size: 14px;">
                    <li style="margin-bottom: 5px;">Al primo accesso ti verrà chiesto di cambiare la password</li>
                    <li style="margin-bottom: 5px;">Conserva queste credenziali in un luogo sicuro</li>
                    <li>Non condividere la password con nessuno</li>
                </ul>
            </div>

            <!-- Link Accesso -->
            <div style="text-align: center; margin: 0 0 30px;">
                <a href="${process.env.SITE_URL || 'https://palasciano2025.netlify.app'}" 
                   style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    🔗 Accedi al Sistema
                </a>
            </div>

            <!-- Permessi -->
            <div style="background: #f9fafb; padding: 20px; border-radius: 8px;">
                <h3 style="margin: 0 0 15px; color: #1f2937; font-size: 16px;">📋 Le tue autorizzazioni:</h3>
                <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.8;">
                    ${user.ruolo === 'ADMIN' ? `
                        <li>✅ Accesso completo al sistema</li>
                        <li>✅ Gestione partecipanti</li>
                        <li>✅ Check-in e accreditamento</li>
                        <li>✅ Invio email e export dati</li>
                        <li>✅ Gestione utenti staff</li>
                        <li>✅ Visualizzazione audit log</li>
                    ` : user.ruolo === 'STAFF_CHECKIN' ? `
                        <li>✅ Scansione QR per check-in</li>
                        <li>✅ Stampa badge</li>
                        <li>✅ Visualizzazione lista partecipanti</li>
                        <li>❌ Accreditamento e modifiche</li>
                        <li>❌ Export dati</li>
                    ` : `
                        <li>✅ Check-in e accreditamento</li>
                        <li>✅ Modifica dati partecipanti</li>
                        <li>✅ Stampa badge e report</li>
                        <li>✅ Export CSV</li>
                        <li>❌ Gestione utenti staff</li>
                    `}
                </ul>
            </div>

            <p style="color: #4b5563; margin: 30px 0 0; font-size: 14px; line-height: 1.6;">
                Per qualsiasi problema di accesso, contatta l'amministratore del sistema.
            </p>

            <p style="color: #4b5563; margin: 20px 0 0; font-size: 16px;">
                <strong>Buon lavoro!</strong><br>
                <span style="color: #4f46e5; font-weight: 600;">Lo Staff Palasciano 2025</span>
            </p>
        </div>

        <!-- Footer -->
        <div style="background: #f9fafb; padding: 30px 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; margin: 0; font-size: 14px;">Croce Rossa Italiana - Campo Palasciano 2025</p>
            <p style="color: #9ca3af; margin: 5px 0 0; font-size: 12px;">Questa è una email automatica, non rispondere a questo messaggio</p>
        </div>
    </div>
</body>
</html>
        `;

        const result = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
            from: `Palasciano 2025 Staff <noreply@${process.env.MAILGUN_DOMAIN}>`,
            to: [user.email],
            subject: subject,
            html: htmlContent
        });

        console.log('✅ Email credenziali inviata:', result);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                messageId: result.id,
                message: 'Email inviata con successo'
            })
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