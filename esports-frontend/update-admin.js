require('dotenv').config();
const db = require('./db');

async function makeAdmin() {
    try {
        const [result] = await db.execute(
            "UPDATE Users SET role = 'admin' WHERE username = ?",
            ['esports_director']
        );
        
        if (result.affectedRows > 0) {
            console.log("Success! 'esports_director' is now officially an admin in the database.");
        } else {
            console.log("User 'esports_director' not found in database.");
        }
    } catch (error) {
        console.error("Database error:", error);
    } 
    process.exit();
}

makeAdmin();