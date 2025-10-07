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
        let message = '';

        // Logica cambio status
        if (participant.status === 'preiscritto') {
            // Prima volta: preiscritto → checkin
            newStatus = 'checkin';
            message = `Check-in completato! ${participant.nome} ${participant.cognome}`;
            await sql`UPDATE partecipanti SET status = 'checkin' WHERE id = ${participant.id}`;
            
        } else if (participant.status === 'checkin' && participant.accreditamento === 0) {
            // Seconda scansione: checkin → accreditato
            newStatus = 'accreditato';
            needsEmail = true;
            message = `Accreditamento completato! ${participant.nome} ${participant.cognome}`;
            await sql`
                UPDATE partecipanti 
                SET status = 'accreditato', accreditamento = 1, data_accreditamento = NOW() 
                WHERE id = ${participant.id}
            `;
            
        } else if (participant.status === 'checkout') {
            // Rientro dopo checkout: checkout → accreditato
            newStatus = 'accreditato';
            message = `Rientro registrato! ${participant.nome} ${participant.cognome}`;
            await sql`UPDATE partecipanti SET status = 'accreditato' WHERE id = ${participant.id}`;
            
        } else if (participant.status === 'accreditato') {
            // Già accreditato, solo check-in giornaliero
            message = accessiOggi[0].status === 1 
                ? `Check-in giornaliero aggiornato! ${participant.nome} ${participant.cognome}`
                : `Check-in giornaliero completato! ${participant.nome} ${participant.cognome}`;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true,
                message: message,
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
                        (participant.status === 'checkin' && participant.accreditamento === 0) ? 'accreditamento' : 
                        participant.status === 'checkout' ? 'rientro' : 'checkin_giornaliero'
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