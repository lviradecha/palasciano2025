// netlify/functions/change-password.js
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
        const { userId, newPassword } = JSON.parse(event.body);

        if (!userId || !newPassword) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Dati mancanti' })
            };
        }

        if (newPassword.length < 8) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Password troppo corta' })
            };
        }

        const sql = neon(process.env.NETLIFY_DATABASE_URL);

        // Hash nuova password
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Aggiorna password e disattiva primo_accesso
        await sql`
            UPDATE staff_users 
            SET password_hash = ${passwordHash}, primo_accesso = false 
            WHERE id = ${userId}
        `;

        // Log audit
        const [user] = await sql`SELECT username, nome, cognome FROM staff_users WHERE id = ${userId}`;
        
        await sql`
            INSERT INTO audit_log (user_id, username, nome_completo, azione, ip_address)
            VALUES (
                ${userId},
                ${user.username},
                ${user.nome} || ' ' || ${user.cognome},
                'CHANGE_PASSWORD',
                ${event.headers['x-forwarded-for'] || 'unknown'}
            )
        `;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Password cambiata con successo' })
        };

    } catch (error) {
        console.error('Errore change-password:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};