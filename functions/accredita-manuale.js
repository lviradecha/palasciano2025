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
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const { participantId, staffUser } = JSON.parse(event.body);

        if (!participantId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'ID partecipante mancante' })
            };
        }

        const sql = neon(process.env.NETLIFY_DATABASE_URL);
        await sql`SET TIME ZONE 'Europe/Rome'`;

        const participants = await sql`
            SELECT * FROM partecipanti WHERE id = ${participantId}
        `;

        if (participants.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ success: false, message: 'Partecipante non trovato' })
            };
        }

        const participant = participants[0];

        if (participant.status !== 'checkin') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: `Impossibile accreditare. Status attuale: ${participant.status}` 
                })
            };
        }

        const oggi = new Date().toISOString().split('T')[0];

        // ✅ VERIFICA/CREA ACCESSO DI OGGI
        const accessiOggi = await sql`
            SELECT * FROM accessi 
            WHERE id_partecipante = ${participantId} 
            AND data_accesso_richiesto = ${oggi}
        `;

        if (accessiOggi.length === 0) {
            await sql`
                INSERT INTO accessi (
                    id_partecipante, 
                    data_accesso_richiesto, 
                    status, 
                    data_checkin
                ) VALUES (
                    ${participantId}, 
                    ${oggi}, 
                    1, 
                    NOW()
                )
            `;
        } else {
            await sql`
                UPDATE accessi 
                SET status = 1, data_checkin = NOW()
                WHERE id = ${accessiOggi[0].id}
            `;
        }

        // ✅ ACCREDITA
        await sql`
            UPDATE partecipanti 
            SET status = 'accreditato',
                accreditamento = 1,
                data_accreditamento = NOW()
            WHERE id = ${participantId}
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
                    'ACCREDITAMENTO',
                    ${JSON.stringify({
                        id_partecipante: participantId,
                        partecipante_nome: `${participant.nome} ${participant.cognome}`,
                        metodo: 'manuale',
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
            WHERE p.id = ${participantId}
            GROUP BY p.id
        `;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: '🎉 Accreditamento completato!',
                participant: {
                    ...updated[0],
                    needsEmail: true
                }
            })
        };

    } catch (error) {
        console.error('❌ Errore accreditamento manuale:', error);
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