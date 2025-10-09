// netlify/functions/auth-login.js
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');

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
        const { username, password } = JSON.parse(event.body);

        if (!username || !password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Username e password richiesti' })
            };
        }

        const sql = neon(process.env.NETLIFY_DATABASE_URL);

        // Cerca utente
        const users = await sql`
            SELECT * FROM staff_users 
            WHERE username = ${username.toLowerCase()} 
            AND attivo = true
            LIMIT 1
        `;

        if (users.length === 0) {
            // Log tentativo fallito
            await sql`
                INSERT INTO audit_log (username, azione, dettagli, ip_address)
                VALUES (
                    ${username}, 
                    'LOGIN_FAILED', 
                    ${JSON.stringify({ reason: 'user_not_found' })},
                    ${event.headers['x-forwarded-for'] || 'unknown'}
                )
            `;

            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Username o password errati' 
                })
            };
        }

        const user = users[0];

        // Verifica password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            // Log tentativo fallito
            await sql`
                INSERT INTO audit_log (user_id, username, nome_completo, azione, dettagli, ip_address)
                VALUES (
                    ${user.id},
                    ${user.username}, 
                    ${user.nome} || ' ' || ${user.cognome},
                    'LOGIN_FAILED', 
                    ${JSON.stringify({ reason: 'wrong_password' })},
                    ${event.headers['x-forwarded-for'] || 'unknown'}
                )
            `;

            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Username o password errati' 
                })
            };
        }

        // Aggiorna ultimo accesso
        await sql`
            UPDATE staff_users 
            SET data_ultimo_accesso = NOW() 
            WHERE id = ${user.id}
        `;

        // Log successo
        await sql`
            INSERT INTO audit_log (user_id, username, nome_completo, azione, ip_address)
            VALUES (
                ${user.id},
                ${user.username}, 
                ${user.nome} || ' ' || ${user.cognome},
                'LOGIN_SUCCESS',
                ${event.headers['x-forwarded-for'] || 'unknown'}
            )
        `;

        // Ritorna dati utente (senza password)
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    nome: user.nome,
                    cognome: user.cognome,
                    email: user.email,
                    ruolo: user.ruolo,
                    primoAccesso: user.primo_accesso
                },
                message: 'Login effettuato con successo'
            })
        };

    } catch (error) {
        console.error('Errore login:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};