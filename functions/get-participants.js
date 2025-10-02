// functions/get-participants.js
const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Recupera tutti i partecipanti
    const participants = await sql`
      SELECT * FROM participants 
      ORDER BY created_at DESC
    `;

    console.log('✅ Recuperati', participants.length, 'partecipanti');

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        participants: participants
      })
    };

  } catch (error) {
    console.error('❌ Errore recupero dati:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};