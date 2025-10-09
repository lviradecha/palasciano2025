// generate-admin-hash.js
// Esegui: node generate-admin-hash.js

const bcrypt = require('bcryptjs');

async function generateHash() {
    const password = 'palasciano2025admin'; // Password admin iniziale
    const hash = await bcrypt.hash(password, 10);
    
    console.log('\n===========================================');
    console.log('HASH PASSWORD ADMIN GENERATO:');
    console.log('===========================================');
    console.log(`Password: ${password}`);
    console.log(`Hash: ${hash}`);
    console.log('===========================================\n');
    console.log('COPIA QUESTO HASH nello schema SQL dove dice:');
    console.log("'$2b$10$YourBcryptHashHere'");
    console.log('\nSostituisci con:');
    console.log(`'${hash}'`);
    console.log('===========================================\n');
}

generateHash();