const { neon } = require('@neondatabase/serverless');

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
            body: JSON.stringify({ error: 'Method not allowed' }) 
        };
    }

    try {
        const { qrData, staffUser } = JSON.parse(event.body);
        const sql = neon(process.env.NETLIFY_DATABASE_URL);
        
        await sql`SET TIME ZONE 'Europe/Rome'`;

        const participants = await sql`
            SELECT * FROM partecipanti 
            WHERE id = ${qrData.id}
            LIMIT 1
        `;

        if (participants.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Partecipante non trovato' 
                })
            };
        }

        const participant = participants[0];

        if (participant.status !== 'accreditato') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: `Non può fare check-out. Status attuale: ${participant.status}` 
                })
            };
        }

        const oggi = new Date().toISOString().split('T')[0];

        // ✅ AGGIORNA ACCESSO DI OGGI
        const accessiOggi = await sql`
            SELECT * FROM accessi 
            WHERE id_partecipante = ${participant.id} 
            AND data_accesso_richiesto = ${oggi}
        `;

        if (accessiOggi.length > 0) {
            await sql`
                UPDATE accessi 
                SET status = 0, data_checkout = NOW()
                WHERE id = ${accessiOggi[0].id}
            `;
        }

        await sql`
            UPDATE partecipanti 
            SET status = 'checkout', data_checkout = NOW() 
            WHERE id = ${participant.id}
        `;

        if (staffUser) {
            await sql`
                INSERT INTO audit_log (
                    user_id, 
                    username,
                    nome_completo,
                    azione, 
                    dettagli, 
                    ip_address
                ) VALUES (
                    ${staffUser.id},
                    ${staffUser.username || 'unknown'},
                    ${(staffUser.nome || 'Unknown') + ' ' + (staffUser.cognome || 'User')},
                    'CHECKOUT',
                    ${JSON.stringify({
                        id_partecipante: participant.id,
                        partecipante_nome: `${participant.nome} ${participant.cognome}`,
                        data: oggi
                    })},
                    ${event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown'}
                )
            `;
        }

        // ✅ Ricarica partecipante con accessi aggiornati
        const updated = await sql`
            SELECT 
                p.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'data', a.data_accesso_richiesto,
                            'status', a.status,
                            'dataCheckin', a.data_checkin,
                            'dataCheckout', a.data_checkout
                        ) ORDER BY a.data_accesso_richiesto DESC
                    ) FILTER (WHERE a.id IS NOT NULL),
                    '[]'::json
                ) as accessi
            FROM partecipanti p
            LEFT JOIN accessi a ON a.id_partecipante = p.id
            WHERE p.id = ${participant.id}
            GROUP BY p.id
        `;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: `👋 Check-out completato per ${participant.nome} ${participant.cognome}`,
                participant: updated[0]
            })
        };

    } catch (error) {
        console.error('❌ Errore checkout-scan:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};