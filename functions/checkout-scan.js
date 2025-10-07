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
            WHERE id = ${qrData.id}
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

        // Controlla che sia accreditato
        if (participant.status !== 'accreditato') {
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    success: false, 
                    message: `Non può fare check-out. Status attuale: ${participant.status}` 
                })
            };
        }

        // Aggiorna status a checkout
        await sql`
            UPDATE partecipanti 
            SET status = 'checkout', data_checkout = NOW() 
            WHERE id = ${participant.id}
        `;

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: `Check-out completato per ${participant.nome} ${participant.cognome}`
            })
        };

    } catch (error) {
        console.error('Errore checkout-scan:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};