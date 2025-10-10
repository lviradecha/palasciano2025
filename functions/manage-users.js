const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');

function generatePassword(length = 12) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
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

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { action, adminUserId } = body;

        if (!adminUserId) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, error: 'Admin ID mancante' })
            };
        }

        const sql = neon(process.env.NETLIFY_DATABASE_URL);

// ✅ IMPOSTA TIMEZONE ITALIANA
await sql`SET TIME ZONE 'Europe/Rome'`;

// Verifica che l'admin esista
const adminUser = await sql`SELECT * FROM staff_users WHERE id = ${adminUserId} LIMIT 1`;
        if (adminUser.length === 0) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ success: false, error: 'Utente non autorizzato' })
            };
        }

        // ========== LIST ==========
        if (action === 'list') {
            if (adminUser[0].ruolo !== 'ADMIN') {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Non autorizzato' })
                };
            }

            const users = await sql`
                SELECT id, username, nome, cognome, email, ruolo, attivo, primo_accesso, 
                       data_creazione, data_ultimo_accesso, note
                FROM staff_users
                ORDER BY data_creazione DESC
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, users })
            };
        }

        // ========== CREATE ==========
        if (action === 'create') {
            if (adminUser[0].ruolo !== 'ADMIN') {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Non autorizzato' })
                };
            }

            const { username, nome, cognome, email, ruolo, note } = body;

            // Verifica che username non esista già
            const existing = await sql`SELECT id FROM staff_users WHERE username = ${username} LIMIT 1`;
            if (existing.length > 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Username già esistente' })
                };
            }

            // Genera password casuale
            const plainPassword = generatePassword(12);
            const hashedPassword = await bcrypt.hash(plainPassword, 10);

            // Crea utente
            const newUser = await sql`
                INSERT INTO staff_users (username, password_hash, nome, cognome, email, ruolo, attivo, primo_accesso, note)
                VALUES (${username}, ${hashedPassword}, ${nome}, ${cognome}, ${email}, ${ruolo}, true, true, ${note || ''})
                RETURNING id, username, nome, cognome, email, ruolo, data_creazione
            `;

            // Log audit
            await sql`
                INSERT INTO audit_log (user_id, username, nome_completo, azione, dettagli, ip_address)
                VALUES (
                    ${adminUserId},
                    ${adminUser[0].username},
                    ${adminUser[0].nome + ' ' + adminUser[0].cognome},
                    'CREATE_USER',
                    ${JSON.stringify({ new_user_id: newUser[0].id, username, ruolo })},
                    ${event.headers['x-forwarded-for'] || 'unknown'}
                )
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    user: newUser[0],
                    credentials: { username, password: plainPassword }
                })
            };
        }

        // ========== UPDATE ==========
        if (action === 'update') {
            if (adminUser[0].ruolo !== 'ADMIN') {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Non autorizzato' })
                };
            }

            const { userId, attivo, note } = body;

            await sql`
                UPDATE staff_users 
                SET attivo = ${attivo}, note = ${note || ''}
                WHERE id = ${userId}
            `;

            await sql`
                INSERT INTO audit_log (user_id, username, nome_completo, azione, dettagli, ip_address)
                VALUES (
                    ${adminUserId},
                    ${adminUser[0].username},
                    ${adminUser[0].nome + ' ' + adminUser[0].cognome},
                    'UPDATE_USER',
                    ${JSON.stringify({ updated_user_id: userId, attivo })},
                    ${event.headers['x-forwarded-for'] || 'unknown'}
                )
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }

        // ========== DELETE ==========
        if (action === 'delete') {
            if (adminUser[0].ruolo !== 'ADMIN') {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Non autorizzato' })
                };
            }

            const { userId } = body;

            // Non permettere di cancellare se stesso
            if (userId === adminUserId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Non puoi cancellare il tuo account' })
                };
            }

            // Elimina utente
            await sql`DELETE FROM staff_users WHERE id = ${userId}`;

            // Log audit
            await sql`
                INSERT INTO audit_log (user_id, username, nome_completo, azione, dettagli, ip_address)
                VALUES (
                    ${adminUserId},
                    ${adminUser[0].username},
                    ${adminUser[0].nome + ' ' + adminUser[0].cognome},
                    'DELETE_USER',
                    ${JSON.stringify({ deleted_user_id: userId })},
                    ${event.headers['x-forwarded-for'] || 'unknown'}
                )
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Utente eliminato' })
            };
        }

        // ========== RESET PASSWORD ==========
        if (action === 'reset_password') {
            if (adminUser[0].ruolo !== 'ADMIN') {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Non autorizzato' })
                };
            }

            const { userId } = body;

            const userToReset = await sql`SELECT * FROM staff_users WHERE id = ${userId} LIMIT 1`;
            if (userToReset.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Utente non trovato' })
                };
            }

            const newPassword = generatePassword(12);
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            await sql`
                UPDATE staff_users 
                SET password_hash = ${hashedPassword}, primo_accesso = true
                WHERE id = ${userId}
            `;

            await sql`
                INSERT INTO audit_log (user_id, username, nome_completo, azione, dettagli, ip_address)
                VALUES (
                    ${adminUserId},
                    ${adminUser[0].username},
                    ${adminUser[0].nome + ' ' + adminUser[0].cognome},
                    'RESET_PASSWORD',
                    ${JSON.stringify({ reset_user_id: userId })},
                    ${event.headers['x-forwarded-for'] || 'unknown'}
                )
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    user: userToReset[0],
                    credentials: { username: userToReset[0].username, password: newPassword }
                })
            };
        }

        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: 'Azione non valida' })
        };

    } catch (error) {
        console.error('❌ Errore manage-users:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};