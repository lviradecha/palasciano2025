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
        // ✅ PARSING SICURO
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

        // ✅ Supporta sia oggetto che stringa semplice
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
        let needsEmail = false;

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

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Check-in completato!',
                    action: action,
                    participant: participant
                })
            };
        }

        // === STATUS: 'checkin' ===
        else if (participant.status === 'checkin') {
            if (participant.accreditamento === 0) {
                await sql`
                    UPDATE partecipanti 
                    SET status = 'accreditato',
                        accreditamento = 1,
                        data_accreditamento = NOW()
                    WHERE id = ${participant.id}
                `;
                needsEmail = true;
                action = 'accreditamento';

                if (staffUser) {
                    await sql`
                        INSERT INTO audit_log (
                            user_id, username, nome_completo, azione, dettagli, ip_address
                        ) VALUES (
                            ${staffUser.id},
                            ${staffUser.username || 'unknown'},
                            ${(staffUser.nome || 'Unknown') + ' ' + (staffUser.cognome || 'User')},
                            'ACCREDITAMENTO',
                            ${JSON.stringify({
                                id_partecipante: participant.id,
                                partecipante_nome: `${participant.nome} ${participant.cognome}`
                            })},
                            ${event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown'}
                        )
                    `;
                }
            } else {
                // Check-in giornaliero
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
            }

            if (staffUser) {
                await sql`
                    INSERT INTO audit_log (
                        user_id, username, nome_completo, azione, dettagli, ip_address
                    ) VALUES (
                        ${staffUser.id},
                        ${staffUser.username || 'unknown'},
                        ${(staffUser.nome || 'Unknown') + ' ' + (staffUser.cognome || 'User')},
                        ${action === 'accreditamento' ? 'ACCREDITAMENTO' : 'CHECKIN_DAILY'},
                        ${JSON.stringify({
                            id_partecipante: participant.id,
                            partecipante_nome: `${participant.nome} ${participant.cognome}`,
                            data: oggi
                        })},
                        ${event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown'}
                    )
                `;
            }

            const updated = await sql`SELECT * FROM partecipanti WHERE id = ${participant.id}`;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: action === 'accreditamento' ? 'Accreditato con successo!' : 'Check-in giornaliero completato!',
                    action,
                    participant: {
                        ...updated[0],
                        needsEmail
                    }
                })
            };
        }

        // === STATUS: 'accreditato' ===
        else if (participant.status === 'accreditato') {
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

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Check-in giornaliero completato!',
                    action: 'daily_checkin',
                    participant
                })
            };
        }

        // === STATUS sconosciuto ===
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
