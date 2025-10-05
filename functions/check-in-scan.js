const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { qrData } = JSON.parse(event.body);
        const sql = neon(process.env.NETLIFY_DATABASE_URL);

        // Trova partecipante
        const participants = await sql`
            SELECT * FROM partecipanti 
            WHERE id = ${qrData.id} OR (nome = ${qrData.nome} AND cognome = ${qrData.cognome} AND cf = ${qrData.cf})
            LIMIT 1
        `;

        if (participants.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Partecipante non trovato' 
                })
            };
        }

        const participant = participants[0];
        const today = new Date().toISOString().split('T')[0];

        // Verifica se ha accesso per oggi
        const accessiOggi = await sql`
            SELECT * FROM accessi 
            WHERE id_partecipante = ${participant.id} 
            AND data_accesso_richiesto = ${today}
        `;

        if (accessiOggi.length === 0) {
            // Fuori periodo
            return {
                statusCode: 403,
                body: JSON.stringify({ 
                    success: false, 
                    message: `Accesso negato - Periodo di permanenza: ${participant.arrivo} / ${participant.partenza}`,
                    participant: {
                        nome: participant.nome,
                        cognome: participant.cognome,
                        arrivo: participant.arrivo,
                        partenza: participant.partenza
                    }
                })
            };
        }

        // Registra/aggiorna check-in
        await sql`
            UPDATE accessi 
            SET status = 1, data_checkin = NOW() 
            WHERE id_partecipante = ${participant.id} 
            AND data_accesso_richiesto = ${today}
        `;

        let newStatus = participant.status;
        let needsEmail = false;

        // Logica cambio status
        if (participant.status === 'preiscritto') {
            newStatus = 'checkin';
            await sql`UPDATE partecipanti SET status = 'checkin' WHERE id = ${participant.id}`;
        } else if (participant.status === 'checkin' && participant.accreditamento === 0) {
            newStatus = 'accreditato';
            needsEmail = true;
            await sql`
                UPDATE partecipanti 
                SET status = 'accreditato', accreditamento = 1, data_accreditamento = NOW() 
                WHERE id = ${participant.id}
            `;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true,
                message: accessiOggi[0].status === 1 
                    ? `Check-in aggiornato! ${participant.nome} ${participant.cognome}`
                    : `Check-in completato! ${participant.nome} ${participant.cognome}`,
                participant: {
                    id: participant.id,
                    nome: participant.nome,
                    cognome: participant.cognome,
                    cf: participant.cf,
                    email: participant.email,
                    status: newStatus,
                    accreditamento: newStatus === 'accreditato' ? 1 : participant.accreditamento,
                    needsEmail: needsEmail
                },
                action: participant.status === 'preiscritto' ? 'first_checkin' : 
                        (participant.status === 'checkin' && participant.accreditamento === 0) ? 'accreditamento' : 'checkin_giornaliero'
            })
        };
    } catch (error) {
        console.error('Errore check-in-scan:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};