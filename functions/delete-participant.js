// functions/delete-participant.js
const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    const { id } = JSON.parse(event.body);

    // Elimina partecipante
    const result = await sql`
      DELETE FROM participants 
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          error: 'Partecipante non trovato'
        })
      };
    }

    console.log('✅ Partecipante eliminato:', result[0].email);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Partecipante eliminato'
      })
    };

  } catch (error) {
    console.error('❌ Errore eliminazione:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
