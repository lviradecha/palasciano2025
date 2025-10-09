const { sql } = require('@neondatabase/serverless');

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
        const { qrData, staffUser } = JSON.parse(event.body);

        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        // Recupera partecipante tramite QR data
        const [participant] = await sql`
            SELECT * FROM partecipanti WHERE qrcode_data = ${qrData}
        `;

        if (!participant) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ success: false, message: 'Partecipante non trovato' })
            };
        }

        let action = null;
        let message = '';
        let needsEmail = false;

        // 1️⃣ PRIMO CHECK-IN (da preiscritto → checkin)
        if (participant.status === 'preiscritto') {
            await sql`
                UPDATE partecipanti SET status = 'checkin' 
                WHERE id = ${participant.id}
            `;

            await sql`
                INSERT INTO accessi (id_partecipante, data_accesso_richiesto, status, data_checkin)
                VALUES (${participant.id}, ${today}, 1, NOW())
                ON CONFLICT (id_partecipante, data_accesso_richiesto) 
                DO UPDATE SET status = 1, data_checkin = NOW()
            `;

            // Audit log
            if (staffUser) {
                await sql`
                    INSERT INTO audit_log (
                        user_id, username, nome_completo, azione, 
                        entita, entita_id, dettagli, ip_address
                    ) VALUES (
                        ${staffUser.id},
                        ${staffUser.username},
                        ${staffUser.nome} || ' ' || ${staffUser.cognome},
                        'CHECKIN_FIRST',
                        'participant',
                        ${participant.id},
                        ${JSON.stringify({
                            participant_nome: participant.nome,
                            participant_cognome: participant.cognome,
                            participant_cf: participant.cf,
                            old_status: 'preiscritto',
                            new_status: 'checkin'
                        })},
                        ${event.headers['x-forwarded-for'] || 'unknown'}
                    )
                `;
            }

            action = 'first_checkin';
            message = `✅ Check-in completato! ${participant.nome} ${participant.cognome}`;
        }

        // 2️⃣ ACCREDITAMENTO (da checkin → accreditato)
        else if (participant.status === 'checkin' && participant.accreditamento === 0) {
            await sql`
                UPDATE partecipanti 
                SET status = 'accreditato', accreditamento = 1, data_accreditamento = NOW() 
                WHERE id = ${participant.id}
            `;

            // Audit log
            if (staffUser) {
                await sql`
                    INSERT INTO audit_log (
                        user_id, username, nome_completo, azione, 
                        entita, entita_id, dettagli, ip_address
                    ) VALUES (
                        ${staffUser.id},
                        ${staffUser.username},
                        ${staffUser.nome} || ' ' || ${staffUser.cognome},
                        'ACCREDITAMENTO',
                        'participant',
                        ${participant.id},
                        ${JSON.stringify({
                            participant_nome: participant.nome,
                            participant_cognome: participant.cognome,
                            participant_cf: participant.cf,
                            old_status: 'checkin',
                            new_status: 'accreditato'
                        })},
                        ${event.headers['x-forwarded-for'] || 'unknown'}
                    )
                `;
            }

            action = 'accreditamento';
            needsEmail = true;
            message = `🎉 Accreditamento completato! ${participant.nome} ${participant.cognome}`;
        }

        // 3️⃣ CHECK-IN GIORNALIERO
        else if (participant.status === 'accreditato') {
            await sql`
                INSERT INTO accessi (id_partecipante, data_accesso_richiesto, status, data_checkin)
                VALUES (${participant.id}, ${today}, 1, NOW())
                ON CONFLICT (id_partecipante, data_accesso_richiesto) 
                DO UPDATE SET status = 1, data_checkin = NOW()
            `;

            // Audit log
            if (staffUser) {
                await sql`
                    INSERT INTO audit_log (
                        user_id, username, nome_completo, azione, 
                        entita, entita_id, dettagli, ip_address
                    ) VALUES (
                        ${staffUser.id},
                        ${staffUser.username},
                        ${staffUser.nome} || ' ' || ${staffUser.cognome},
                        'CHECKIN_DAILY',
                        'participant',
                        ${participant.id},
                        ${JSON.stringify({
                            participant_nome: participant.nome,
                            participant_cognome: participant.cognome,
                            data: today
                        })},
                        ${event.headers['x-forwarded-for'] || 'unknown'}
                    )
                `;
            }

            action = 'checkin_giornaliero';
            message = `✅ Check-in giornaliero registrato! ${participant.nome} ${participant.cognome}`;
        }

        // Nessuna azione possibile
        else {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: false, message: '⚠️ Nessuna azione eseguita' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                action,
                message,
                participant,
                needsEmail
            })
        };

    } catch (error) {
        console.error('❌ Errore nel check-in:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};
