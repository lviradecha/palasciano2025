// netlify/functions/manage-users.js
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');

// Funzione per generare password casuale
function generatePassword(length = 12) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const sql = neon(process.env.NETLIFY_DATABASE_URL);
        const { action, adminUserId, ...data } = JSON.parse(event.body);

        // Verifica che chi fa la richiesta sia ADMIN
        const [admin] = await sql`
            SELECT * FROM staff_users WHERE id = ${adminUserId} AND ruolo = 'ADMIN' AND attivo = true
        `;

        if (!admin) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ success: false, error: 'Accesso negato. Solo ADMIN può gestire utenti.' })
            };
        }

        // ==================== LISTA UTENTI ====================
        if (action === 'list') {
            const users = await sql`
                SELECT 
                    id, username, nome, cognome, email, ruolo, 
                    attivo, primo_accesso, data_creazione, data_ultimo_accesso, note
                FROM staff_users 
                ORDER BY ruolo, cognome, nome
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, users })
            };
        }

        // ==================== CREA UTENTE ====================
        if (action === 'create') {
            const { username, nome, cognome, email, ruolo, note } = data;

            // Validazioni
            if (!username || !nome || !cognome || !email || !ruolo) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Dati mancanti' })
                };
            }

            if (!['ADMIN', 'STAFF_CHECKIN', 'STAFF_ACCREDITAMENTO'].includes(ruolo)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Ruolo non valido' })
                };
            }

            // Verifica username/email univoci
            const existing = await sql`
                SELECT id FROM staff_users 
                WHERE username = ${username} OR email = ${email}
            `;

            if (existing.length > 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Username o email già esistenti' })
                };
            }

            // Genera password casuale
            const plainPassword = generatePassword();
            const passwordHash = await bcrypt.hash(plainPassword, 10);

            // Crea utente
            const [newUser] = await sql`
                INSERT INTO staff_users (
                    username, password_hash, nome, cognome, email, ruolo, 
                    attivo, primo_accesso, creato_da, note
                ) VALUES (
                    ${username}, ${passwordHash}, ${nome}, ${cognome}, ${email}, ${ruolo},
                    true, true, ${adminUserId}, ${note || null}
                )
                RETURNING id, username, nome, cognome, email, ruolo
            `;

            // Log audit
            await sql`
                INSERT INTO audit_log (user_id, username, nome_completo, azione, entita, entita_id, dettagli)
                VALUES (
                    ${adminUserId}, ${admin.username}, ${admin.nome} || ' ' || ${admin.cognome},
                    'CREATE_USER', 'staff_user', ${newUser.id},
                    ${JSON.stringify({ username: newUser.username, ruolo: newUser.ruolo })}
                )
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    user: newUser,
                    credentials: {
                        username: username,
                        password: plainPassword
                    },
                    message: 'Utente creato con successo'
                })
            };
        }

        // ==================== MODIFICA UTENTE ====================
        if (action === 'update') {
            const { userId, nome, cognome, email, ruolo, attivo, note } = data;

            if (!userId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, error: 'User ID mancante' })
                };
            }

            await sql`
                UPDATE staff_users SET
                    nome = ${nome},
                    cognome = ${cognome},
                    email = ${email},
                    ruolo = ${ruolo},
                    attivo = ${attivo},
                    note = ${note || null}
                WHERE id = ${userId}
            `;

            // Log audit
            await sql`
                INSERT INTO audit_log (user_id, username, nome_completo, azione, entita, entita_id, dettagli)
                VALUES (
                    ${adminUserId}, ${admin.username}, ${admin.nome} || ' ' || ${admin.cognome},
                    'UPDATE_USER', 'staff_user', ${userId},
                    ${JSON.stringify({ ruolo, attivo })}
                )
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Utente aggiornato' })
            };
        }

        // ==================== RESET PASSWORD ====================
        if (action === 'reset_password') {
            const { userId } = data;

            const newPassword = generatePassword();
            const passwordHash = await bcrypt.hash(newPassword, 10);

            await sql`
                UPDATE staff_users SET
                    password_hash = ${passwordHash},
                    primo_accesso = true
                WHERE id = ${userId}
            `;

            const [user] = await sql`SELECT username, nome, cognome, email FROM staff_users WHERE id = ${userId}`;

            // Log audit
            await sql`
                INSERT INTO audit_log (user_id, username, nome_completo, azione, entita, entita_id)
                VALUES (
                    ${adminUserId}, ${admin.username}, ${admin.nome} || ' ' || ${admin.cognome},
                    'RESET_PASSWORD', 'staff_user', ${userId}
                )
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    user: user,
                    credentials: {
                        username: user.username,
                        password: newPassword
                    }
                })
            };
        }

        // ==================== ELIMINA UTENTE ====================
        if (action === 'delete') {
            const { userId } = data;

            // Non permettere di eliminare se stesso
            if (userId === adminUserId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Non puoi eliminare il tuo account' })
                };
            }

            await sql`DELETE FROM staff_users WHERE id = ${userId}`;

            // Log audit
            await sql`
                INSERT INTO audit_log (user_id, username, nome_completo, azione, entita, entita_id)
                VALUES (
                    ${adminUserId}, ${admin.username}, ${admin.nome} || ' ' || ${admin.cognome},
                    'DELETE_USER', 'staff_user', ${userId}
                )
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Utente eliminato' })
            };
        }

        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: 'Azione non valida' })
        };

    } catch (error) {
        console.error('Errore manage-users:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};