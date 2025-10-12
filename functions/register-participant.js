const { neon } = require('@neondatabase/serverless');
const formData = require('form-data');
const Mailgun = require('mailgun.js');
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
        const data = JSON.parse(event.body);
        const sql = neon(process.env.NETLIFY_DATABASE_URL);

        // ✅ IMPOSTA TIMEZONE ITALIANA
        await sql`SET TIME ZONE 'Europe/Rome'`;

        console.log('📝 Inizio registrazione per:', data.email);

        // 1️⃣ SALVA PARTECIPANTE NEL DATABASE
        const result = await sql`
            INSERT INTO partecipanti (
                nome, cognome, cf, tel, email, tipo_partecipazione,
                comitato, regione, arrivo, partenza, viaggio, targa, veicolo,
                status, accreditamento, email_sent
            ) VALUES (
                ${data.nome}, ${data.cognome}, ${data.cf}, ${data.tel}, 
                ${data.email}, ${data.tipoPartecipazione || null},
                ${data.comitato}, ${data.regione}, ${data.arrivo}, ${data.partenza},
                ${data.viaggio}, ${data.targa || null}, ${data.veicolo || null},
                'preiscritto', 0, false
            ) RETURNING id
        `;

        const participantId = result[0].id;
        console.log('✅ Partecipante salvato con ID:', participantId);

        // 2️⃣ CREA RIGHE NELLA TABELLA ACCESSI
        const arrivo = new Date(data.arrivo);
        const partenza = new Date(data.partenza);
        
        const accessiPromises = [];
        for (let d = new Date(arrivo); d <= partenza; d.setDate(d.getDate() + 1)) {
            const dataAccesso = new Date(d).toISOString().split('T')[0];
            accessiPromises.push(
                sql`INSERT INTO accessi (id_partecipante, data_accesso_richiesto, status) 
                    VALUES (${participantId}, ${dataAccesso}, 0)`
            );
        }
        
        await Promise.all(accessiPromises);
        console.log('✅ Accessi creati');

        // 3️⃣ INVIA EMAIL CON QR CODE
        try {
            console.log('📧 Inizio invio email a:', data.email);

            // Genera QR Code
            const qrCodeDataUrl = await QRCode.toDataURL(
                JSON.stringify({ 
                    id: participantId, 
                    nome: data.nome, 
                    cognome: data.cognome, 
                    cf: data.cf 
                }),
                { 
                    errorCorrectionLevel: 'H', 
                    type: 'image/png', 
                    width: 300,
                    margin: 1,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                }
            );

            // Configura Mailgun
            const mailgun = new Mailgun(formData);
            const mg = mailgun.client({
                username: 'api',
                key: process.env.MAILGUN_API_KEY,
                url: 'https://api.eu.mailgun.net'
            });

            // Template email
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
            <p style="color:#e0e7ff;margin:10px 0 0;">Campo di Formazione CRI 2025</p>
        </div>
        <div style="padding:40px 30px;">
            <h2 style="color:#1f2937;margin:0 0 20px;">Ciao ${data.nome}!</h2>
            <p style="color:#4b5563;line-height:1.6;margin:0 0 20px;">
                Siamo felici di confermare la tua preiscrizione al Campo di Formazione Palasciano Red Cross Camp Napoli 2025.
            </p>
            <div style="text-align:center;margin:30px 0;">
                <p style="color:#4b5563;margin:0 0 15px;font-weight:600;">Il Tuo QR Code Personale</p>
                <img src="${qrCodeDataUrl}" alt="QR Code" style="width:250px;height:250px;border:3px solid #4f46e5;border-radius:12px;"/>
                <p style="color:#6b7280;margin:15px 0 0;font-size:13px;">Presenta questo QR Code durante il check-in</p>
            </div>
            <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;">
                <p style="margin:0 0 10px;color:#6b7280;font-size:14px;"><strong>Nome:</strong> ${data.nome} ${data.cognome}</p>
                <p style="margin:0 0 10px;color:#6b7280;font-size:14px;"><strong>CF:</strong> ${data.cf}</p>
                <p style="margin:0 0 10px;color:#6b7280;font-size:14px;"><strong>Tipo:</strong> ${data.tipoPartecipazione || 'Non specificato'}</p>
                <p style="margin:0 0 10px;color:#6b7280;font-size:14px;"><strong>Comitato:</strong> ${data.comitato}</p>
                <p style="margin:0 0 10px;color:#6b7280;font-size:14px;"><strong>Regione:</strong> ${data.regione}</p>
                <p style="margin:0;color:#6b7280;font-size:14px;"><strong>Periodo:</strong> ${data.arrivo} / ${data.partenza}</p>
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

            // Genera QR Code come buffer per allegato
const qrBuffer = await QRCode.toBuffer(
    JSON.stringify({ 
        id: participantId, 
        nome: data.nome, 
        cognome: data.cognome, 
        cf: data.cf 
    }),
    { 
        errorCorrectionLevel: 'H', 
        width: 300,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    }
);

// Invia email con allegato
const emailResult = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
    from: `Palasciano 2025 <noreply@${process.env.MAILGUN_DOMAIN}>`,
    to: [data.email],
    subject: '✅ Conferma Pre-Accreditamento - Palasciano Red Cross Camp Napoli',
    html: htmlContent,
    attachment: {
        data: qrBuffer,
        filename: 'QR-Code-Palasciano-2025.png',
        contentType: 'image/png'
    }
});

            console.log('✅ Email inviata con successo:', emailResult.id);

            // Aggiorna flag email_sent
            await sql`UPDATE partecipanti SET email_sent = true WHERE id = ${participantId}`;
            console.log('✅ Flag email_sent aggiornato');

        } catch (emailError) {
            console.error('❌ Errore invio email (ma partecipante salvato):', emailError);
            // Non fa fallire la registrazione se l'email fallisce
        }

        // ✅ RISPONDE CON SUCCESSO
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                id: participantId,
                message: 'Registrazione completata! Riceverai l\'email con il QR Code a breve.'
            })
        };

    } catch (error) {
        console.error('❌ Errore registrazione:', error);
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