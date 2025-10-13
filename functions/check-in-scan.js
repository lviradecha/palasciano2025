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
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (parseError) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Corpo della richiesta non valido (JSON)' })
            };
        }

        const { qrData, staffUser } = body;
        const id = typeof qrData === 'object' ? qrData?.id : qrData;

        if (!id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'ID partecipante mancante' })
            };
        }

        const sql = neon(process.env.NETLIFY_DATABASE_URL);
        await sql`SET TIME ZONE 'Europe/Rome'`;

        const participants = await sql`
            SELECT * FROM partecipanti WHERE id = ${id}
        `;

        if (participants.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ success: false, message: 'Partecipante non trovato' })
            };
        }

        const participant = participants[0];
        const oggi = new Date().toISOString().split('T')[0];

        const accessiOggi = await sql`
            SELECT * FROM accessi 
            WHERE id_partecipante = ${participant.id} 
            AND data_accesso_richiesto = ${oggi}
        `;

        let action = '';

        // === STATUS: 'preiscritto' ===
        if (participant.status === 'preiscritto') {
            if (accessiOggi.length === 0) {
                await sql`
                    INSERT INTO accessi (
                        id_partecipante, 
                        data_accesso_richiesto, 
                        status, 
                        data_checkin
                    ) VALUES (
                        ${participant.id}, 
                        ${oggi}, 
                        1, 
                        NOW()
                    )
                `;
                action = 'first_checkin';
            }

            await sql`
                UPDATE partecipanti 
                SET status = 'checkin',
                    accreditamento = 0
                WHERE id = ${participant.id}
            `;

            if (staffUser) {
                await sql`
                    INSERT INTO audit_log (
                        user_id, username, nome_completo, azione, dettagli, ip_address
                    ) VALUES (
                        ${staffUser.id},
                        ${staffUser.username || 'unknown'},
                        ${(staffUser.nome || 'Unknown') + ' ' + (staffUser.cognome || 'User')},
                        'CHECKIN_FIRST',
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
                    message: '✅ Check-in completato!',
                    action: action,
                    participant: updated[0]
                })
            };
        }

        // === STATUS: 'checkin' o 'accreditato' ===
        else if (participant.status === 'checkin' || participant.status === 'accreditato') {
            if (accessiOggi.length === 0) {
                await sql`
                    INSERT INTO accessi (
                        id_partecipante, data_accesso_richiesto, status, data_checkin
                    ) VALUES (
                        ${participant.id}, ${oggi}, 1, NOW()
                    )
                `;
            } else {
                await sql`
                    UPDATE accessi 
                    SET status = 1, data_checkin = NOW()
                    WHERE id = ${accessiOggi[0].id}
                `;
            }

            action = 'daily_checkin';

            if (staffUser) {
                await sql`
                    INSERT INTO audit_log (
                        user_id, username, nome_completo, azione, dettagli, ip_address
                    ) VALUES (
                        ${staffUser.id},
                        ${staffUser.username || 'unknown'},
                        ${(staffUser.nome || 'Unknown') + ' ' + (staffUser.cognome || 'User')},
                        'CHECKIN_DAILY',
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
                    message: '✅ Check-in giornaliero completato!',
                    action: action,
                    participant: updated[0]
                })
            };
        }

        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Status non valido per check-in'
            })
        };

    } catch (error) {
        console.error('❌ Errore nel check-in:', error);
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